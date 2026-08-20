import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";

type Severity = "INFO" | "WARNING" | "CRITICAL";
type IntelItem = { source: string; title: string; url: string; publishedAt: Date | null; severity: Severity; topics: string[] };

const SOURCES = [
  ["DVSA", "https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=driver-and-vehicle-standards-agency&order=updated-newest", "atom"],
  ["RHA", "https://www.rha.uk.net/News/News", "html"],
  ["FORS", "https://www.fors-online.org.uk/cms/category/news/", "html"],
  ["CLOCS", "https://www.clocs.org.uk/", "html"],
] as const;

const criticalTerms = ["operator licence", "prohibition", "enforcement", "tachograph", "drivers' hours", "roadworthiness", "cabotage", "penalty", "deadline", "direct vision", "dvs"];
const warningTerms = ["guidance", "standard", "compliance", "accreditation", "training", "safety", "update", "hgv", "fleet"];

function classify(title: string) {
  const text = title.toLowerCase();
  const severity: Severity = criticalTerms.some((term) => text.includes(term)) ? "CRITICAL" : warningTerms.some((term) => text.includes(term)) ? "WARNING" : "INFO";
  const topics = [...criticalTerms, ...warningTerms].filter((term) => text.includes(term)).slice(0, 10);
  return { severity, topics };
}

function key(item: IntelItem) {
  return createHash("sha256").update(`${item.source}|${item.url}|${item.title}`).digest("hex").slice(0, 40);
}

export async function saveComplianceItem(item: IntelItem) {
  const id = key(item);
  await prisma.$executeRaw`
    INSERT INTO "ComplianceIntelligenceItem" (id, source, "externalKey", title, url, severity, topics, "publishedAt")
    VALUES (${id}, ${item.source}, ${id}, ${item.title.slice(0, 240)}, ${item.url}, ${item.severity}, ${item.topics}, ${item.publishedAt})
    ON CONFLICT (source, "externalKey") DO UPDATE SET title=EXCLUDED.title, url=EXCLUDED.url, severity=EXCLUDED.severity, topics=EXCLUDED.topics, "lastSeenAt"=now()
  `;
}

export { SOURCES, classify };
