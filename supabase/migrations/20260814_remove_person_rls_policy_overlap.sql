-- Keep one SELECT policy for all company members, including admins,
-- and use explicit write policies for administrative roles.

DROP POLICY IF EXISTS person_company_admins_can_manage ON public."Person";

CREATE POLICY person_company_admins_can_insert
ON public."Person"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."CompanyMembership" m
    WHERE m."companyId" = "Person"."companyId"
      AND m."userId" = ((select auth.uid()))::text
      AND m.role = ANY (ARRAY['COMPANY_ADMIN'::public."Role", 'TRANSPORT_MANAGER'::public."Role"])
  )
);

CREATE POLICY person_company_admins_can_update
ON public."Person"
FOR UPDATE
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

CREATE POLICY person_company_admins_can_delete
ON public."Person"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."CompanyMembership" m
    WHERE m."companyId" = "Person"."companyId"
      AND m."userId" = ((select auth.uid()))::text
      AND m.role = ANY (ARRAY['COMPANY_ADMIN'::public."Role", 'TRANSPORT_MANAGER'::public."Role"])
  )
);
