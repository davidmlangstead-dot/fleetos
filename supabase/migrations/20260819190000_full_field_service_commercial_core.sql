CREATE TABLE IF NOT EXISTS public."CustomerContact" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "customerId" uuid NOT NULL,
  "siteId" uuid,
  name text NOT NULL,
  role text,email text,phone text,
  "isPrimary" boolean NOT NULL DEFAULT false,
  notes text,"isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CustomerContact_customer_fkey" FOREIGN KEY ("companyId","customerId") REFERENCES public."Customer"("companyId",id) ON DELETE CASCADE,
  CONSTRAINT "CustomerContact_site_fkey" FOREIGN KEY ("companyId","siteId") REFERENCES public."CustomerSite"("companyId",id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public."Quote" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,"customerId" uuid NOT NULL,"siteId" uuid,"jobId" text,
  reference text NOT NULL,title text NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  description text,"validUntil" date,"subtotalPence" integer NOT NULL DEFAULT 0 CHECK ("subtotalPence">=0),"vatPence" integer NOT NULL DEFAULT 0 CHECK ("vatPence">=0),"totalPence" integer NOT NULL DEFAULT 0 CHECK ("totalPence">=0),
  "acceptedAt" timestamptz,"acceptedBy" text,"createdById" text REFERENCES public."User"(id) ON DELETE SET NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Quote_customer_fkey" FOREIGN KEY ("companyId","customerId") REFERENCES public."Customer"("companyId",id) ON DELETE CASCADE,
  CONSTRAINT "Quote_site_fkey" FOREIGN KEY ("companyId","siteId") REFERENCES public."CustomerSite"("companyId",id) ON DELETE SET NULL,
  CONSTRAINT "Quote_job_fkey" FOREIGN KEY ("companyId","jobId") REFERENCES public."Job"("companyId",id) ON DELETE SET NULL,UNIQUE ("companyId",reference)
);
CREATE TABLE IF NOT EXISTS public."QuoteLine" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,"quoteId" uuid NOT NULL REFERENCES public."Quote"(id) ON DELETE CASCADE,description text NOT NULL,quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity>0),"unitPricePence" integer NOT NULL DEFAULT 0 CHECK ("unitPricePence">=0),"vatRate" numeric(5,2) NOT NULL DEFAULT 20,"sortOrder" integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS public."RecurringJob" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,"customerId" uuid NOT NULL,"siteId" uuid,"assetId" uuid,"jobTypeId" uuid,title text NOT NULL,description text,
  frequency text NOT NULL CHECK (frequency IN ('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY','SIX_MONTHLY','YEARLY','CUSTOM')),"intervalValue" integer NOT NULL DEFAULT 1 CHECK ("intervalValue">0),"nextDueAt" timestamptz NOT NULL,
  "defaultPersonIds" jsonb NOT NULL DEFAULT '[]'::jsonb,"defaultVehicleId" text,"estimatedDurationMinutes" integer,"isActive" boolean NOT NULL DEFAULT true,"lastGeneratedAt" timestamptz,"createdById" text REFERENCES public."User"(id) ON DELETE SET NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RecurringJob_customer_fkey" FOREIGN KEY ("companyId","customerId") REFERENCES public."Customer"("companyId",id) ON DELETE CASCADE,
  CONSTRAINT "RecurringJob_site_fkey" FOREIGN KEY ("companyId","siteId") REFERENCES public."CustomerSite"("companyId",id) ON DELETE SET NULL,
  CONSTRAINT "RecurringJob_asset_fkey" FOREIGN KEY ("companyId","assetId") REFERENCES public."SiteAsset"("companyId",id) ON DELETE SET NULL,
  CONSTRAINT "RecurringJob_jobtype_fkey" FOREIGN KEY ("companyId","jobTypeId") REFERENCES public."JobType"("companyId",id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS public."Invoice" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,"customerId" uuid NOT NULL,"jobId" text,reference text NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PART_PAID','PAID','OVERDUE','VOID')),
  "issueDate" date NOT NULL DEFAULT CURRENT_DATE,"dueDate" date,"subtotalPence" integer NOT NULL DEFAULT 0 CHECK ("subtotalPence">=0),"vatPence" integer NOT NULL DEFAULT 0 CHECK ("vatPence">=0),"totalPence" integer NOT NULL DEFAULT 0 CHECK ("totalPence">=0),"paidPence" integer NOT NULL DEFAULT 0 CHECK ("paidPence">=0),notes text,"createdById" text REFERENCES public."User"(id) ON DELETE SET NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Invoice_customer_fkey" FOREIGN KEY ("companyId","customerId") REFERENCES public."Customer"("companyId",id) ON DELETE CASCADE,
  CONSTRAINT "Invoice_job_fkey" FOREIGN KEY ("companyId","jobId") REFERENCES public."Job"("companyId",id) ON DELETE SET NULL,UNIQUE ("companyId",reference)
);
CREATE TABLE IF NOT EXISTS public."InvoiceLine" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,"invoiceId" uuid NOT NULL REFERENCES public."Invoice"(id) ON DELETE CASCADE,description text NOT NULL,quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity>0),"unitPricePence" integer NOT NULL DEFAULT 0 CHECK ("unitPricePence">=0),"vatRate" numeric(5,2) NOT NULL DEFAULT 20,"sortOrder" integer NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS "CustomerContact_company_customer_idx" ON public."CustomerContact" ("companyId","customerId","isActive");
CREATE INDEX IF NOT EXISTS "Quote_company_status_idx" ON public."Quote" ("companyId",status,"createdAt" DESC);CREATE INDEX IF NOT EXISTS "Quote_customer_idx" ON public."Quote" ("customerId");CREATE INDEX IF NOT EXISTS "QuoteLine_quote_idx" ON public."QuoteLine" ("quoteId","sortOrder");CREATE INDEX IF NOT EXISTS "RecurringJob_company_due_idx" ON public."RecurringJob" ("companyId","isActive","nextDueAt");CREATE INDEX IF NOT EXISTS "Invoice_company_status_idx" ON public."Invoice" ("companyId",status,"issueDate" DESC);CREATE INDEX IF NOT EXISTS "Invoice_customer_idx" ON public."Invoice" ("customerId");CREATE INDEX IF NOT EXISTS "InvoiceLine_invoice_idx" ON public."InvoiceLine" ("invoiceId","sortOrder");
ALTER TABLE public."CustomerContact" ENABLE ROW LEVEL SECURITY;ALTER TABLE public."Quote" ENABLE ROW LEVEL SECURITY;ALTER TABLE public."QuoteLine" ENABLE ROW LEVEL SECURITY;ALTER TABLE public."RecurringJob" ENABLE ROW LEVEL SECURITY;ALTER TABLE public."Invoice" ENABLE ROW LEVEL SECURITY;ALTER TABLE public."InvoiceLine" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CustomerContact",public."Quote",public."QuoteLine",public."RecurringJob",public."Invoice",public."InvoiceLine" FROM PUBLIC,anon,authenticated;GRANT ALL ON TABLE public."CustomerContact",public."Quote",public."QuoteLine",public."RecurringJob",public."Invoice",public."InvoiceLine" TO service_role;