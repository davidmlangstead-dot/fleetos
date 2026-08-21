create schema if not exists private;

create or replace function private.staff_can_access_fleet_storage(
  object_name text,
  write_access boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public."CompanyMembership" cm
      join public."User" u on u.id = cm."userId"
      where u."authUserId" = (select auth.uid())
        and cm."companyId" = (storage.foldername(object_name))[1]
        and (
          (
            write_access
            and cm.role::text = any (array[
              'WORKSHOP_TECHNICIAN',
              'TRANSPORT_PLANNER',
              'TRANSPORT_MANAGER',
              'OFFICE_STAFF',
              'COMPANY_ADMIN',
              'PLATFORM_ADMIN'
            ])
          )
          or (
            not write_access
            and cm.role::text = any (array[
              'WORKSHOP_TECHNICIAN',
              'TRANSPORT_PLANNER',
              'TRANSPORT_MANAGER',
              'OFFICE_STAFF',
              'FINANCE',
              'COMPANY_ADMIN',
              'PLATFORM_ADMIN'
            ])
          )
        )
    );
$$;

revoke all on function private.staff_can_access_fleet_storage(text, boolean) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.staff_can_access_fleet_storage(text, boolean) to authenticated;

drop policy if exists fleet_documents_select on storage.objects;
create policy fleet_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'fleet-documents'
  and (select private.staff_can_access_fleet_storage(name, false))
);

drop policy if exists fleet_documents_insert on storage.objects;
create policy fleet_documents_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fleet-documents'
  and (select private.staff_can_access_fleet_storage(name, true))
);

drop policy if exists fleet_documents_update on storage.objects;
create policy fleet_documents_update
on storage.objects for update to authenticated
using (
  bucket_id = 'fleet-documents'
  and (select private.staff_can_access_fleet_storage(name, true))
)
with check (
  bucket_id = 'fleet-documents'
  and (select private.staff_can_access_fleet_storage(name, true))
);

drop policy if exists fleet_documents_delete on storage.objects;
create policy fleet_documents_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'fleet-documents'
  and (select private.staff_can_access_fleet_storage(name, true))
);
