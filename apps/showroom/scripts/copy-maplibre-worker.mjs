// Bundlers rewrite maplibre-gl's import.meta.url, so its worker cannot be found at runtime.
// Serve the (BSD-3) worker file from /public and point maplibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("maplibre-gl/package.json"));
const outDir = path.join(import.meta.dirname, "..", "public", "vendor");
mkdirSync(outDir, { recursive: true });
copyFileSync(path.join(pkgDir, "dist", "maplibre-gl-worker.mjs"), path.join(outDir, "maplibre-gl-worker.mjs"));
copyFileSync(path.join(pkgDir, "LICENSE.txt"), path.join(outDir, "maplibre-gl-LICENSE.txt"));
console.log("maplibre-gl worker copied to public/vendor");
