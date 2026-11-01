import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { hashPassword } from "./security.mjs";

export const defaultDatabaseUrl = "postgres://subscriptiq:subscriptiq@127.0.0.1:5432/subscriptiq";
export function createDatabase(url = process.env.DATABASE_URL ?? defaultDatabaseUrl) {
  return postgres(url, { max: 10, connect_timeout: 10, idle_timeout: 20, onnotice: () => {} });
}

export async function migrate(sql) {
  const directory = new URL("../database/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7190032)`;
    const [existing] =
      await tx`SELECT to_regclass('public.app_migrations') AS journal, to_regclass('public.profiles') AS profiles`;
    if (!existing.journal && existing.profiles)
      throw new Error(
        "This database contains an older installation. Use a fresh local database; see README.md for migration guidance.",
      );
    await tx`CREATE TABLE IF NOT EXISTS public.app_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    for (const file of files) {
      const source = await readFile(new URL(file, directory), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const [applied] = await tx`SELECT checksum FROM public.app_migrations WHERE name = ${file}`;
      if (applied) {
        if (applied.checksum !== checksum)
          throw new Error(`Applied migration ${file} was modified. Add a new migration instead.`);
        continue;
      }
      await tx.unsafe(source);
      await tx`INSERT INTO public.app_migrations (name, checksum) VALUES (${file}, ${checksum})`;
    }
  });
}

export async function seedDemo(sql) {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7190032)`;
    if ((await tx`SELECT name FROM public.app_migrations WHERE name = 'demo-v1'`).length) return;
    const passwordHash = await hashPassword("LocalDemo123!");
    for (const [role, fullName] of [
      ["admin", "Alex Morgan"],
      ["staff", "Sam Rivera"],
      ["customer", "Demo Customer"],
    ]) {
      const [user] =
        await tx`INSERT INTO private.users(email, full_name, password_hash) VALUES (${`${role}@subscriptiq.local`}, ${fullName}, ${passwordHash}) RETURNING id`;
      await tx`INSERT INTO public.user_roles(user_id, role) VALUES (${user.id}, ${role})`;
    }
    await tx.unsafe(await readFile(new URL("../database/demo.sql", import.meta.url), "utf8"));
    await tx`UPDATE public.customers SET user_id = (SELECT id FROM private.users WHERE email = 'customer@subscriptiq.local') WHERE email = 'customer@subscriptiq.local'`;
    await tx`INSERT INTO public.app_migrations(name, checksum) VALUES ('demo-v1', '1')`;
  });
}

export { asUser } from "../shared/database.mjs";
