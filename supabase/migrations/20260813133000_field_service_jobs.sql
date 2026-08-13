-- Flexible multi-trade field-service jobs. Existing transport fields remain for
-- backwards compatibility, while job types, sites, assets, visits, assignments,
-- worksheets, timelines and costs provide a configurable operational core.

ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'DISPATCHED';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'TRAVELLING';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'ON_SITE';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'COMPLETED_ISSUES';
ALTER TYPE public."JobStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

CREATE UNIQUE INDEX IF NOT EXISTS "Person_companyId_id_key" ON public."Person" ("companyId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "Driver_companyId_id_key" ON public."Driver" ("companyId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "Job_companyId_id_key" ON public."Job" ("companyId", id);

CREATE TABLE IF NOT EXISTS public."JobType" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  name text NOT NULL,
  trade text NOT NULL DEFAULT 'GENERAL',
  description text,
  colour text NOT NULL DEFAULT '#197b58',
  "defaultPriority" text NOT NULL DEFAULT 'NORMAL' CHECK ("defaultPriority" IN ('LOW','NORMAL','HIGH','URGENT','EMERGENCY')),
  "defaultDurationMinutes" integer NOT NULL DEFAULT 60 CHECK ("defaultDurationMinutes" BETWEEN 5 AND 43200),
  workflow jsonb NOT NULL DEFAULT '["SCHEDULED","ON_SITE","COMPLETED"]'::jsonb CHECK (jsonb_typeof(workflow)='array'),
  "formSchema" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("formSchema")='array'),
  "requiredSkills" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("requiredSkills")='array'),
  "riskAssessmentRequired" boolean NOT NULL DEFAULT false,
  "customerSignatureRequired" boolean NOT NULL DEFAULT false,
  "isSystem" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdById" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("companyId", name),
  UNIQUE ("companyId", id)
);

CREATE TABLE IF NOT EXISTS public."Customer" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  name text NOT NULL,
  "accountReference" text,
  email text,
  phone text,
  notes text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("companyId", name),
  UNIQUE ("companyId", id)
);

CREATE TABLE IF NOT EXISTS public."CustomerSite" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "customerId" uuid NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  postcode text,
  "contactName" text,
  "contactPhone" text,
  "contactEmail" text,
  "accessNotes" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CustomerSite_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES public."Customer"("companyId",id) ON DELETE CASCADE,
  UNIQUE ("companyId", "customerId", name),
  UNIQUE ("companyId", id)
);

CREATE TABLE IF NOT EXISTS public."SiteAsset" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "siteId" uuid NOT NULL,
  name text NOT NULL,
  "assetType" text NOT NULL DEFAULT 'EQUIPMENT',
  "assetReference" text,
  manufacturer text,
  model text,
  "serialNumber" text,
  location text,
  notes text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SiteAsset_companyId_siteId_fkey" FOREIGN KEY ("companyId", "siteId") REFERENCES public."CustomerSite"("companyId",id) ON DELETE CASCADE,
  UNIQUE ("companyId", id)
);

ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "jobTypeId" uuid;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL';
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'OFFICE';
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "customerId" uuid;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "siteId" uuid;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "assetId" uuid;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "contactName" text;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "contactPhone" text;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "contactEmail" text;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "scheduledStart" timestamptz;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "scheduledEnd" timestamptz;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "dueAt" timestamptz;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" integer;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "purchaseOrderNumber" text;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "quotePence" integer;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "estimatedCostPence" integer;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "customFields" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "workflowSnapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "worksheetSchema" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "worksheetResponses" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "riskAssessment" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "customerSignature" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."Job" ADD COLUMN IF NOT EXISTS "completedAt" timestamptz;

