import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { prepareBrowserDatabase } from "./database";

worker({
  async init(options) {
    const database = await PGlite.create({
      dataDir: options.dataDir ?? "idb://subscriptiq-pages-v1",
    });
    await prepareBrowserDatabase(database);
    return database;
  },
});
