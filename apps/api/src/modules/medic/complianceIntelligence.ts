import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";

type Severity = "INFO" | "WARNING" | "CRITICAL";
type IntelItem = { source: string; title: string; url: string; publishedAt: Date | null; severity: Severity; topics: string[] };
type Source = { name: string; urls: string[]; mode: "atom" | "html" };

const SOURCES: Source[] = [
  { name: "DVSA", mode: "atom", urls: ["https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=driver-and-vehicle-standards-agency&order=updated-newest"] },
  { name: "RHA", mode: "html", urls: ["https://www.rha.uk.net/News/News"] },
  { name: "FORS", mode: "html", urls: ["https://www.fors-online.org.uk/cms/category/news/"] },
  { name: "CLOCS", mode: "html", urls: ["https://www.clocs.org.uk/news/", "https://www.clocs.org.uk/", "https://clocs.org.uk/"] },
];
const criticalTerms = ["operator licence", "operator license", "prohibition", "enforcement", "tachograph", "drivers' hours", "driver hours", "roadworthiness", "cabotage", "penalty", "fine", "legal requirement", "deadline", "direct vision", "dvs", "licence revoked", "licence suspended"];
const warningTerms = ["guidance", "consultation", "standard", "compliance", "accreditation", "training", "scheme", "safety", "update", "operator", "hgv", "lorry", "fleet"];

function decode(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function clean(value: string) { return decode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function classify(title: string) {
  const text = title.toLowerCase();
  const severity: Severity = criticalTerms.some((term) => text.includes(term)) ? "CRITICAL" : warningTerms.some((term) => text.includes(term)) ? "WARNING" : "INFO";
  const topics = [...criticalTerms, ...warningTerms].filter((term) => text.includes(term)).slice(0, 10);
  return { severity, topics };
}
function key(item: IntelItem) { return createHash("sha256").update(`${item.source}|${item.url}|${item.title}`).digest("hex").slice(0, 40); }
function absolute(base: string, href: string) { try { return new URL(decode(href), base).toString(); } catch { return ""; } }

function parseAtom(source: string, xml: string): IntelItem[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, 30).flatMap((match) => {
    const body = match[1];
    const title = clean(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const url = decode(body.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? "");
    const updated = clean(body.match(/<(?:updated|published)>([\s\S]*?)<\/(?:updated|published)>/i)?.[1] ?? "");
    if (!title || !url) return [];
    const scored = classify(title);
    return [{ source, title, url, publishedAt: updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated) : null, ...scored }];
  });
}
function parseHtml(source: string, base: string, html: string): IntelItem[] {
  const seen = new Set<string>(); const items: IntelItem[] = [];
  for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = clean(link[2]); const url = absolute(base, link[1]);
    if (!title || title.length < 12 || title.length > 240 || !url || seen.has(url)) continue;
    if (!/news|update|guidance|standard|compliance|operator|fleet|safety|training|licen[cs]e|tachograph|hgv|lorry|road/i.test(`${title} ${url}`)) continue;
    seen.add(url); items.push({ source, title, url, publishedAt: null, ...classify(title) });
    if (items.length >= 30) break;
  }
  return items;
}
async function fetchText(url: string) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "FleetOS-Medic/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}
async function fetchSource(source: Source) {
  let lastError = "Source unavailable";
  for (const url of source.urls) {
    try {
      const body = await fetchText(url);
      const items = source.mode === "atom" ? parseAtom(source.name, body) : parseHtml(source.name, url, body);
      if (!items.length) throw new Error("No update entries recognised");
      return { items, error: null as string | null };
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
  }
  return { items: [] as IntelItem[], error: lastError };
}
async function saveItem(item: IntelItem) {
  const id = key(item);
  await prisma.$executeRaw`
    INSERT INTO "ComplianceIntelligenceItem" (id, source, "externalKey", title, url, severity, topics, "publishedAt")
    VALUES (${id}, ${item.source}, ${id}, ${item.title.slice(0, 240)}, ${item.url}, ${item.severity}, ${item.topics}, ${item.publishedAt})
    ON CONFLICT (source, "externalKey") DO UPDATE SET title=EXCLUDED.title, url=EXCLUDED.url, severity=EXCLUDED.severity, topics=EXCLUDED.topics, "publishedAt"=COALESCE(EXCLUDED."publishedAt", "ComplianceIntelligenceItem"."publishedAt"), "lastSeenAt"=now()
  `;
}
async function saveHealth(source: string, count: number, error: string | null) {
  await prisma.$executeRaw`
    INSERT INTO "ComplianceIntelligenceSource" (source, status, "lastCheckedAt", "lastSuccessAt", "lastError", "lastItemCount")
    VALUES (${source}, ${error ? "DEGRADED" : "HEALTHY"}, now(), ${error ? null : new Date()}, ${error?.slice(0, 500) ?? null}, ${count})
    ON CONFLICT (source) DO UPDATE SET status=EXCLUDED.status, "lastCheckedAt"=now(), "lastSuccessAt"=CASE WHEN EXCLUDED.status='HEALTHY' THEN now() ELSE "ComplianceIntelligenceSource"."lastSuccessAt" END, "lastError"=EXCLUDED."lastError", "lastItemCount"=EXCLUDED."lastItemCount"
  `;
}
export async function runComplianceIntelligenceSweep() {
  let stored = 0;
  for (const source of SOURCES) {
    const result = await fetchSource(source);
    try {
      for (const item of result.items) { await saveItem(item); stored += 1; }
      await saveHealth(source.name, result.items.length, result.error);
      if (result.error) console.warn(`[Medic compliance] ${source.name}: ${result.error}`);
    } catch (error) { console.warn(`[Medic compliance] ${source.name} storage failed:`, error); }
  }
  console.log(`[Medic compliance] sweep processed ${stored} items`);
}
let started = false;
export function startComplianceIntelligenceWatcher() {
  if (started || process.env.NODE_ENV === "test" || process.env.FLEETOS_MEDIC_COMPLIANCE_DISABLED === "true") return;
  started = true;
  const intervalMs = Math.max(3600000, Number(process.env.FLEETOS_MEDIC_COMPLIANCE_INTERVAL_MS || 21600000));
  const run = () => void runComplianceIntelligenceSweep().catch((error) => console.warn("[Medic compliance] sweep failed:", error));
  setTimeout(run, 15000);
  const timer = setInterval(run, intervalMs); timer.unref?.();
}
