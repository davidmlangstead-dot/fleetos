create table if not exists "UserPreference" (
  "userId" text primary key references "User"(id) on delete cascade,
  "language" text not null default 'en',
  "largeText" boolean not null default false,
  "largeControls" boolean not null default false,
  "highContrast" boolean not null default false,
  "reducedMotion" boolean not null default false,
  "easyRead" boolean not null default false,
  "darkMode" boolean not null default false,
  "readAloud" boolean not null default false,
  "voiceInput" boolean not null default false,
  "updatedAt" timestamptz not null default now(),
  constraint "UserPreference_language_check" check ("language" in ('en','pl','ro','lt','bg','uk','pt','es'))
);

create table if not exists "Reseller" (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  slug text not null unique,
  status text not null default 'ACTIVE',
  "supportEmail" text,
  "supportPhone" text,
  "wholesaleModel" text not null default 'PER_TENANT',
  branding jsonb not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "Reseller_status_check" check (status in ('ACTIVE','SUSPENDED','CANCELLED')),
  constraint "Reseller_wholesale_model_check" check ("wholesaleModel" in ('PER_TENANT','PER_VEHICLE','FIXED_MINIMUM','NEGOTIATED'))
);

create table if not exists "ResellerMembership" (
  id text primary key default gen_random_uuid()::text,
  "resellerId" text not null references "Reseller"(id) on delete cascade,
  "userId" text not null references "User"(id) on delete cascade,
  role text not null default 'ADMIN',
  "createdAt" timestamptz not null default now(),
  unique ("resellerId","userId"),
  constraint "ResellerMembership_role_check" check (role in ('ADMIN','SALES','SUPPORT','VIEWER'))
);
create index if not exists "ResellerMembership_userId_idx" on "ResellerMembership"("userId");

alter table "CompanyControl" add column if not exists "resellerId" text references "Reseller"(id) on delete set null;
alter table "CompanyControl" add column if not exists "wholesaleMonthlyPence" integer;
alter table "CompanyControl" add column if not exists "retailMonthlyPence" integer;
create index if not exists "CompanyControl_resellerId_idx" on "CompanyControl"("resellerId");

create table if not exists "OperationalTransaction" (
  id text primary key default gen_random_uuid()::text,
  "companyId" text not null references "Company"(id) on delete cascade,
  type text not null,
  status text not null default 'DRAFT',
  reference text,
  counterparty text,
  description text,
  "netPence" integer not null default 0,
  "vatPence" integer not null default 0,
  "grossPence" integer not null default 0,
  "jobId" text,
  "vehicleId" text,
  "occurredAt" timestamptz not null default now(),
  "dueAt" timestamptz,
  "paidAt" timestamptz,
  "externalReference" text,
  notes text,
  "createdBy" text references "User"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "OperationalTransaction_type_check" check (type in ('QUOTE','SALES_INVOICE','PURCHASE_ORDER','SUPPLIER_INVOICE','EXPENSE','CREDIT_NOTE','PAYMENT','FUEL_COST','WORKSHOP_COST')),
  constraint "OperationalTransaction_status_check" check (status in ('DRAFT','ISSUED','APPROVED','PART_PAID','PAID','VOID','CANCELLED')),
  constraint "OperationalTransaction_amounts_check" check ("netPence" >= 0 and "vatPence" >= 0 and "grossPence" >= 0)
);
create index if not exists "OperationalTransaction_company_date_idx" on "OperationalTransaction"("companyId","occurredAt" desc);
create index if not exists "OperationalTransaction_company_type_idx" on "OperationalTransaction"("companyId",type);

alter table "UserPreference" enable row level security;
alter table "Reseller" enable row level security;
alter table "ResellerMembership" enable row level security;
alter table "OperationalTransaction" enable row level security;
revoke all on table "UserPreference", "Reseller", "ResellerMembership", "OperationalTransaction" from anon, authenticated;
