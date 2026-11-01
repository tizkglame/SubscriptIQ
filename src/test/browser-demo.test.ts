// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { prepareBrowserDatabase, resetBrowserDatabase } from "../demo/database";
import { createDemoService } from "../demo/service";
import type { Session } from "../lib/api";

type Row = {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  total: number;
  status: string;
  customer_id: string;
  cost_price: number;
  product_variants: { id: string; name: string }[];
  invoice_lines: { description: string }[];
  plans: { name: string };
};
let database: PGlite;
let request: ReturnType<typeof createDemoService>;
const login = (role: string, password = "LocalDemo123!") =>
  request("/auth/login", {
    email: role.includes("@") ? role : `${role}@subscriptiq.local`,
    password,
  });
async function query(input: unknown) {
  return (await request("/query", input)) as Row[];
}
async function rpc(name: string, args: unknown = {}) {
  return request("/rpc", { name, args });
}

beforeAll(async () => {
  database = await PGlite.create();
  await prepareBrowserDatabase(database);
  request = createDemoService(database);
}, 30000);
afterAll(async () => {
  await database?.close();
});
beforeEach(async () => {
  await login("admin");
});

describe("GitHub Pages browser workspace", () => {
  it("initializes the real schema once and opens the sample admin workspace", async () => {
    await prepareBrowserDatabase(database);
    expect(((await request("/auth/session")) as Session).role).toBe("admin");
    expect(await query({ table: "customers" })).toHaveLength(10);
    expect((await query({ table: "invoices" })).length).toBeGreaterThan(0);
    expect(await query({ table: "profiles" })).toHaveLength(3);
  });

  it("renders nested subscription, invoice and payment data with the existing query handlers", async () => {
    const subs = await query({
      table: "subscriptions",
      select:
        "*,customers(name),plans(name),discounts(*),subscription_lines(*,products(name,type))",
    });
    expect(subs[0]!.plans.name).toBeTruthy();
    const invoices = await query({
      table: "invoices",
      select: "*,customers(*),subscriptions(number),invoice_lines(*),payments(*)",
    });
    expect(invoices[0]!.invoice_lines.length).toBeGreaterThan(0);
    expect(
      await query({
        table: "payments",
        select: "id,amount,invoices(number,customers(name))",
        limit: 5,
      }),
    ).toHaveLength(5);
  });

  it("supports catalog edits and rolls back a failed variant replacement", async () => {
    const id = await rpc("save_product", {
      _id: null,
      _data: { name: "Browser product", type: "service", sales_price: 100, cost_price: 10 },
      _variants: [{ name: "Pro", extra_price: 20 }],
    });
    await expect(
      rpc("save_product", {
        _id: id,
        _data: { name: "Must roll back", type: "service", sales_price: 100, cost_price: 10 },
        _variants: [{ id: crypto.randomUUID(), name: "Invalid", extra_price: 0 }],
      }),
    ).rejects.toThrow("Variant does not belong");
    const catalog = (await rpc("list_products")) as Row[];
    const saved = catalog.find((product) => product.id === id)!;
    expect(saved.name).toBe("Browser product");
    expect(saved.product_variants[0]!.name).toBe("Pro");
  });

  it("creates and updates customers, plans and discounts", async () => {
    for (const [table, data] of [
      ["customers", { name: "Browser customer", email: "browser@example.test" }],
      ["plans", { name: "Browser plan", billing_period: "monthly", min_quantity: 1 }],
      ["discounts", { name: "Browser discount", code: "BROWSER", type: "percentage", value: 10 }],
    ] as const) {
      await request("/query", { table, operation: "insert", data });
      const row = (await query({ table, filters: [{ column: "name", value: data.name }] }))[0]!;
      await request("/query", {
        table,
        operation: "update",
        filters: [{ column: "id", value: row.id }],
        data: { name: `Edited ${data.name}` },
      });
      expect((await query({ table, filters: [{ column: "id", value: row.id }] }))[0]!.name).toBe(
        `Edited ${data.name}`,
      );
      await request("/query", {
        table,
        operation: "delete",
        filters: [{ column: "id", value: row.id }],
      });
    }
  });

  it("runs real subscription billing and rejects an overpayment", async () => {
    const customer = (await query({ table: "customers" }))[0]!;
    const plan = (
      await query({ table: "plans", filters: [{ column: "name", value: "Starter Monthly" }] })
    )[0]!;
    const product = ((await rpc("list_products")) as Row[])[0]!;
    const today = new Date().toISOString().slice(0, 10);
    const id = await rpc("save_subscription", {
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
        notes: "Browser test",
      },
      _lines: [{ product_id: product.id, variant_id: null, quantity: 1, unit_price: 100 }],
    });
    expect(await rpc("run_billing")).toBeGreaterThan(0);
    expect(await rpc("run_billing")).toBe(0);
    const invoice = (
      await query({ table: "invoices", filters: [{ column: "subscription_id", value: id }] })
    )[0]!;
    expect(invoice.total).toBe(100);
    await request("/query", {
      table: "payments",
      operation: "insert",
      data: { invoice_id: invoice.id, amount: 100, paid_on: today, method: "cash", is_demo: true },
    });
    await expect(
      request("/query", {
        table: "payments",
        operation: "insert",
        data: { invoice_id: invoice.id, amount: 1 },
      }),
    ).rejects.toThrow("outstanding balance");
    expect(
      (await query({ table: "invoices", filters: [{ column: "id", value: invoice.id }] }))[0]!
        .status,
    ).toBe("paid");
  });

  it("demonstrates staff and customer permissions, including nested row isolation", async () => {
    await login("staff");
    await expect(
      request("/accounts", {
        email: "blocked@example.test",
        fullName: "Blocked",
        role: "admin",
        password: "Preview123!",
      }),
    ).rejects.toThrow("Only admins");
    await login("customer");
    const session = (await request("/auth/session")) as Session;
    const own = await query({ table: "customers" });
    expect(own).toHaveLength(1);
    expect(own[0]!.user_id).toBe(session.user.id);
    const invoices = await query({
      table: "invoices",
      select: "*,customers(name),payments(*),invoice_lines(*)",
    });
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices.every((invoice) => invoice.customer_id === own[0]!.id)).toBe(true);
    await expect(query({ table: "products", select: "cost_price" })).rejects.toThrow(
      "Unknown field",
    );
    await expect(rpc("list_products")).rejects.toThrow("permission");
    await expect(
      request("/query", {
        table: "customers",
        operation: "insert",
        data: { name: "No", email: "no@example.test" },
      }),
    ).rejects.toThrow("permission");
  });

  it("creates preview team accounts and explicitly linked customer portals", async () => {
    await request("/accounts", {
      email: "new.staff@example.test",
      fullName: "Preview Staff",
      password: "Preview123!",
      role: "staff",
    });
    await login("new.staff@example.test", "Preview123!");
    expect(((await request("/auth/session")) as Session).role).toBe("staff");
    await login("admin");
    await request("/query", {
      table: "customers",
      operation: "insert",
      data: { name: "Portal", email: "portal@example.test" },
    });
    const customer = (
      await query({
        table: "customers",
        filters: [{ column: "email", value: "portal@example.test" }],
      })
    )[0]!;
    await request("/customer-accounts", { customerId: customer.id, password: "Preview123!" });
    await expect(
      request("/customer-accounts", { customerId: customer.id, password: "Preview123!" }),
    ).rejects.toThrow("already has portal access");
    await login("portal@example.test", "Preview123!");
    expect((await query({ table: "customers" })).map((row) => row.id)).toEqual([customer.id]);
  });

  it("retains records and the selected role when the service reconnects", async () => {
    await login("staff");
    request = createDemoService(database);
    await prepareBrowserDatabase(database);
    expect(((await request("/auth/session")) as Session).role).toBe("staff");
    expect(
      await query({
        table: "customers",
        filters: [{ column: "email", value: "portal@example.test" }],
      }),
    ).toHaveLength(1);
  });

  it("signs out and rejects invalid credentials or malformed queries", async () => {
    await expect(query({ table: "private.users" })).rejects.toThrow();
    await expect(
      query({ table: "customers", select: "id);drop table customers;--" }),
    ).rejects.toThrow("Invalid");
    await request("/auth/logout", {});
    expect(await request("/auth/session")).toBeNull();
    await expect(query({ table: "customers" })).rejects.toThrow("Please sign in");
    await expect(login("admin", "wrong")).rejects.toThrow("Invalid email or password");
  });

  it("resets only the demo database back to the original sample workspace", async () => {
    await resetBrowserDatabase(database);
    expect(((await request("/auth/session")) as Session).role).toBe("admin");
    expect(await query({ table: "customers" })).toHaveLength(10);
    expect(await query({ table: "profiles" })).toHaveLength(3);
    expect(
      ((await rpc("list_products")) as Row[]).some((product) => product.name === "Browser product"),
    ).toBe(false);
  });
});
