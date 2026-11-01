import { createDatabase, migrate, seedDemo } from "./database.mjs";
import { createApplication } from "./app.mjs";

const sql = createDatabase();
let server;
try {
  await migrate(sql);
  if (process.env.SEED_DEMO !== "false") await seedDemo(sql);
  server = createApplication({ sql });
  const development = process.argv.includes("--dev");
  const port = Number(process.env.PORT ?? (development ? 3001 : 3000));
  const host = process.env.HOST ?? (development ? "127.0.0.1" : "0.0.0.0");
  server.listen(port, host, () =>
    console.log(`SubscriptIQ ${development ? "API" : "app"} ready at http://${host}:${port}`),
  );
  server.on("error", async (error) => {
    console.error(error);
    await sql.end();
    process.exitCode = 1;
  });
} catch (error) {
  console.error("Could not start SubscriptIQ:", error.message);
  await sql.end();
  process.exitCode = 1;
}

async function stop() {
  server?.close();
  await sql.end({ timeout: 5 });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
