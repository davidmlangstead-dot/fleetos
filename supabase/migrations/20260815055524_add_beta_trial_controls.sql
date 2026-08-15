ALTER TABLE public."CompanyControl"
  ADD COLUMN IF NOT EXISTS "betaEnabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "trialStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "trialEndsAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "featureFlags" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public."CompanyControl"
SET "trialStartedAt" = COALESCE("trialStartedAt", NOW()),
    "trialEndsAt" = COALESCE("trialEndsAt", NOW() + INTERVAL '30 days')
WHERE "subscriptionStatus" = 'TRIAL';

REVOKE ALL ON TABLE public."CompanyControl" FROM anon, authenticated;
