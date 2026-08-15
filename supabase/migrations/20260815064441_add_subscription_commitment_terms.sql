ALTER TABLE public."CompanyControl"
  ADD COLUMN IF NOT EXISTS "commitmentMonths" integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "commitmentStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "commitmentEndsAt" timestamptz;

ALTER TABLE public."CompanyControl"
  DROP CONSTRAINT IF EXISTS "CompanyControl_commitmentMonths_check";
ALTER TABLE public."CompanyControl"
  ADD CONSTRAINT "CompanyControl_commitmentMonths_check" CHECK ("commitmentMonths" IN (12,24,36));

COMMENT ON COLUMN public."CompanyControl"."commitmentMonths" IS 'Minimum paid subscription commitment term. Standard is 12 months; 24/36 are optional negotiated terms.';
COMMENT ON COLUMN public."CompanyControl"."commitmentStartedAt" IS 'Paid commitment start time; remains null during free trial until subscription activation.';
COMMENT ON COLUMN public."CompanyControl"."commitmentEndsAt" IS 'Paid commitment end time; set when subscription is activated or renewed.';

REVOKE ALL ON TABLE public."CompanyControl" FROM anon, authenticated;
