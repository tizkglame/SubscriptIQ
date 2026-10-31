import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";

const appRequire = createRequire(new URL("../package.json", import.meta.url));
const routerFile = realpathSync(appRequire.resolve("@tanstack/react-router/package.json"));
const router = JSON.parse(readFileSync(routerFile, "utf8"));

// A second router copy creates separate React contexts even if npm considers
// both copies valid. Start, its client/server entries, and the Vite plugin must
// resolve the same router instance as the app.
function checkRouter(name, parentRequire = appRequire) {
  const packageFile = parentRequire.resolve(`${name}/package.json`);
  const packageRequire = createRequire(packageFile);
  const resolvedRouterFile = realpathSync(
    packageRequire.resolve("@tanstack/react-router/package.json"),
  );
  const metadata = JSON.parse(readFileSync(packageFile, "utf8"));
  assert.equal(
    resolvedRouterFile,
    routerFile,
    `${name}@${metadata.version} resolves a different @tanstack/react-router copy. ` +
      `Update the TanStack framework packages together and regenerate package-lock.json; ` +
      `the app uses router ${router.version}.`,
  );
  return { packageRequire, metadata };
}

const { packageRequire, metadata } = checkRouter("@tanstack/react-start");
for (const name of Object.keys(metadata.dependencies ?? {})) {
  if (name.startsWith("@tanstack/react-start-")) checkRouter(name, packageRequire);
}
checkRouter("@tanstack/router-plugin");
console.log(`TanStack framework packages share @tanstack/react-router@${router.version}.`);
