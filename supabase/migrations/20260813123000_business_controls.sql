CREATE TABLE IF NOT EXISTS public."CompanyControl" (
  "companyId" text PRIMARY KEY,
  "subscriptionPlan" text NOT NULL DEFAULT 'EARLY_ACCESS' CHECK ("subscriptionPlan" IN ('EARLY_ACCESS','STARTER','GROWTH','ENTERPRISE')),
  "subscriptionStatus" text NOT NULL DEFAULT 'ACTIVE' CHECK ("subscriptionStatus" IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLED')),
  "billingEmail" text,
  "seatLimit" integer NOT NULL DEFAULT 10 CHECK ("seatLimit" BETWEEN 1 AND 10000),
  "retentionDays" integer NOT NULL DEFAULT 2555 CHECK ("retentionDays" BETWEEN 365 AND 3650),
  "privacyContactEmail" text,
  "customDomain" text,
  "customDomainVerified" boolean NOT NULL DEFAULT false,
  "emailSenderDomain" text,
  "emailDomainVerified" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyControl_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."CompanyBackup" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  label text NOT NULL,
  "createdById" text,
  "recordCounts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  CONSTRAINT "CompanyBackup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "CompanyBackup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "CompanyBackup_companyId_createdAt_idx" ON public."CompanyBackup" ("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CompanyBackup_expiresAt_idx" ON public."CompanyBackup" ("expiresAt");

CREATE TABLE IF NOT EXISTS public."DataGovernanceRequest" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  type text NOT NULL CHECK (type IN ('ACCESS','ERASURE','RECTIFICATION','RESTRICTION')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','COMPLETED','CANCELLED')),
  "subjectName" text NOT NULL,
  "subjectEmail" text,
  notes text,
  "requestedById" text,
  "assignedToId" text,
  "dueAt" timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DataGovernanceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "DataGovernanceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES public."User"(id) ON DELETE SET NULL,
  CONSTRAINT "DataGovernanceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "DataGovernanceRequest_companyId_status_dueAt_idx" ON public."DataGovernanceRequest" ("companyId", status, "dueAt");

ALTER TABLE public."CompanyControl" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CompanyBackup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DataGovernanceRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CompanyControl", public."CompanyBackup", public."DataGovernanceRequest" FROM anon, authenticated;
GRANT ALL ON TABLE public."CompanyControl", public."CompanyBackup", public."DataGovernanceRequest" TO service_role;

INSERT INTO public."CompanyControl" ("companyId", "billingEmail", "privacyContactEmail")
SELECT c.id, u.email, u.email FROM public."Company" c JOIN public."User" u ON u.id=c."ownerId"
ON CONFLICT ("companyId") DO NOTHING;

