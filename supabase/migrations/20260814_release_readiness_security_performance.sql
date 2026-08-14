-- Release-readiness hardening applied to production Supabase on 2026-08-14.
-- Keeps authorization semantics unchanged while improving RLS evaluation and tenant-scoped FK query paths.

DROP POLICY IF EXISTS "Users can create their own company" ON public.companies;
CREATE POLICY "Users can create their own company"
ON public.companies
FOR INSERT
TO public
WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Users can read their own company" ON public.companies;
CREATE POLICY "Users can read their own company"
ON public.companies
FOR SELECT
TO public
USING ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS person_company_admins_can_manage ON public."Person";
CREATE POLICY person_company_admins_can_manage
ON public."Person"
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."CompanyMembership" m
    WHERE m."companyId" = "Person"."companyId"
      AND m."userId" = ((select auth.uid()))::text
      AND m.role = ANY (ARRAY['COMPANY_ADMIN'::public."Role", 'TRANSPORT_MANAGER'::public."Role"])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."CompanyMembership" m
    WHERE m."companyId" = "Person"."companyId"
      AND m."userId" = ((select auth.uid()))::text
      AND m.role = ANY (ARRAY['COMPANY_ADMIN'::public."Role", 'TRANSPORT_MANAGER'::public."Role"])
  )
);

DROP POLICY IF EXISTS person_company_members_can_read ON public."Person";
CREATE POLICY person_company_members_can_read
ON public."Person"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."CompanyMembership" m
    WHERE m."companyId" = "Person"."companyId"
      AND m."userId" = ((select auth.uid()))::text
  )
);

DROP INDEX IF EXISTS public."Message_conversation_idx";

CREATE INDEX IF NOT EXISTS "CompanyBackup_createdById_idx"
  ON public."CompanyBackup" ("createdById");
CREATE INDEX IF NOT EXISTS "DataGovernanceRequest_assignedToId_idx"
  ON public."DataGovernanceRequest" ("assignedToId");
CREATE INDEX IF NOT EXISTS "DataGovernanceRequest_requestedById_idx"
  ON public."DataGovernanceRequest" ("requestedById");
CREATE INDEX IF NOT EXISTS "Document_companyId_maintenanceWorkOrderId_idx"
  ON public."Document" ("companyId", "maintenanceWorkOrderId")
  WHERE "maintenanceWorkOrderId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Job_companyId_assetId_idx"
  ON public."Job" ("companyId", "assetId")
  WHERE "assetId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Job_companyId_customerId_idx"
  ON public."Job" ("companyId", "customerId")
  WHERE "customerId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Job_companyId_siteId_idx"
  ON public."Job" ("companyId", "siteId")
  WHERE "siteId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenancePlan_companyId_depotId_idx"
  ON public."MaintenancePlan" ("companyId", "depotId")
  WHERE "depotId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenancePlan_companyId_vehicleId_idx"
  ON public."MaintenancePlan" ("companyId", "vehicleId");
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_companyId_defectId_idx"
  ON public."MaintenanceWorkOrder" ("companyId", "defectId")
  WHERE "defectId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_companyId_depotId_idx"
  ON public."MaintenanceWorkOrder" ("companyId", "depotId")
  WHERE "depotId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_companyId_planId_idx"
  ON public."MaintenanceWorkOrder" ("companyId", "planId")
  WHERE "planId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_companyId_vehicleId_idx"
  ON public."MaintenanceWorkOrder" ("companyId", "vehicleId");
