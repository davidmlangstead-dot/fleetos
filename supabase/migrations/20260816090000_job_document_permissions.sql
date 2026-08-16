alter type "DocumentType" add value if not exists 'RAMS';
alter type "DocumentType" add value if not exists 'FIELD_PAPERWORK';

-- Drivers upload only to an assigned job's dedicated field folder. Office policies
-- continue to cover all company job-document paths, and the bucket remains private.
drop policy if exists fleet_documents_driver_job_insert on storage.objects;

create policy fleet_documents_driver_job_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fleet-documents'
  and (storage.foldername(name))[2] = 'jobs'
  and (storage.foldername(name))[4] = 'field'
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

