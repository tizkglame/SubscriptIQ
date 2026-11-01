import { PGliteWorker } from "@electric-sql/pglite/worker";
import DatabaseWorker from "./worker?worker";
import { createDemoService } from "./service";
import { resetBrowserDatabase } from "./database";

let ready:
  Promise<{ database: PGliteWorker; request: ReturnType<typeof createDemoService> }> | undefined;
export function initializeDemo() {
  ready ??= PGliteWorker.create(new DatabaseWorker({ name: "subscriptiq-demo" }), {
    id: "subscriptiq-pages-v1",
    dataDir: "idb://subscriptiq-pages-v1",
  }).then((database) => ({ database, request: createDemoService(database) }));
  return ready;
}

export async function demoRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const demo = await initializeDemo();
  signal?.throwIfAborted();
  const result = await demo.request(path, body);
  signal?.throwIfAborted();
  return result as T;
}

export async function resetDemo() {
  const demo = await initializeDemo();
  await resetBrowserDatabase(demo.database);
}
