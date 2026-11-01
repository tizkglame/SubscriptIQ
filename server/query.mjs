import { z } from "zod";
import { asUser } from "./database.mjs";
import { ApiError } from "./security.mjs";

// Column names and joins are application metadata, never arbitrary SQL input.
export const columns = {
  customers: "id name email phone company address user_id created_at",
  products: "id name type sales_price created_at",
  product_variants: "id product_id name extra_price",
  plans:
    "id name billing_period min_quantity start_date end_date auto_close closable pausable renewable created_at",
  discounts: "id code name type value expires_on usage_limit used_count active created_at",
  subscriptions:
    "id number customer_id plan_id status start_date expiry_date payment_terms_days tax_rate discount_id notes created_at",
  subscription_lines: "id subscription_id product_id variant_id quantity unit_price",
  invoices:
    "id number subscription_id customer_id period_start period_end issue_date due_date subtotal discount_amount tax_amount total status created_at",
  invoice_lines: "id invoice_id description quantity unit_price amount",
  payments: "id invoice_id amount method paid_on notes is_demo created_at",
  profiles: "id email full_name created_at",
  user_roles: "id user_id role",
};
for (const table of Object.keys(columns)) columns[table] = columns[table].split(" ");

const relations = {
  products: { product_variants: ["id", "product_id", true] },
  subscriptions: {
    customers: ["customer_id", "id"],
    plans: ["plan_id", "id"],
    discounts: ["discount_id", "id"],
    subscription_lines: ["id", "subscription_id", true],
    invoices: ["id", "subscription_id", true],
  },
  subscription_lines: { products: ["product_id", "id"], product_variants: ["variant_id", "id"] },
  invoices: {
    customers: ["customer_id", "id"],
    subscriptions: ["subscription_id", "id"],
    invoice_lines: ["id", "invoice_id", true],
    payments: ["id", "invoice_id", true],
  },
  payments: { invoices: ["invoice_id", "id"] },
};
const writable = {
  customers: {
    insert: "name email phone company address",
    update: "name email phone company address",
  },
  plans: {
    insert:
      "name billing_period min_quantity start_date end_date auto_close closable pausable renewable",
    update:
      "name billing_period min_quantity start_date end_date auto_close closable pausable renewable",
  },
  discounts: {
    insert: "code name type value expires_on usage_limit active",
    update: "code name type value expires_on usage_limit active",
  },
  payments: { insert: "invoice_id amount method paid_on notes is_demo" },
  invoices: { update: "status" },
};
const deletable = new Set([
  "customers",
  "products",
  "plans",
  "discounts",
  "subscriptions",
  "invoices",
  "payments",
]);
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
const querySchema = z
  .object({
    table: z.enum(Object.keys(columns)),
    operation: z.enum(["select", "insert", "update", "delete"]).default("select"),
    select: z.string().max(2000).default("*"),
    filters: z
      .array(z.object({ column: z.string(), value: scalar }).strict())
      .max(10)
      .default([]),
    orders: z
      .array(z.object({ column: z.string(), ascending: z.boolean() }).strict())
      .max(5)
      .default([]),
    offset: z.number().int().min(0).max(10000000).default(0),
    limit: z.number().int().min(1).max(1000).default(1000),
    cardinality: z.enum(["one", "maybe"]).optional(),
    data: z.record(z.string(), scalar).optional(),
  })
  .strict();

function field(table, column, alias) {
  if (!columns[table]?.includes(column))
    throw new ApiError(400, `Unknown field ${table}.${column}`);
  return `${alias}."${column}"`;
}

function parseSelection(source) {
  const tokens = source.match(/[A-Za-z_][A-Za-z_0-9]*|\*|[(),]|\S/g) ?? [];
  let position = 0;
  function read(depth = 0) {
    if (depth > 4) throw new ApiError(400, "Too many nested relationships");
    const result = [];
    while (position < tokens.length) {
      const name = tokens[position++];
      if (!/^(?:[A-Za-z_][A-Za-z_0-9]*|\*)$/.test(name))
        throw new ApiError(400, "Invalid selection");
      let children;
      if (tokens[position] === "(") {
        position++;
        children = read(depth + 1);
        if (tokens[position++] !== ")") throw new ApiError(400, "Invalid relationship selection");
      }
      result.push({ name, children });
      if (tokens[position] !== ",") break;
      position++;
    }
    if (!result.length) throw new ApiError(400, "Empty selection");
    return result;
  }
  const result = read();
  if (position !== tokens.length) throw new ApiError(400, "Invalid selection");
  return result;
}

