ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "issuedToDriverAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submittedByDriverAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "officeApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportEmailedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportEmailTo" TEXT,
  ADD COLUMN IF NOT EXISTS "reportEmailStatus" TEXT;

CREATE INDEX IF NOT EXISTS "Job_companyId_issuedToDriverAt_idx" ON "Job"("companyId", "issuedToDriverAt");
CREATE INDEX IF NOT EXISTS "Job_companyId_submittedByDriverAt_idx" ON "Job"("companyId", "submittedByDriverAt");
CREATE INDEX IF NOT EXISTS "Job_companyId_officeApprovedAt_idx" ON "Job"("companyId", "officeApprovedAt");
