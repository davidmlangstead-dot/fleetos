CREATE TABLE IF NOT EXISTS "ComplianceIntelligenceItem" (
  id text PRIMARY KEY,
  source text NOT NULL,
  "externalKey" text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  summary text,
  severity text NOT NULL DEFAULT 'INFO',
  topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  "publishedAt" timestamptz,
  "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ComplianceIntelligenceItem_source_externalKey_key" UNIQUE (source, "externalKey")
);

CREATE INDEX IF NOT EXISTS "ComplianceIntelligenceItem_recent_idx"
  ON "ComplianceIntelligenceItem" (COALESCE("publishedAt", "firstSeenAt") DESC);
CREATE INDEX IF NOT EXISTS "ComplianceIntelligenceItem_source_idx"
  ON "ComplianceIntelligenceItem" (source);
CREATE INDEX IF NOT EXISTS "ComplianceIntelligenceItem_severity_idx"
  ON "ComplianceIntelligenceItem" (severity);

CREATE TABLE IF NOT EXISTS "ComplianceIntelligenceSource" (
  source text PRIMARY KEY,
  status text NOT NULL DEFAULT 'UNKNOWN',
  "lastCheckedAt" timestamptz NOT NULL DEFAULT now(),
  "lastSuccessAt" timestamptz,
  "lastError" text,
  "lastItemCount" integer NOT NULL DEFAULT 0
);

ALTER TABLE "ComplianceIntelligenceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceIntelligenceSource" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ComplianceIntelligenceItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "ComplianceIntelligenceSource" FROM anon, authenticated;
