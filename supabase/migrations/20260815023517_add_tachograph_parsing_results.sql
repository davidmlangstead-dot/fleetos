alter table public."TachographDownload"
  add column if not exists "parseStatus" text not null default 'PENDING',
  add column if not exists "parsedFileType" text,
  add column if not exists "parsedAt" timestamptz,
  add column if not exists "parserVersion" text,
  add column if not exists "parsedData" jsonb,
  add column if not exists "parseError" text,
  add column if not exists "signatureStatus" text not null default 'NOT_VERIFIED';

alter table public."TachographDownload"
  drop constraint if exists "TachographDownload_parseStatus_check",
  add constraint "TachographDownload_parseStatus_check" check ("parseStatus" in ('PENDING','PARSED','FAILED')),
  drop constraint if exists "TachographDownload_signatureStatus_check",
  add constraint "TachographDownload_signatureStatus_check" check ("signatureStatus" in ('NOT_VERIFIED','VERIFIED','FAILED'));

revoke all on table public."TachographDownload" from anon, authenticated;

comment on column public."TachographDownload"."parsedData" is 'Derived semantic tachograph data produced by the pinned FleetOS parser. The original DDD document remains the source evidence.';
comment on column public."TachographDownload"."signatureStatus" is 'Cryptographic signature verification state. Parsing alone must never be represented as signature verification.';
