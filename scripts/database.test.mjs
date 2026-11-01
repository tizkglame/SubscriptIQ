import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { migrate } from "../server/database.mjs";

// Create and drop only our own disposable database; never migrate the supplied DB.
const connection = process.env.TEST_DATABASE_URL;
if (!connection)
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL server with CREATEDB permission",
  );
const admin = postgres(connection, { max: 1 });
const database = `subscriptiq_test_${randomUUID().replaceAll("-", "")}`;
let sql;
const staff = randomUUID();
const customerUser = randomUUID();
const otherUser = randomUUID();
let customer, plan, product;

before(async () => {
  await admin.unsafe(`CREATE DATABASE "${database}"`);
  const url = new URL(connection);
  url.pathname = `/${database}`;
  sql = postgres(url.toString(), { max: 6, onnotice: () => {} });
  await migrate(sql);
  await sql`INSERT INTO private.users(id, email, full_name, password_hash) VALUES (${staff}, 'staff@test.invalid', 'Staff', 'unused'),
    (${customerUser}, 'customer@test.invalid', 'Customer', 'unused'), (${otherUser}, 'other@test.invalid', 'Other', 'unused')`;
  await sql`INSERT INTO user_roles(user_id, role) VALUES (${staff}, 'staff')`;
  [customer] =
    await sql`INSERT INTO customers(name, email, user_id) VALUES ('Test', 'test@test.invalid', ${customerUser}) RETURNING *`;
  [plan] =
    await sql`INSERT INTO plans(name, billing_period) VALUES ('Test monthly', 'monthly') RETURNING *`;
  [product] =
    await sql`INSERT INTO products(name, sales_price) VALUES ('Test product', 100) RETURNING *`;
});
after(async () => {
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
});

