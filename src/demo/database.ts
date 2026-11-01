import type { PGliteInterface, Transaction } from "@electric-sql/pglite";
import baseline from "../../database/migrations/0001_local.sql?raw";
import integrity from "../../database/migrations/0002_billing_integrity.sql?raw";
import sampleData from "../../database/demo.sql?raw";
import { hashDemoPassword } from "./password";

async function seed(tx: Transaction) {
  const password = await hashDemoPassword("LocalDemo123!");
  for (const [role, name] of [
    ["admin", "Alex Morgan"],
    ["staff", "Sam Rivera"],
    ["customer", "Demo Customer"],
  ]) {
    const {
      rows: [user],
    } = await tx.query<{ id: string }>(
      "INSERT INTO private.users(email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [`${role}@subscriptiq.local`, name, password],
    );
    await tx.query("INSERT INTO user_roles(user_id, role) VALUES ($1, $2)", [user!.id, role]);
  }
  await tx.exec(sampleData);
  await tx.exec(
    "UPDATE public.customers SET user_id = (SELECT id FROM private.users WHERE email = 'customer@subscriptiq.local') WHERE email = 'customer@subscriptiq.local'",
  );
  await tx.exec(
    "INSERT INTO private.browser_state(id, user_id) SELECT true, id FROM private.users WHERE email = 'admin@subscriptiq.local'",
  );
  await tx.exec("INSERT INTO public.app_migrations(name, checksum) VALUES ('demo-v1', '1')");
}

export async function prepareBrowserDatabase(database: PGliteInterface) {
  const migrations = await Promise.all(
    [
      ["0001_local.sql", baseline],
      ["0002_billing_integrity.sql", integrity],
    ].map(async ([name, sql]) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql!));
      return {
        name: name!,
        sql: sql!,
        checksum: [...new Uint8Array(digest)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join(""),
      };
    }),
  );
  await database.transaction(async (tx) => {
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS public.app_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const migration of migrations) {
      const {
        rows: [applied],
      } = await tx.query<{ checksum: string }>(
        "SELECT checksum FROM public.app_migrations WHERE name = $1",
        [migration.name],
      );
      if (applied) {
        if (applied.checksum !== migration.checksum)
          throw new Error(
            "This demo needs a fresh browser database. Clear this site's stored data and reload.",
          );
      } else {
        await tx.exec(migration.sql);
        await tx.query("INSERT INTO public.app_migrations(name, checksum) VALUES ($1, $2)", [
          migration.name,
          migration.checksum,
        ]);
      }
    }
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS private.browser_state(id boolean PRIMARY KEY DEFAULT true CHECK(id), user_id uuid REFERENCES private.users(id) ON DELETE CASCADE)",
    );
    if (
      !(await tx.query("SELECT name FROM public.app_migrations WHERE name = 'demo-v1'")).rows.length
    )
      await seed(tx);
  });
}

export async function resetBrowserDatabase(database: PGliteInterface) {
  await database.transaction(async (tx) => {
    await tx.exec(
      "TRUNCATE private.users, public.customers, public.products, public.plans, public.discounts, public.subscriptions CASCADE",
    );
    await tx.exec(
      "ALTER SEQUENCE public.subscription_seq RESTART WITH 1001; ALTER SEQUENCE public.invoice_seq RESTART WITH 5001",
    );
    await tx.exec("DELETE FROM public.app_migrations WHERE name = 'demo-v1'");
    await seed(tx);
  });
}
