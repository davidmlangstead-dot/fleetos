create table if not exists public."DriverEvidence" (
  id uuid primary key default gen_random_uuid(),
  "companyId" text not null references public."Company"(id) on delete cascade,
  "driverId" text not null references public."Driver"(id) on delete cascade,
  "entityType" text not null check ("entityType" in ('WALKAROUND','BREAKDOWN')),
  "entityId" uuid not null,
  "itemId" text,
  "mimeType" text not null default 'image/jpeg',
  data text not null,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  "capturedAt" timestamptz not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists "DriverEvidence_company_entity_idx" on public."DriverEvidence"("companyId","entityType","entityId");
create index if not exists "DriverEvidence_driver_idx" on public."DriverEvidence"("driverId","createdAt" desc);

alter table public."DriverEvidence" enable row level security;
revoke all on table public."DriverEvidence" from anon, authenticated;