function asUser(id, fn) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`;
    await tx`SELECT set_config('app.user_id', ${id}, true)`;
    return fn(tx);
  });
}
async function subscription(overrides = {}) {
  const [{ today }] = await sql`SELECT current_date::text AS today`;
  const data = {
    customer_id: customer.id,
    plan_id: plan.id,
    status: "active",
    start_date: today,
    payment_terms_days: 15,
    tax_rate: 0,
    ...overrides,
  };
  const lines = [{ product_id: product.id, variant_id: null, quantity: 1, unit_price: 100 }];
  const [{ id }] = await asUser(
    staff,
    (tx) => tx`SELECT save_subscription(null, ${tx.json(data)}, ${tx.json(lines)}) AS id`,
  );
  return { id, data, lines };
}
async function invoice() {
  const sub = await subscription();
  const [{ id }] =
    await sql`SELECT _bill_subscription(${sub.id}, current_date, current_date) AS id`;
  return id;
}

test("RLS isolates customer invoices and rejects customer writes and internal billing calls", async () => {
  const id = await invoice();
  assert.equal(
    (await asUser(customerUser, (tx) => tx`SELECT id FROM invoices WHERE id = ${id}`)).length,
    1,
  );
  assert.equal(
    (await asUser(otherUser, (tx) => tx`SELECT id FROM invoices WHERE id = ${id}`)).length,
    0,
  );
  await assert.rejects(
    asUser(customerUser, (tx) => tx`INSERT INTO payments(invoice_id, amount) VALUES (${id}, 10)`),
  );
  await assert.rejects(
    asUser(customerUser, (tx) => tx`SELECT run_billing()`),
    /Not authorized/,
  );
  await assert.rejects(
    asUser(
      customerUser,
      (tx) => tx`SELECT _bill_subscription(${randomUUID()}, current_date, current_date)`,
    ),
    /permission denied/,
  );
  await assert.rejects(
    asUser(customerUser, (tx) => tx`SELECT save_product(null, '{}'::jsonb, '[]'::jsonb)`),
    /Not authorized/,
  );
});

test("staff can atomically replace subscription lines and failure preserves previous data", async () => {
  const sub = await subscription();
  const updated = [{ ...sub.lines[0], quantity: 2 }];
  await asUser(
    staff,
    (tx) => tx`SELECT save_subscription(${sub.id}, ${tx.json(sub.data)}, ${tx.json(updated)})`,
  );
  assert.equal(
    (await sql`SELECT quantity FROM subscription_lines WHERE subscription_id = ${sub.id}`)[0]
      .quantity,
    2,
  );
  const bad = [{ ...sub.lines[0], product_id: randomUUID() }];
  await assert.rejects(
    asUser(
      staff,
      (tx) =>
        tx`SELECT save_subscription(${sub.id}, ${tx.json({ ...sub.data, notes: "must roll back" })}, ${tx.json(bad)})`,
    ),
  );
  assert.equal((await sql`SELECT notes FROM subscriptions WHERE id = ${sub.id}`)[0].notes, null);
  assert.equal(
    (await sql`SELECT quantity FROM subscription_lines WHERE subscription_id = ${sub.id}`)[0]
      .quantity,
    2,
  );
  await assert.rejects(
    asUser(staff, (tx) => tx`UPDATE subscriptions SET status = 'closed' WHERE id = ${sub.id}`),
    /permission denied/,
  );
});

test("variant updates enforce ownership and failed product saves roll back", async () => {
  const [variant] =
    await sql`INSERT INTO product_variants(product_id, name, extra_price) VALUES (${product.id}, 'Original', 0) RETURNING *`;
  const payload = { name: "Changed", type: "software", sales_price: 100, cost_price: 0 };
  await assert.rejects(
    asUser(
      staff,
      (tx) =>
        tx`SELECT save_product(${product.id}, ${tx.json(payload)}, ${tx.json([{ id: randomUUID(), name: "Bad", extra_price: 0 }])})`,
    ),
    /Variant does not belong/,
  );
  assert.equal(
    (await sql`SELECT name FROM products WHERE id = ${product.id}`)[0].name,
    "Test product",
  );
  assert.equal((await sql`SELECT id FROM product_variants WHERE id = ${variant.id}`).length, 1);
  await asUser(
    staff,
    (tx) => tx`SELECT save_product(${product.id}, ${tx.json(payload)}, '[]'::jsonb)`,
  );
  assert.equal((await sql`SELECT id FROM product_variants WHERE id = ${variant.id}`).length, 0);
});

test("payment status tracks inserts/deletes and payments cannot be moved or cancelled away", async () => {
  const id = await invoice();
  const another = await invoice();
  const [payment] = await asUser(
    staff,
    (tx) => tx`INSERT INTO payments(invoice_id, amount) VALUES (${id}, 100) RETURNING id`,
  );
  assert.equal((await sql`SELECT status FROM invoices WHERE id = ${id}`)[0].status, "paid");
  await assert.rejects(
    asUser(staff, (tx) => tx`UPDATE payments SET invoice_id = ${another} WHERE id = ${payment.id}`),
    /cannot be moved/,
  );
  await assert.rejects(
    asUser(staff, (tx) => tx`UPDATE invoices SET status = 'cancelled' WHERE id = ${id}`),
    /recorded payments/,
  );
  await sql`DELETE FROM payments WHERE id = ${payment.id}`;
  assert.equal((await sql`SELECT status FROM invoices WHERE id = ${id}`)[0].status, "confirmed");
  await assert.rejects(
    asUser(staff, (tx) => tx`UPDATE invoices SET status = 'paid' WHERE id = ${id}`),
    /balance is settled/,
  );
});

test("concurrent payments cannot exceed the invoice balance", async () => {
  const id = await invoice();
  const results = await Promise.allSettled(
    [60, 60].map((amount) =>
      asUser(staff, (tx) => tx`INSERT INTO payments(invoice_id, amount) VALUES (${id}, ${amount})`),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    Number((await sql`SELECT sum(amount) AS paid FROM payments WHERE invoice_id = ${id}`)[0].paid),
    60,
  );
});

test("billing catches missed periods, anchors month ends, and is idempotent", async () => {
  const [{ start }] =
    await sql`SELECT (date_trunc('month', current_date) - interval '2 months')::date::text AS start`;
  const sub = await subscription({ start_date: start });
  await asUser(staff, (tx) => tx`SELECT run_billing()`);
  assert.equal((await sql`SELECT id FROM invoices WHERE subscription_id = ${sub.id}`).length, 3);
  const [{ generated }] = await asUser(staff, (tx) => tx`SELECT run_billing() AS generated`);
  assert.equal(generated, 0);
  const [dates] = await sql`SELECT billing_boundary('2024-01-31', 'monthly', 2)::text AS march,
    billing_boundary('2024-02-29', 'yearly', 4)::text AS leap`;
  assert.equal(dates.march, "2024-03-31");
  assert.equal(dates.leap, "2028-02-29");
});

test("discount caps, line validation, plan lifecycle and date rules are enforced", async () => {
  await assert.rejects(
    sql`INSERT INTO discounts(code, name, type, value) VALUES ('BAD', 'Bad', 'percentage', 101)`,
  );
  await assert.rejects(
    sql`INSERT INTO discounts(code, name, value, usage_limit) VALUES ('BAD2', 'Bad', 1, -1)`,
  );
  const sub = await subscription();
  await assert.rejects(
    asUser(
      staff,
      (tx) => tx`SELECT save_subscription(${sub.id}, ${tx.json(sub.data)}, '[]'::jsonb)`,
    ),
    /at least one/,
  );
  await sql`UPDATE plans SET pausable = false WHERE id = ${plan.id}`;
  await assert.rejects(
    asUser(
      staff,
      (tx) =>
        tx`SELECT save_subscription(${sub.id}, ${tx.json({ ...sub.data, status: "paused" })}, ${tx.json(sub.lines)})`,
    ),
    /cannot be paused/,
  );
});

test("product costs remain staff-only", async () => {
  assert.equal((await asUser(otherUser, (tx) => tx`SELECT id FROM products`)).length, 0);
  assert.ok(
    (await asUser(customerUser, (tx) => tx`SELECT id, name FROM products`)).some(
      (p) => p.id === product.id,
    ),
  );
  await assert.rejects(
    asUser(customerUser, (tx) => tx`SELECT cost_price FROM products`),
    /permission denied/,
  );
  await assert.rejects(
    asUser(customerUser, (tx) => tx`SELECT list_products()`),
    /Not authorized/,
  );
  const [{ catalog }] = await asUser(staff, (tx) => tx`SELECT list_products() AS catalog`);
  assert.ok(catalog.some((p) => p.id === product.id && p.cost_price === 0));
});

test("shared discount limits survive concurrent billing and free invoices never become negative", async () => {
  const [discount] =
    await sql`INSERT INTO discounts(code, name, value, usage_limit) VALUES ('ONE', 'One use', 100, 1) RETURNING id`;
  const a = await subscription({ discount_id: discount.id });
  const b = await subscription({ discount_id: discount.id });
  await Promise.all(
    [a, b].map((sub) => sql`SELECT _bill_subscription(${sub.id}, current_date, current_date)`),
  );
  const invoices =
    await sql`SELECT total FROM invoices WHERE subscription_id IN (${a.id}, ${b.id}) ORDER BY total`;
  assert.deepEqual(
    invoices.map((i) => Number(i.total)),
    [0, 100],
  );
  assert.equal(
    (await sql`SELECT used_count FROM discounts WHERE id = ${discount.id}`)[0].used_count,
    1,
  );
});

test("anchored billing rejects overlaps with legacy drifted invoice periods", async () => {
  const sub = await subscription({ start_date: "2026-01-31" });
  await sql`INSERT INTO invoices(subscription_id, customer_id, period_start, period_end, issue_date, due_date, subtotal, total)
    VALUES (${sub.id}, ${customer.id}, '2026-03-28', '2026-04-27', '2026-03-28', '2026-04-12', 100, 100)`;
  await assert.rejects(
    sql`SELECT _bill_subscription(${sub.id}, '2026-03-31', '2026-03-31')`,
    /Reconcile historical invoices/,
  );
  assert.equal((await sql`SELECT id FROM invoices WHERE subscription_id = ${sub.id}`).length, 1);
});
