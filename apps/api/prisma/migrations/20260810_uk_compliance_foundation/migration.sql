-- FleetOS UK compliance foundation
-- Apply through Prisma migration tooling against the existing Postgres database.

ALTER TYPE "ComplianceStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "ComplianceStatus" ADD VALUE IF NOT EXISTS 'NOT_APPLICABLE';

CREATE TYPE "ComplianceSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "ComplianceSource" AS ENUM ('DVSA', 'TRAFFIC_COMMISSIONER', 'RHA', 'FORS', 'CLOCS', 'COMPANY_POLICY');

ALTER TABLE "ComplianceItem"
  ADD COLUMN "ruleId" TEXT,
  ADD COLUMN "severity" "ComplianceSeverity" NOT NULL DEFAULT 'WARNING',
  ADD COLUMN "evidenceRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ComplianceRule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "source" "ComplianceSource" NOT NULL,
  "sourceUrl" TEXT,
  "ruleVersion" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "severity" "ComplianceSeverity" NOT NULL DEFAULT 'WARNING',
  "appliesTo" TEXT NOT NULL,
  "intervalDays" INTEGER,
  "reminderDays" INTEGER DEFAULT 30,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplianceRule_companyId_key_ruleVersion_key"
  ON "ComplianceRule"("companyId", "key", "ruleVersion");
CREATE INDEX "ComplianceRule_companyId_active_idx"
  ON "ComplianceRule"("companyId", "active");
CREATE INDEX "ComplianceRule_source_idx"
  ON "ComplianceRule"("source");

CREATE INDEX "ComplianceItem_ruleId_idx" ON "ComplianceItem"("ruleId");
CREATE INDEX "ComplianceItem_driverId_idx" ON "ComplianceItem"("driverId");
CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "AuditEvent"("companyId", "createdAt");
CREATE INDEX "AuditEvent_companyId_entityType_entityId_idx" ON "AuditEvent"("companyId", "entityType", "entityId");
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

ALTER TABLE "ComplianceRule"
  ADD CONSTRAINT "ComplianceRule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComplianceItem"
  ADD CONSTRAINT "ComplianceItem_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "ComplianceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComplianceItem"
  ADD CONSTRAINT "ComplianceItem_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
