import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["apps/web/src", "apps/api/src"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json"]);
const suspiciousPatterns = [
  { label: "Unicode replacement character", pattern: /�/u },
  { label: "UTF-8 punctuation mojibake", pattern: /â€|â€™|â€œ|â€|â€“|â€”|â€¦/u },
  { label: "UTF-8 spacing or currency mojibake", pattern: /Â(?:£|€|©|®|·|°| )/u },
  { label: "UTF-8 Latin mojibake", pattern: /Ã[\u0080-\u00BF]/u },
];
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
      const match = suspiciousPatterns.find(({ pattern }) => pattern.test(line));
      if (match) findings.push(`${full}:${index + 1}: ${match.label}: ${line.trim().slice(0, 220)}`);
    });
  }
}

for (const root of roots) await walk(root);

if (findings.length) {
  console.error("Broken text encoding / mojibake detected:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Text encoding check passed: no common mojibake patterns found in app source.");