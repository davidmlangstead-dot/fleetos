import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assetsDir = new URL("../apps/web/dist/assets/", import.meta.url);
const maxChunkBytes = Number(process.env.FLEETOS_MAX_WEB_CHUNK_BYTES ?? 450 * 1024);

const files = await readdir(assetsDir);
const javascript = files.filter((name) => name.endsWith(".js"));
if (!javascript.length) {
  console.error("FAIL web bundle budget: no built JavaScript assets found. Run the web build first.");
  process.exit(1);
}

const chunks = await Promise.all(javascript.map(async (name) => {
  const info = await stat(join(assetsDir.pathname, name));
  return { name, bytes: info.size };
}));
chunks.sort((a, b) => b.bytes - a.bytes);

for (const chunk of chunks.slice(0, 8)) {
  console.log(`${chunk.name}: ${(chunk.bytes / 1024).toFixed(2)} KiB`);
}

const oversized = chunks.filter((chunk) => chunk.bytes > maxChunkBytes);
if (oversized.length) {
  console.error(`FAIL web bundle budget: ${oversized.length} JavaScript chunk(s) exceed ${(maxChunkBytes / 1024).toFixed(0)} KiB.`);
  for (const chunk of oversized) console.error(`- ${chunk.name}: ${(chunk.bytes / 1024).toFixed(2)} KiB`);
  process.exit(1);
}

console.log(`PASS web bundle budget: ${javascript.length} JavaScript chunks, largest ${(chunks[0].bytes / 1024).toFixed(2)} KiB.`);
