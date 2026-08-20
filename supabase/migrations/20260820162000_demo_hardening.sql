-- Demo hardening: explicit client-deny policies, fixed function search paths,
-- and covering indexes for newly added commercial foreign keys.
-- This migration is intentionally idempotent because the production database
-- was hardened before this source migration was recorded.

alter function public.fleet_filter_system_job_type_insert() set search_path = '';
alter function public.fleet_resync_company_job_types() set search_path = '';
alter function public.fleet_system_job_type_allowed(text, text, text) set search_path = '';

drop policy if exists "deny_direct_client_access" on public."CustomerContact";
create policy "deny_direct_client_access" on public."CustomerContact" as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny_direct_client_access" on public."Invoice";
create policy "deny_direct_client_access" on public."Invoice" as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny_direct_client_access" on public."InvoiceLine";
create policy "deny_direct_client_access" on public."InvoiceLine" as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny_direct_client_access" on public."Quote";
create policy "deny_direct_client_access" on public."Quote" as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny_direct_client_access" on public."QuoteLine";
create policy "deny_direct_client_access" on public."QuoteLine" as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists "deny_direct_client_access" on public."RecurringJob";
create policy "deny_direct_client_access" on public."RecurringJob" as restrictive for all to anon, authenticated using (false) with check (false);

create index if not exists "CustomerContact_companyId_siteId_idx" on public."CustomerContact" ("companyId", "siteId");
create index if not exists "Invoice_createdById_idx" on public."Invoice" ("createdById");
create index if not exists "Invoice_companyId_customerId_idx" on public."Invoice" ("companyId", "customerId");
create index if not exists "Invoice_companyId_jobId_idx" on public."Invoice" ("companyId", "jobId");
create index if not exists "InvoiceLine_companyId_idx" on public."InvoiceLine" ("companyId");
create index if not exists "Quote_createdById_idx" on public."Quote" ("createdById");
create index if not exists "Quote_companyId_customerId_idx" on public."Quote" ("companyId", "customerId");
create index if not exists "Quote_companyId_jobId_idx" on public."Quote" ("companyId", "jobId");
create index if not exists "Quote_companyId_siteId_idx" on public."Quote" ("companyId", "siteId");
create index if not exists "QuoteLine_companyId_idx" on public."QuoteLine" ("companyId");
create index if not exists "RecurringJob_companyId_assetId_idx" on public."RecurringJob" ("companyId", "assetId");
create index if not exists "RecurringJob_createdById_idx" on public."RecurringJob" ("createdById");
create index if not exists "RecurringJob_companyId_customerId_idx" on public."RecurringJob" ("companyId", "customerId");
create index if not exists "RecurringJob_companyId_jobTypeId_idx" on public."RecurringJob" ("companyId", "jobTypeId");
create index if not exists "RecurringJob_companyId_siteId_idx" on public."RecurringJob" ("companyId", "siteId");
