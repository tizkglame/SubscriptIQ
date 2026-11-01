import { createDatabase, migrate, seedDemo } from "./database.mjs";

const sql = createDatabase();
try {
  await migrate(sql);
  if (process.env.SEED_DEMO !== "false") await seedDemo(sql);
  console.log("Local database is ready.");
} finally {
  await sql.end();
}