function projection(table, selection, alias, state = { next: 1 }) {
  const pairs = new Map();
  for (const { name, children } of selection) {
    if (children) {
      const relation = relations[table]?.[name];
      if (!relation) throw new ApiError(400, `Unknown relationship ${table}.${name}`);
      const [local, foreign, many] = relation;
      const child = `a${state.next++}`;
      const json = projection(name, children, child, state);
      const where = `${field(name, foreign, child)} = ${field(table, local, alias)}`;
      const expression = many
        ? `(SELECT coalesce(jsonb_agg(${json} ORDER BY ${child}.id), '[]'::jsonb) FROM public."${name}" ${child} WHERE ${where})`
        : `(SELECT ${json} FROM public."${name}" ${child} WHERE ${where})`;
      pairs.set(name, expression);
    } else {
      for (const column of name === "*" ? columns[table] : [name])
        pairs.set(column, field(table, column, alias));
    }
  }
  return `jsonb_build_object(${[...pairs].map(([name, expression]) => `'${name}', ${expression}`).join(", ")})`;
}

export async function executeQuery(sql, session, input) {
  const q = querySchema.parse(input);
  const table = q.table;
  return asUser(sql, session.user.id, async (tx) => {
    const params = [];
    const parameter = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where = q.filters
      .map(
        ({ column, value }) =>
          `${field(table, column, "a0")} ${value === null ? "IS NULL" : `= ${parameter(value)}`}`,
      )
      .join(" AND ");
    const predicate = where ? ` WHERE ${where}` : "";
    if (q.operation === "select") {
      const json = projection(table, parseSelection(q.select), "a0");
      const order = q.orders.length
        ? ` ORDER BY ${q.orders.map(({ column, ascending }) => `${field(table, column, "a0")} ${ascending ? "ASC" : "DESC"}`).join(", ")}`
        : " ORDER BY a0.id";
      const rows = await tx.unsafe(
        `SELECT ${json} AS record FROM public."${table}" a0${predicate}${order} LIMIT ${parameter(q.limit)} OFFSET ${parameter(q.offset)}`,
        params,
      );
      if (q.cardinality) {
        if (rows.length > 1 || (q.cardinality === "one" && !rows.length))
          throw new ApiError(404, "Record not found or not unique");
        return rows[0]?.record ?? null;
      }
      return rows.map((row) => row.record);
    }
    if (session.role === "customer")
      throw new ApiError(403, "You don't have permission for this action.");
    if (
      q.operation !== "insert" &&
      !(
        q.filters.length === 1 &&
        q.filters[0].column === "id" &&
        typeof q.filters[0].value === "string" &&
        z.uuid().safeParse(q.filters[0].value).success
      )
    )
      throw new ApiError(400, "Mutations require one record ID");
    if (q.operation === "delete") {
      if (session.role !== "admin" || !deletable.has(table))
        throw new ApiError(403, "Only admins can delete this record");
      const rows = await tx.unsafe(
        `DELETE FROM public."${table}" a0${predicate} RETURNING id`,
        params,
      );
      if (!rows.length) throw new ApiError(404, "Record not found");
      return null;
    }
    const allowed = writable[table]?.[q.operation]?.split(" ") ?? [];
    const entries = Object.entries(q.data ?? {});
    if (!entries.length || entries.some(([column]) => !allowed.includes(column)))
      throw new ApiError(400, "Invalid fields for this action");
    if (table === "invoices" && q.data.status !== "cancelled")
      throw new ApiError(400, "Only invoice cancellation is allowed");
    if (q.operation === "insert") {
      const keys = entries.map(([key]) => `"${key}"`).join(", ");
      const values = entries.map(([, value]) => parameter(value)).join(", ");
      await tx.unsafe(`INSERT INTO public."${table}" (${keys}) VALUES (${values})`, params);
    } else {
      const assignments = entries
        .map(([key, value]) => `"${key}" = ${parameter(value)}`)
        .join(", ");
      const rows = await tx.unsafe(
        `UPDATE public."${table}" a0 SET ${assignments}${predicate} RETURNING id`,
        params,
      );
      if (!rows.length) throw new ApiError(404, "Record not found");
    }
    return null;
  });
}

const rpcSchema = z
  .object({
    name: z.enum(["list_products", "save_product", "save_subscription", "run_billing"]),
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const editorSchema = (lines) =>
  z
    .object({
      _id: z.uuid().nullable(),
      _data: z.record(z.string(), z.unknown()),
      [lines]: z.array(z.record(z.string(), z.unknown())).max(100),
    })
    .strict();
export async function executeRpc(sql, session, input) {
  const { name, args } = rpcSchema.parse(input);
  if (session.role === "customer")
    throw new ApiError(403, "You don't have permission for this action.");
  return asUser(sql, session.user.id, async (tx) => {
    if (name === "list_products")
      return (await tx`SELECT public.list_products() AS result`)[0].result;
    if (name === "run_billing") return (await tx`SELECT public.run_billing() AS result`)[0].result;
    if (name === "save_product") {
      const a = editorSchema("_variants").parse(args);
      return (
        await tx`SELECT public.save_product(${a._id}, ${tx.json(a._data)}, ${tx.json(a._variants)}) AS result`
      )[0].result;
    }
    const a = editorSchema("_lines").parse(args);
    return (
      await tx`SELECT public.save_subscription(${a._id}, ${tx.json(a._data)}, ${tx.json(a._lines)}) AS result`
    )[0].result;
  });
}
