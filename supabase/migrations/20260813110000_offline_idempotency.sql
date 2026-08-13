CREATE TABLE IF NOT EXISTS public."IdempotencyRequest" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "userId" text NOT NULL,
  "key" text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  state text NOT NULL DEFAULT 'PROCESSING' CHECK (state IN ('PROCESSING', 'COMPLETED')),
  "responseStatus" integer CHECK ("responseStatus" IS NULL OR "responseStatus" BETWEEN 100 AND 599),
  "responseBody" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "expiresAt" timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT "IdempotencyRequest_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "IdempotencyRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE CASCADE,
  CONSTRAINT "IdempotencyRequest_company_user_key_key" UNIQUE ("companyId", "userId", "key")
);

CREATE INDEX IF NOT EXISTS "IdempotencyRequest_companyId_expiresAt_idx"
  ON public."IdempotencyRequest" ("companyId", "expiresAt");
CREATE INDEX IF NOT EXISTS "IdempotencyRequest_userId_state_createdAt_idx"
  ON public."IdempotencyRequest" ("userId", state, "createdAt");

ALTER TABLE public."IdempotencyRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."IdempotencyRequest" FROM anon, authenticated;
GRANT ALL ON TABLE public."IdempotencyRequest" TO service_role;

COMMENT ON TABLE public."IdempotencyRequest" IS
  'Short-lived replay ledger that prevents duplicate FleetOS writes during offline reconnect and network retries.';

