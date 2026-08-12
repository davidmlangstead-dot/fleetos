CREATE TABLE IF NOT EXISTS public."Person" (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId" text NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  "userId" text NULL REFERENCES public."User"(id) ON DELETE SET NULL,
  "firstName" text NOT NULL,
  "lastName" text NOT NULL,
  email text NULL,
  phone text NULL,
  "personType" text NOT NULL CHECK ("personType" IN ('DRIVER','OFFICE','WORKSHOP','SUPERVISOR','MANAGER','ADMIN')),
  "accessRole" text NOT NULL CHECK ("accessRole" IN ('DRIVER','OFFICE','WORKSHOP','SUPERVISOR','MANAGER','ADMIN')),
  "startDate" timestamp NULL,
  "dateOfBirth" timestamp NULL,
  address text NULL,
  postcode text NULL,
  "emergencyContact" text NULL,
  "emergencyPhone" text NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Person_companyId_idx" ON public."Person"("companyId");
CREATE INDEX IF NOT EXISTS "Person_userId_idx" ON public."Person"("userId");
ALTER TABLE public."Person" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "person_company_members_can_read" ON public."Person" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public."CompanyMembership" m WHERE m."companyId" = "Person"."companyId" AND m."userId" = auth.uid()::text));
CREATE POLICY "person_company_admins_can_manage" ON public."Person" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public."CompanyMembership" m WHERE m."companyId" = "Person"."companyId" AND m."userId" = auth.uid()::text AND m.role IN ('COMPANY_ADMIN','TRANSPORT_MANAGER'))) WITH CHECK (EXISTS (SELECT 1 FROM public."CompanyMembership" m WHERE m."companyId" = "Person"."companyId" AND m."userId" = auth.uid()::text AND m.role IN ('COMPANY_ADMIN','TRANSPORT_MANAGER')));