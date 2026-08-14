import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["apps/web/src", "apps/api/src"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json"]);
const suspicious = ["â", "Â", "Ã", "�"];
const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;
    const text = await readFile(full, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (suspicious.some(marker => line.includes(marker))) {
        findings.push(`${full}:${index + 1}: ${line.trim().slice(0, 220)}`);
      }
    });
  }
}

for (const root of roots) await walk(root);

if (findings.length) {
  console.error("Broken text encoding / mojibake detected:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Text encoding check passed: no common mojibake markers found in app source.");
