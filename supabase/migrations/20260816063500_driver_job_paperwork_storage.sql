-- Assigned drivers may only access paperwork stored beneath
-- <companyId>/jobs/<jobId>/... for jobs assigned to their Person record.
-- Existing office/company document policies remain unchanged.

drop policy if exists fleet_documents_driver_job_select on storage.objects;
drop policy if exists fleet_documents_driver_job_insert on storage.objects;
drop policy if exists fleet_documents_driver_job_delete_own on storage.objects;

create policy fleet_documents_driver_job_select
on storage.objects for select to authenticated
using (
  bucket_id = 'fleet-documents'
  and (storage.foldername(name))[2] = 'jobs'
  and exists (
    select 1
    from "CompanyMembership" cm
    join "User" u on u.id = cm."userId"
    join "JobAssignment" ja on ja."companyId" = cm."companyId" and ja."jobId" = (storage.foldername(name))[3]
    join "Person" p on p.id = ja."personId" and p."companyId" = ja."companyId" and p."userId" = u.id
    where u."authUserId" = (select auth.uid())
      and cm."companyId" = (storage.foldername(name))[1]
      and cm.role::text = 'DRIVER'
  )
);

create policy fleet_documents_driver_job_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fleet-documents'
  and (storage.foldername(name))[2] = 'jobs'
  and exists (
    select 1
    from "CompanyMembership" cm
    join "User" u on u.id = cm."userId"
    join "JobAssignment" ja on ja."companyId" = cm."companyId" and ja."jobId" = (storage.foldername(name))[3]
    join "Person" p on p.id = ja."personId" and p."companyId" = ja."companyId" and p."userId" = u.id
    where u."authUserId" = (select auth.uid())
      and cm."companyId" = (storage.foldername(name))[1]
      and cm.role::text = 'DRIVER'
  )
);

create policy fleet_documents_driver_job_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'fleet-documents'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'jobs'
  and exists (
    select 1
    from "CompanyMembership" cm
    join "User" u on u.id = cm."userId"
    join "JobAssignment" ja on ja."companyId" = cm."companyId" and ja."jobId" = (storage.foldername(name))[3]
    join "Person" p on p.id = ja."personId" and p."companyId" = ja."companyId" and p."userId" = u.id
    where u."authUserId" = (select auth.uid())
      and cm."companyId" = (storage.foldername(name))[1]
      and cm.role::text = 'DRIVER'
  )
);
