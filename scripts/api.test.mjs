import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import postgres from "postgres";
import { createDatabase, migrate, seedDemo } from "../server/database.mjs";
import { createApplication } from "../server/app.mjs";
import { hashToken } from "../server/security.mjs";

const connection = process.env.TEST_DATABASE_URL;
if (!connection)
  throw new Error("Set TEST_DATABASE_URL to a local PostgreSQL server with CREATEDB permission");
const admin = postgres(connection, { max: 1, onnotice: () => {} });
const database = `subscriptiq_api_${randomUUID().replaceAll("-", "")}`;
let sql, server, base, adminCookie, staffCookie, customerCookie;

async function start() {
  server = createApplication({ sql });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections();
  await closed;
}
async function request(
  route,
  { data, cookie, origin = base, method = data === undefined ? "GET" : "POST" } = {},
) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const content = response.headers.get("Content-Type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { status: response.status, body: content, headers: response.headers };
}
async function login(role, password = "LocalDemo123!") {
  const r = await request("/api/auth/login", {
    data: { email: role.includes("@") ? role : `${role}@subscriptiq.local`, password },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  return r.headers.get("set-cookie").split(";")[0];
}
const query = (cookie, data) => request("/api/query", { cookie, data });
const rpc = (cookie, name, args = {}) => request("/api/rpc", { cookie, data: { name, args } });

before(async () => {
  await admin.unsafe(`CREATE DATABASE "${database}"`);
  const url = new URL(connection);
  url.pathname = `/${database}`;
  sql = createDatabase(url.toString());
  await migrate(sql);
  await seedDemo(sql);
  await start();
  adminCookie = await login("admin");
  staffCookie = await login("staff");
  customerCookie = await login("customer");
});
after(async () => {
  if (server?.listening) await stop();
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.end();
});

test("health, first-run demo data and migrations are ready without keys", async () => {
  assert.equal((await request("/api/health")).body.status, "ok");
  assert.equal((await request("/api/auth/session")).body, null);
  assert.equal((await query(undefined, { table: "customers" })).status, 401);
  await migrate(sql);
  await seedDemo(sql);
  assert.equal(Number((await sql`SELECT count(*) FROM private.users`)[0].count), 3);
  const [user] = await sql`SELECT password_hash FROM private.users LIMIT 1`;
  assert.match(user.password_hash, /^scrypt:/);
  assert.ok(!user.password_hash.includes("LocalDemo123!"));
});

test("all list pages and nested detail queries return data", async () => {
  for (const table of [
    "customers",
    "plans",
    "discounts",
    "subscriptions",
    "invoices",
    "payments",
    "profiles",
    "user_roles",
  ]) {
    const r = await query(adminCookie, { table });
    assert.equal(r.status, 200, `${table}: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.length > 0, table);
  }
  const payments = await query(adminCookie, {
    table: "payments",
    select: "id,amount,paid_on,method,invoices(number,customers(name))",
    limit: 5,
  });
  assert.equal(payments.status, 200);
  assert.ok(payments.body[0].invoices.customers.name);
  const subs = await query(adminCookie, {
    table: "subscriptions",
    select:
      "*,customers(*),plans(*),discounts(*),subscription_lines(*,products(name,type)),invoices(id,number,total)",
  });
  assert.equal(subs.status, 200);
  assert.ok(subs.body[0].plans.name);
  const invoices = await query(adminCookie, {
    table: "invoices",
    select:
      "*,customers(*),subscriptions(id,number,status,payment_terms_days,tax_rate),invoice_lines(*),payments(*)",
  });
  assert.equal(invoices.status, 200);
  assert.ok(invoices.body[0].invoice_lines.length > 0);
});

test("customer sessions enforce row and column permissions on direct and nested reads", async () => {
  const session = await request("/api/auth/session", { cookie: customerCookie });
  assert.equal(session.body.role, "customer");
  const own = await query(customerCookie, {
    table: "customers",
    filters: [{ column: "user_id", value: session.body.user.id }],
    cardinality: "maybe",
  });
  assert.equal(own.status, 200);
  const invoices = await query(customerCookie, {
    table: "invoices",
    select: "*,customers(name),payments(*),invoice_lines(*)",
  });
  assert.equal(invoices.status, 200);
  assert.ok(invoices.body.length > 0);
  assert.ok(invoices.body.every((invoice) => invoice.customer_id === own.body.id));
  const other = (await query(adminCookie, { table: "invoices" })).body.find(
    (invoice) => invoice.customer_id !== own.body.id,
  );
  assert.deepEqual(
    (
      await query(customerCookie, {
        table: "invoices",
        filters: [{ column: "id", value: other.id }],
      })
    ).body,
    [],
  );
  assert.equal(
    (await query(customerCookie, { table: "products", select: "cost_price" })).status,
    400,
  );
  assert.equal(
    (
      await query(customerCookie, {
        table: "payments",
        operation: "insert",
        data: { invoice_id: other.id, amount: 10 },
      })
    ).status,
    403,
  );
  for (const name of ["list_products", "save_product", "run_billing"])
    assert.equal((await rpc(customerCookie, name)).status, 403);
});

test("the API rejects query injection, unknown fields, broad mutations and cross-site requests", async () => {
  assert.equal((await query(adminCookie, { table: "private.users" })).status, 400);
  assert.equal(
    (await query(adminCookie, { table: "customers", select: "id);drop table customers;--" }))
      .status,
    400,
  );
  assert.equal(
    (
      await query(adminCookie, {
        table: "customers",
        filters: [{ column: "id OR 1=1", value: "x" }],
      })
    ).status,
    400,
  );
  assert.equal((await query(adminCookie, { table: "customers", operation: "delete" })).status, 400);
  assert.equal(
    (
      await query(adminCookie, {
        table: "customers",
        operation: "update",
        filters: [{ column: "id", value: randomUUID() }],
        data: { user_id: randomUUID() },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/query", {
        cookie: adminCookie,
        data: { table: "customers" },
        origin: "https://other.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        data: { email: "admin@subscriptiq.local", password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/query", {
        cookie: adminCookie,
        data: { table: "customers", select: "x".repeat(110000) },
      })
    ).status,
    413,
  );
});

test("customers, plans and discounts support create, edit and admin deletion", async () => {
  for (const [table, data, update] of [
    [
      "customers",
      { name: "API customer", email: "crud@example.test" },
      { name: "Edited customer" },
    ],
    [
      "plans",
      {
        name: "API plan",
        billing_period: "monthly",
        min_quantity: 1,
        start_date: null,
        end_date: null,
        auto_close: false,
        closable: true,
        pausable: true,
        renewable: true,
      },
      { name: "Edited plan", min_quantity: 2 },
    ],
    [
      "discounts",
      {
        code: "APICRUD",
        name: "API discount",
        type: "percentage",
        value: 10,
        expires_on: null,
        usage_limit: null,
        active: true,
      },
      { name: "Edited discount", value: 15 },
    ],
  ]) {
    assert.equal(
      (await query(staffCookie, { table, operation: "insert", data })).status,
      200,
      table,
    );
    const before = await query(staffCookie, {
      table,
      filters: [{ column: "name", value: data.name }],
      cardinality: "one",
    });
    assert.equal(before.status, 200);
    const filters = [{ column: "id", value: before.body.id }];
    assert.equal(
      (await query(staffCookie, { table, operation: "update", filters, data: update })).status,
      200,
      table,
    );
    assert.equal(
      (await query(staffCookie, { table, filters, cardinality: "one" })).body.name,
      update.name,
    );
    assert.equal((await query(staffCookie, { table, operation: "delete", filters })).status, 403);
    assert.equal(
      (await query(adminCookie, { table, operation: "delete", filters })).status,
      200,
      table,
    );
    assert.deepEqual((await query(adminCookie, { table, filters })).body, []);
  }
});

test("team and customer accounts are provisioned transactionally with explicit roles", async () => {
  const data = {
    fullName: "New Staff",
    email: "NEW.STAFF@example.test",
    password: "AnotherLocal123!",
    role: "staff",
  };
  assert.equal((await request("/api/accounts", { cookie: staffCookie, data })).status, 403);
  assert.equal((await request("/api/accounts", { cookie: adminCookie, data })).status, 201);
  assert.equal((await request("/api/accounts", { cookie: adminCookie, data })).status, 409);
  const cookie = await login("new.staff@example.test", "AnotherLocal123!");
  assert.equal((await request("/api/auth/session", { cookie })).body.role, "staff");
  const [customer] =
    await sql`INSERT INTO customers(name,email) VALUES ('New customer','new.customer@example.test') RETURNING id`;
  const portal = { customerId: customer.id, password: "PortalLocal123!" };
  assert.equal(
    (await request("/api/customer-accounts", { cookie: staffCookie, data: portal })).status,
    403,
  );
  assert.equal(
    (await request("/api/customer-accounts", { cookie: adminCookie, data: portal })).status,
    201,
  );
  assert.equal(
    (await request("/api/customer-accounts", { cookie: adminCookie, data: portal })).status,
    409,
  );
  const portalCookie = await login("new.customer@example.test", "PortalLocal123!");
  const result = await query(portalCookie, { table: "customers" });
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].id, customer.id);
});

test("staff can edit catalog and subscriptions, bill idempotently and record payments", async () => {
  const product = await rpc(staffCookie, "save_product", {
    _id: null,
    _data: { name: "API product", type: "software", sales_price: 100, cost_price: 25 },
    _variants: [{ name: "Pro", extra_price: 20 }],
  });
  assert.equal(product.status, 200, JSON.stringify(product.body));
  const products = await rpc(staffCookie, "list_products");
  const saved = products.body.find((p) => p.id === product.body);
  assert.equal(saved.cost_price, 25);
  assert.equal(saved.product_variants[0].name, "Pro");
  const [customer] = await sql`SELECT id FROM customers LIMIT 1`;
  const [plan] =
    await sql`SELECT id FROM plans WHERE billing_period = 'monthly' AND min_quantity = 1 LIMIT 1`;
  const [{ today }] = await sql`SELECT current_date::text AS today`;
  const subscription = await rpc(staffCookie, "save_subscription", {
    _id: null,
    _data: {
      customer_id: customer.id,
      plan_id: plan.id,
      status: "active",
      start_date: today,
      expiry_date: null,
      payment_terms_days: 15,
      tax_rate: 0,
      discount_id: null,
      notes: "API test",
    },
    _lines: [{ product_id: saved.id, variant_id: null, quantity: 1, unit_price: 100 }],
  });
  assert.equal(subscription.status, 200, JSON.stringify(subscription.body));
  assert.equal((await rpc(staffCookie, "run_billing")).status, 200);
  assert.equal((await rpc(staffCookie, "run_billing")).body, 0);
  const invoice = (
    await query(staffCookie, {
      table: "invoices",
      filters: [{ column: "subscription_id", value: subscription.body }],
      cardinality: "one",
    })
  ).body;
  assert.equal(invoice.total, 100);
  const payment = {
    table: "payments",
    operation: "insert",
    data: {
      invoice_id: invoice.id,
      amount: 100,
      method: "bank_transfer",
      paid_on: today,
      is_demo: false,
    },
  };
  assert.equal((await query(staffCookie, payment)).status, 200);
  assert.equal((await query(staffCookie, payment)).status, 400);
  assert.equal(
    (
      await query(staffCookie, {
        table: "invoices",
        filters: [{ column: "id", value: invoice.id }],
        cardinality: "one",
      })
    ).body.status,
    "paid",
  );
  assert.equal(
    (
      await query(staffCookie, {
        table: "products",
        operation: "delete",
        filters: [{ column: "id", value: saved.id }],
      })
    ).status,
    403,
  );
});

test("sessions survive process restart, expire, and are revoked on sign-out", async () => {
  const cookie = await login("staff");
  await stop();
  await start();
  assert.equal((await request("/api/auth/session", { cookie })).body.role, "staff");
  assert.equal((await request("/api/auth/logout", { cookie, data: {} })).status, 200);
  assert.equal((await query(cookie, { table: "customers" })).status, 401);
  const expired = await login("staff");
  await sql`UPDATE private.sessions SET expires_at = now() - interval '1 second' WHERE token_hash = ${hashToken(expired.split("=")[1])}`;
  assert.equal((await query(expired, { table: "customers" })).status, 401);
  const [row] = await sql`SELECT token_hash FROM private.sessions LIMIT 1`;
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
});

test("production server serves assets and deep links with the correct MIME types", async () => {
  const html = await request("/invoices/example");
  assert.equal(html.status, 200);
  assert.match(html.body, /id="root"/);
  const asset = html.body.match(/src="([^"]+\.js)"/)[1];
  const script = await request(asset);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(script.headers.get("cache-control"), /immutable/);
  assert.equal((await request("/missing-file.js")).status, 404);
  assert.equal((await request("/%2e%2e%2fpackage.json")).status, 403);
});
