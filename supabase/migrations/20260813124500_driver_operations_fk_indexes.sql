-- Cover the remaining driver-operations foreign keys for predictable lookups.

CREATE INDEX IF NOT EXISTS "DriverWalkaroundCheck_trailerVehicleId_idx"
  ON public."DriverWalkaroundCheck" ("trailerVehicleId");

CREATE INDEX IF NOT EXISTS "DriverBreakdown_vehicleId_idx"
  ON public."DriverBreakdown" ("vehicleId");
CREATE INDEX IF NOT EXISTS "DriverBreakdown_reportedByUserId_idx"
  ON public."DriverBreakdown" ("reportedByUserId");
CREATE INDEX IF NOT EXISTS "DriverBreakdown_defectId_idx"
  ON public."DriverBreakdown" ("defectId");

CREATE INDEX IF NOT EXISTS "StaffAbsenceRequest_userId_idx"
  ON public."StaffAbsenceRequest" ("userId");
CREATE INDEX IF NOT EXISTS "StaffAbsenceRequest_reviewedById_idx"
  ON public."StaffAbsenceRequest" ("reviewedById");

CREATE INDEX IF NOT EXISTS "DriverTrainingRecord_createdById_idx"
  ON public."DriverTrainingRecord" ("createdById");
