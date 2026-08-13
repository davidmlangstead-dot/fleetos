-- Cover composite field-service foreign keys in their declared column order.

CREATE INDEX IF NOT EXISTS "SiteAsset_company_site_idx" ON public."SiteAsset" ("companyId","siteId");
CREATE INDEX IF NOT EXISTS "JobAssignment_company_job_idx" ON public."JobAssignment" ("companyId","jobId");
CREATE INDEX IF NOT EXISTS "JobVisit_company_job_idx" ON public."JobVisit" ("companyId","jobId");
CREATE INDEX IF NOT EXISTS "JobTimelineEntry_company_job_created_idx" ON public."JobTimelineEntry" ("companyId","jobId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "JobCostLine_company_job_idx" ON public."JobCostLine" ("companyId","jobId");
