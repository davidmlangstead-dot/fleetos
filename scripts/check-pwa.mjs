import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const webRoot = resolve(root, "apps/web");
const dist = resolve(webRoot, "dist");

function fail(message) {
  console.error(`FAIL PWA contract: ${message}`);
  process.exit(1);
}

const manifestPath = resolve(dist, "manifest.webmanifest");
const swPath = resolve(dist, "sw.js");
const indexPath = resolve(dist, "index.html");
const mainSourcePath = resolve(webRoot, "src/main.tsx");

for (const path of [manifestPath, swPath, indexPath]) {
  try { await access(path); } catch { fail(`missing built asset ${path.replace(`${dist}/`, "")}`); }
}

let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
catch { fail("manifest.webmanifest is not valid JSON"); }

if (!manifest.name || !manifest.short_name) fail("manifest requires name and short_name");
if (manifest.display !== "standalone") fail("manifest display must be standalone");
if (manifest.start_url !== "/") fail("manifest start_url must be /");
if (manifest.scope !== "/") fail("manifest scope must be /");
if (!Array.isArray(manifest.icons)) fail("manifest icons must be an array");

const requiredSizes = ["192x192", "512x512"];
for (const size of requiredSizes) {
  const icon = manifest.icons.find((item) => item?.sizes?.split(/\s+/).includes(size));
  if (!icon?.src) fail(`manifest missing ${size} icon`);
  const iconPath = resolve(dist, icon.src.replace(/^\//, ""));
  try {
    const info = await stat(iconPath);
    if (info.size < 100) fail(`${size} icon looks empty`);
  } catch { fail(`manifest icon does not exist: ${icon.src}`); }
}

const sw = await readFile(swPath, "utf8");
if (!sw.includes("addEventListener(\"fetch\"") || !sw.includes("addEventListener(\"install\"")) {
  fail("service worker is missing install/fetch handlers");
}
if (/\/api\//.test(sw) && /cache\.put/.test(sw)) {
  fail("service worker appears to cache API routes; tenant data must not enter the shell cache");
}

const index = await readFile(indexPath, "utf8");
if (!/rel=["']manifest["']/.test(index)) fail("index.html is not linked to the web manifest");
if (!/rel=["']apple-touch-icon["']/.test(index)) fail("index.html is missing apple-touch-icon metadata");

const mainSource = await readFile(mainSourcePath, "utf8");
if (!mainSource.includes("navigator.serviceWorker.register")) fail("production code does not register the service worker");

console.log("PASS PWA contract: manifest, install icons, iOS metadata and service worker wiring are present.");