ALTER TABLE public."Job" DROP CONSTRAINT IF EXISTS "Job_priority_check";
ALTER TABLE public."Job" ADD CONSTRAINT "Job_priority_check" CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT','EMERGENCY'));
ALTER TABLE public."Job" DROP CONSTRAINT IF EXISTS "Job_source_check";
ALTER TABLE public."Job" ADD CONSTRAINT "Job_source_check" CHECK (source IN ('OFFICE','CUSTOMER','PHONE','EMAIL','PORTAL','PLANNED','REACTIVE','OTHER'));
ALTER TABLE public."Job" DROP CONSTRAINT IF EXISTS "Job_estimatedDurationMinutes_check";
ALTER TABLE public."Job" ADD CONSTRAINT "Job_estimatedDurationMinutes_check" CHECK ("estimatedDurationMinutes" IS NULL OR "estimatedDurationMinutes" BETWEEN 5 AND 43200);
ALTER TABLE public."Job" DROP CONSTRAINT IF EXISTS "Job_finance_check";
ALTER TABLE public."Job" ADD CONSTRAINT "Job_finance_check" CHECK (("quotePence" IS NULL OR "quotePence">=0) AND ("estimatedCostPence" IS NULL OR "estimatedCostPence">=0));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Job_companyId_jobTypeId_fkey') THEN ALTER TABLE public."Job" ADD CONSTRAINT "Job_companyId_jobTypeId_fkey" FOREIGN KEY ("companyId","jobTypeId") REFERENCES public."JobType"("companyId",id) ON DELETE SET NULL ("jobTypeId"); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Job_companyId_customerId_fkey') THEN ALTER TABLE public."Job" ADD CONSTRAINT "Job_companyId_customerId_fkey" FOREIGN KEY ("companyId","customerId") REFERENCES public."Customer"("companyId",id) ON DELETE SET NULL ("customerId"); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Job_companyId_siteId_fkey') THEN ALTER TABLE public."Job" ADD CONSTRAINT "Job_companyId_siteId_fkey" FOREIGN KEY ("companyId","siteId") REFERENCES public."CustomerSite"("companyId",id) ON DELETE SET NULL ("siteId"); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Job_companyId_assetId_fkey') THEN ALTER TABLE public."Job" ADD CONSTRAINT "Job_companyId_assetId_fkey" FOREIGN KEY ("companyId","assetId") REFERENCES public."SiteAsset"("companyId",id) ON DELETE SET NULL ("assetId"); END IF;
END $$;

CREATE TABLE IF NOT EXISTS public."JobAssignment" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "jobId" text NOT NULL,
  "personId" text NOT NULL,
  role text NOT NULL DEFAULT 'ASSIGNEE',
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','ACCEPTED','DECLINED','COMPLETED')),
  "assignedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "JobAssignment_companyId_jobId_fkey" FOREIGN KEY ("companyId","jobId") REFERENCES public."Job"("companyId",id) ON DELETE CASCADE,
  CONSTRAINT "JobAssignment_companyId_personId_fkey" FOREIGN KEY ("companyId","personId") REFERENCES public."Person"("companyId",id) ON DELETE CASCADE,
  UNIQUE ("jobId","personId")
);

CREATE TABLE IF NOT EXISTS public."JobVisit" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "jobId" text NOT NULL,
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence>0),
  title text NOT NULL DEFAULT 'Visit',
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','DISPATCHED','TRAVELLING','ON_SITE','PAUSED','COMPLETED','COMPLETED_ISSUES','CANCELLED')),
  "scheduledStart" timestamptz,
  "scheduledEnd" timestamptz,
  "actualStart" timestamptz,
  "actualEnd" timestamptz,
  notes text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "JobVisit_companyId_jobId_fkey" FOREIGN KEY ("companyId","jobId") REFERENCES public."Job"("companyId",id) ON DELETE CASCADE,
  UNIQUE ("jobId",sequence)
);

