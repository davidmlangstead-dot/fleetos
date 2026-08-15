ALTER TABLE public."CompanyControl"
  ADD COLUMN IF NOT EXISTS "vehicleLimit" integer NOT NULL DEFAULT 10;

ALTER TABLE public."CompanyControl"
  DROP CONSTRAINT IF EXISTS "CompanyControl_vehicleLimit_check";
ALTER TABLE public."CompanyControl"
  ADD CONSTRAINT "CompanyControl_vehicleLimit_check" CHECK ("vehicleLimit" >= 1 AND "vehicleLimit" <= 100000);

ALTER TABLE public."CompanyControl"
  ALTER COLUMN "subscriptionPlan" SET DEFAULT 'EARLY_ACCESS',
  ALTER COLUMN "subscriptionStatus" SET DEFAULT 'TRIAL',
  ALTER COLUMN "betaEnabled" SET DEFAULT true,
  ALTER COLUMN "trialStartedAt" SET DEFAULT NOW(),
  ALTER COLUMN "trialEndsAt" SET DEFAULT (NOW() + INTERVAL '90 days'),
  ALTER COLUMN "vehicleLimit" SET DEFAULT 10;

UPDATE public."CompanyControl"
SET "trialStartedAt" = COALESCE("trialStartedAt", NOW()),
    "trialEndsAt" = GREATEST(
      COALESCE("trialEndsAt", COALESCE("trialStartedAt", NOW()) + INTERVAL '90 days'),
      COALESCE("trialStartedAt", NOW()) + INTERVAL '90 days'
    )
WHERE "subscriptionStatus" = 'TRIAL';

REVOKE ALL ON TABLE public."CompanyControl" FROM anon, authenticated;
