-- Connected driver operations: DVSA-style checks, breakdowns, absence and training.
-- These records are only exposed through the authenticated FleetOS API.

CREATE TABLE IF NOT EXISTS public."DriverWalkaroundCheck" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "driverId" text NOT NULL,
  "vehicleId" text NOT NULL,
  "trailerVehicleId" text,
  "vehicleType" text NOT NULL,
  "checklistVersion" text NOT NULL DEFAULT 'DVSA-2026.1',
  status text NOT NULL CHECK (status IN ('ROADWORTHY','DEFECTS_REPORTED','UNSAFE')),
  "nilDefect" boolean NOT NULL DEFAULT false,
  "roadworthyConfirmed" boolean NOT NULL DEFAULT false,
  odometer integer CHECK (odometer IS NULL OR odometer >= 0),
  location text,
  notes text,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  "defectIds" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("defectIds") = 'array'),
  "signatureName" text NOT NULL,
  "startedAt" timestamptz NOT NULL,
  "completedAt" timestamptz NOT NULL,
  "durationSeconds" integer NOT NULL CHECK ("durationSeconds" BETWEEN 0 AND 86400),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DriverWalkaroundCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "DriverWalkaroundCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public."Driver"(id) ON DELETE RESTRICT,
  CONSTRAINT "DriverWalkaroundCheck_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public."Vehicle"(id) ON DELETE RESTRICT,
  CONSTRAINT "DriverWalkaroundCheck_trailerVehicleId_fkey" FOREIGN KEY ("trailerVehicleId") REFERENCES public."Vehicle"(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "DriverWalkaroundCheck_company_completed_idx" ON public."DriverWalkaroundCheck" ("companyId", "completedAt" DESC);
CREATE INDEX IF NOT EXISTS "DriverWalkaroundCheck_driver_completed_idx" ON public."DriverWalkaroundCheck" ("driverId", "completedAt" DESC);
CREATE INDEX IF NOT EXISTS "DriverWalkaroundCheck_vehicle_completed_idx" ON public."DriverWalkaroundCheck" ("vehicleId", "completedAt" DESC);

CREATE TABLE IF NOT EXISTS public."DriverBreakdown" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "driverId" text NOT NULL,
  "vehicleId" text NOT NULL,
  "reportedByUserId" text NOT NULL,
  "defectId" text,
  severity text NOT NULL CHECK (severity IN ('MINOR','LIMITED','UNSAFE','IMMOBILE')),
  status text NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED','ACKNOWLEDGED','RECOVERY_ARRANGED','RESOLVED','CANCELLED')),
  location text NOT NULL,
  description text NOT NULL,
  "canMove" boolean NOT NULL DEFAULT false,
  "occupantsSafe" boolean NOT NULL DEFAULT true,
  "contactNumber" text,
  "resolutionNotes" text,
  "reportedAt" timestamptz NOT NULL DEFAULT now(),
  "acknowledgedAt" timestamptz,
  "resolvedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DriverBreakdown_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "DriverBreakdown_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public."Driver"(id) ON DELETE RESTRICT,
  CONSTRAINT "DriverBreakdown_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public."Vehicle"(id) ON DELETE RESTRICT,
  CONSTRAINT "DriverBreakdown_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES public."User"(id) ON DELETE RESTRICT,
  CONSTRAINT "DriverBreakdown_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES public."Defect"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "DriverBreakdown_company_status_idx" ON public."DriverBreakdown" ("companyId", status, "reportedAt" DESC);
CREATE INDEX IF NOT EXISTS "DriverBreakdown_driver_reported_idx" ON public."DriverBreakdown" ("driverId", "reportedAt" DESC);

CREATE TABLE IF NOT EXISTS public."StaffAbsenceRequest" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "driverId" text NOT NULL,
  "userId" text NOT NULL,
  type text NOT NULL CHECK (type IN ('HOLIDAY','SICKNESS','OTHER')),
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','DECLINED','REPORTED','CLOSED','CANCELLED')),
  "startsOn" date NOT NULL,
  "endsOn" date NOT NULL,
  reason text,
  "officeNotes" text,
  "reviewedById" text,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "StaffAbsenceRequest_dates_check" CHECK ("endsOn" >= "startsOn"),
  CONSTRAINT "StaffAbsenceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "StaffAbsenceRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public."Driver"(id) ON DELETE RESTRICT,
  CONSTRAINT "StaffAbsenceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE RESTRICT,
  CONSTRAINT "StaffAbsenceRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES public."User"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "StaffAbsenceRequest_company_status_idx" ON public."StaffAbsenceRequest" ("companyId", status, "startsOn");
CREATE INDEX IF NOT EXISTS "StaffAbsenceRequest_driver_dates_idx" ON public."StaffAbsenceRequest" ("driverId", "startsOn" DESC, "endsOn" DESC);

CREATE TABLE IF NOT EXISTS public."DriverTrainingRecord" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "driverId" text NOT NULL,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('DRIVER_CPC','LICENCE','TACHOGRAPH','SAFETY','VEHICLE','SITE','OTHER')),
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','BOOKED','COMPLETED','EXPIRED','CANCELLED')),
  provider text,
  "dueDate" date,
  "bookedDate" date,
  "completedDate" date,
  "expiryDate" date,
  notes text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DriverTrainingRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Company"(id) ON DELETE CASCADE,
  CONSTRAINT "DriverTrainingRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public."Driver"(id) ON DELETE RESTRICT,
  CONSTRAINT "DriverTrainingRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "DriverTrainingRecord_company_status_idx" ON public."DriverTrainingRecord" ("companyId", status, "dueDate");
CREATE INDEX IF NOT EXISTS "DriverTrainingRecord_driver_due_idx" ON public."DriverTrainingRecord" ("driverId", "dueDate");

ALTER TABLE public."DriverWalkaroundCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DriverBreakdown" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StaffAbsenceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DriverTrainingRecord" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."DriverWalkaroundCheck", public."DriverBreakdown", public."StaffAbsenceRequest", public."DriverTrainingRecord" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public."DriverWalkaroundCheck", public."DriverBreakdown", public."StaffAbsenceRequest", public."DriverTrainingRecord" TO service_role;

COMMENT ON TABLE public."DriverWalkaroundCheck" IS 'Signed daily vehicle checks retained as operator evidence; FleetOS provides no delete endpoint.';
COMMENT ON TABLE public."DriverBreakdown" IS 'Driver roadside breakdown reports linked to vehicle defects and office action.';
COMMENT ON TABLE public."StaffAbsenceRequest" IS 'Driver holiday and sickness records visible only through authorised FleetOS API roles.';
COMMENT ON TABLE public."DriverTrainingRecord" IS 'Driver training plan, completion and expiry records managed by authorised office roles.';
