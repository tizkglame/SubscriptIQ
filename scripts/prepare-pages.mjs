import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// Pages is already configured to publish main:/docs. Keep the generated site
// there so publishing needs only repository write access, not admin settings.
const output = path.resolve("dist-pages");
const site = path.resolve("docs");
if (!existsSync(path.join(output, "index.html"))) throw new Error("Run npm run build:pages first");
mkdirSync(site, { recursive: true });
rmSync(path.join(site, "assets"), { recursive: true, force: true });
cpSync(output, site, { recursive: true });
writeFileSync(path.join(site, ".nojekyll"), "");
console.log("GitHub Pages site prepared in docs/. Commit it with the source changes to publish.");
