create table if not exists public."TachographDownload" (
  id uuid primary key default gen_random_uuid(),
  "companyId" text not null references public."Company"(id) on delete cascade,
  "driverId" text not null references public."Driver"(id) on delete cascade,
  "documentId" text not null unique references public."Document"(id) on delete cascade,
  "originalFilename" text not null,
  "fileSize" integer,
  "downloadedAt" timestamptz not null,
  "nextDueAt" timestamptz not null,
  source text not null default 'MANUAL_UPLOAD' check (source in ('MANUAL_UPLOAD','LOCAL_BRIDGE','REMOTE_IMPORT')),
  status text not null default 'RECEIVED' check (status in ('RECEIVED','VERIFIED','REJECTED')),
  "createdById" text references public."User"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "TachographDownload_companyId_downloadedAt_idx" on public."TachographDownload" ("companyId", "downloadedAt" desc);
create index if not exists "TachographDownload_companyId_nextDueAt_idx" on public."TachographDownload" ("companyId", "nextDueAt");
create index if not exists "TachographDownload_driverId_downloadedAt_idx" on public."TachographDownload" ("driverId", "downloadedAt" desc);

alter table public."TachographDownload" enable row level security;
revoke all on table public."TachographDownload" from anon, authenticated;
comment on table public."TachographDownload" is 'Tenant-scoped register of original tachograph driver-card download evidence. FleetOS stores the source file and download schedule; it does not replace the statutory tachograph record.';
