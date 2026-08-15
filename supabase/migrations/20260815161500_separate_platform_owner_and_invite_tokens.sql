CREATE TABLE IF NOT EXISTS "PlatformOwner" (
  "userId" text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ResellerInvite" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resellerId" text NOT NULL REFERENCES "Reseller"(id) ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  email text,
  role text NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN','SALES','SUPPORT','VIEWER')),
  "expiresAt" timestamptz NOT NULL,
  "acceptedAt" timestamptz,
  "acceptedByUserId" text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdByUserId" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ResellerInvite_resellerId_idx" ON "ResellerInvite"("resellerId");
CREATE INDEX IF NOT EXISTS "ResellerInvite_expiresAt_idx" ON "ResellerInvite"("expiresAt");

CREATE TABLE IF NOT EXISTS "ResellerCustomerInvite" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resellerId" text NOT NULL REFERENCES "Reseller"(id) ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "usedByCompanyId" text REFERENCES "Company"(id) ON DELETE SET NULL,
  "createdByUserId" text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ResellerCustomerInvite_resellerId_idx" ON "ResellerCustomerInvite"("resellerId");
CREATE INDEX IF NOT EXISTS "ResellerCustomerInvite_expiresAt_idx" ON "ResellerCustomerInvite"("expiresAt");

ALTER TABLE "PlatformOwner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResellerInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResellerCustomerInvite" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlatformOwner", "ResellerInvite", "ResellerCustomerInvite" FROM anon, authenticated;