CREATE TABLE IF NOT EXISTS public."JobTimelineEntry" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "jobId" text NOT NULL,
  type text NOT NULL CHECK (type IN ('CREATED','STATUS','NOTE','CUSTOMER','SCHEDULE','ASSIGNMENT','WORKSHEET','RISK','SIGNATURE','COST','DOCUMENT','SYSTEM')),
  summary text NOT NULL,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "JobTimelineEntry_companyId_jobId_fkey" FOREIGN KEY ("companyId","jobId") REFERENCES public."Job"("companyId",id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."JobCostLine" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "jobId" text NOT NULL,
  category text NOT NULL CHECK (category IN ('LABOUR','PART','MATERIAL','EXPENSE','SUBCONTRACT','OTHER')),
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity>0),
  "unitCostPence" integer NOT NULL DEFAULT 0 CHECK ("unitCostPence">=0),
  "unitSellPence" integer NOT NULL DEFAULT 0 CHECK ("unitSellPence">=0),
  "createdById" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "JobCostLine_companyId_jobId_fkey" FOREIGN KEY ("companyId","jobId") REFERENCES public."Job"("companyId",id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "JobType_company_active_idx" ON public."JobType" ("companyId","isActive",name);
CREATE INDEX IF NOT EXISTS "JobType_createdById_idx" ON public."JobType" ("createdById");
CREATE INDEX IF NOT EXISTS "Customer_company_active_idx" ON public."Customer" ("companyId","isActive",name);
CREATE INDEX IF NOT EXISTS "CustomerSite_customerId_idx" ON public."CustomerSite" ("customerId");
CREATE INDEX IF NOT EXISTS "CustomerSite_company_active_idx" ON public."CustomerSite" ("companyId","isActive",name);
CREATE INDEX IF NOT EXISTS "SiteAsset_siteId_idx" ON public."SiteAsset" ("siteId");
CREATE INDEX IF NOT EXISTS "SiteAsset_company_active_idx" ON public."SiteAsset" ("companyId","isActive",name);
CREATE INDEX IF NOT EXISTS "Job_company_jobType_status_idx" ON public."Job" ("companyId","jobTypeId",status);
CREATE INDEX IF NOT EXISTS "Job_company_schedule_idx" ON public."Job" ("companyId","scheduledStart");
CREATE INDEX IF NOT EXISTS "Job_customerId_idx" ON public."Job" ("customerId");
CREATE INDEX IF NOT EXISTS "Job_siteId_idx" ON public."Job" ("siteId");
CREATE INDEX IF NOT EXISTS "Job_assetId_idx" ON public."Job" ("assetId");
CREATE INDEX IF NOT EXISTS "JobAssignment_company_person_idx" ON public."JobAssignment" ("companyId","personId",status);
CREATE INDEX IF NOT EXISTS "JobAssignment_jobId_idx" ON public."JobAssignment" ("jobId");
CREATE INDEX IF NOT EXISTS "JobVisit_company_schedule_idx" ON public."JobVisit" ("companyId","scheduledStart",status);
CREATE INDEX IF NOT EXISTS "JobVisit_jobId_idx" ON public."JobVisit" ("jobId");
CREATE INDEX IF NOT EXISTS "JobTimelineEntry_job_created_idx" ON public."JobTimelineEntry" ("jobId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "JobTimelineEntry_createdById_idx" ON public."JobTimelineEntry" ("createdById");
CREATE INDEX IF NOT EXISTS "JobCostLine_jobId_idx" ON public."JobCostLine" ("jobId");
CREATE INDEX IF NOT EXISTS "JobCostLine_createdById_idx" ON public."JobCostLine" ("createdById");

ALTER TABLE public."JobType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CustomerSite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SiteAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobTimelineEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobCostLine" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."JobType",public."Customer",public."CustomerSite",public."SiteAsset",public."JobAssignment",public."JobVisit",public."JobTimelineEntry",public."JobCostLine" FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public."JobType",public."Customer",public."CustomerSite",public."SiteAsset",public."JobAssignment",public."JobVisit",public."JobTimelineEntry",public."JobCostLine" TO service_role;

COMMENT ON TABLE public."JobType" IS 'Company-configurable field-service job templates, workflows and worksheet definitions.';
COMMENT ON TABLE public."JobAssignment" IS 'Multi-person job allocation for drivers, engineers, technicians and other staff.';
COMMENT ON TABLE public."JobTimelineEntry" IS 'Append-only office and field activity history for a job.';
