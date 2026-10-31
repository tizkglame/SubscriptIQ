import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env")) loadEnvFile(".env");
const migrationUrl = process.env["LOVABLE_DB_MIGRATION_URL"];
if (!migrationUrl)
  throw new Error("Set LOVABLE_DB_MIGRATION_URL before running database migrations");

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url: migrationUrl },
});
