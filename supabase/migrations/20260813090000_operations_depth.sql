-- FleetOS commercial v1 operations depth: depot relationships, workshop/PMI,
-- document evidence links and message read state.

CREATE UNIQUE INDEX IF NOT EXISTS "Depot_companyId_id_key" ON "Depot" ("companyId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_companyId_id_key" ON "Vehicle" ("companyId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "Defect_companyId_id_key" ON "Defect" ("companyId", id);

ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "depotId" uuid;
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "depotId" uuid;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "depotId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vehicle_companyId_depotId_fkey') THEN
    ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_depotId_fkey"
      FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Driver_companyId_depotId_fkey') THEN
    ALTER TABLE "Driver" ADD CONSTRAINT "Driver_companyId_depotId_fkey"
      FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Person_companyId_depotId_fkey') THEN
    ALTER TABLE "Person" ADD CONSTRAINT "Person_companyId_depotId_fkey"
      FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Vehicle_companyId_depotId_idx" ON "Vehicle" ("companyId", "depotId");
CREATE INDEX IF NOT EXISTS "Driver_companyId_depotId_idx" ON "Driver" ("companyId", "depotId");
CREATE INDEX IF NOT EXISTS "Person_companyId_depotId_idx" ON "Person" ("companyId", "depotId");

UPDATE "Vehicle" v
SET "depotId" = d.id
FROM "Depot" d
WHERE v."depotId" IS NULL
  AND v.depot IS NOT NULL
  AND d."companyId" = v."companyId"
  AND lower(d.name) = lower(v.depot);

CREATE TABLE IF NOT EXISTS "MaintenancePlan" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "vehicleId" text NOT NULL,
  "depotId" uuid,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'PMI',
  "intervalWeeks" integer NOT NULL DEFAULT 6,
  "nextDueAt" timestamptz NOT NULL,
  "lastCompletedAt" timestamptz,
  "odometerInterval" integer,
  "nextDueMileage" integer,
  notes text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MaintenancePlan_category_check" CHECK (category IN ('PMI','SERVICE','MOT_PREP','TACHO','TYRES','OTHER')),
  CONSTRAINT "MaintenancePlan_intervalWeeks_check" CHECK ("intervalWeeks" BETWEEN 1 AND 104),
  CONSTRAINT "MaintenancePlan_odometerInterval_check" CHECK ("odometerInterval" IS NULL OR "odometerInterval" > 0),
  CONSTRAINT "MaintenancePlan_nextDueMileage_check" CHECK ("nextDueMileage" IS NULL OR "nextDueMileage" >= 0),
  CONSTRAINT "MaintenancePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" (id) ON DELETE CASCADE,
  CONSTRAINT "MaintenancePlan_companyId_vehicleId_fkey" FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle" ("companyId", id) ON DELETE CASCADE,
  CONSTRAINT "MaintenancePlan_companyId_depotId_fkey" FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "MaintenancePlan_companyId_id_key" ON "MaintenancePlan" ("companyId", id);
CREATE INDEX IF NOT EXISTS "MaintenancePlan_companyId_due_idx" ON "MaintenancePlan" ("companyId", "nextDueAt") WHERE "isActive" = true;
CREATE INDEX IF NOT EXISTS "MaintenancePlan_vehicleId_idx" ON "MaintenancePlan" ("vehicleId");
CREATE INDEX IF NOT EXISTS "MaintenancePlan_depotId_idx" ON "MaintenancePlan" ("depotId") WHERE "depotId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "MaintenanceWorkOrder" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" text NOT NULL,
  "vehicleId" text NOT NULL,
  "depotId" uuid,
  "planId" uuid,
  "defectId" text,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'REPAIR',
  status text NOT NULL DEFAULT 'PLANNED',
  priority text NOT NULL DEFAULT 'ROUTINE',
  description text,
  "scheduledFor" timestamptz,
  "dueAt" timestamptz,
  "assignedTo" text,
  supplier text,
  "completionNotes" text,
  "costPence" integer,
  odometer integer,
  "createdById" text,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MaintenanceWorkOrder_category_check" CHECK (category IN ('PMI','SERVICE','MOT_PREP','TACHO','TYRES','DEFECT','REPAIR','OTHER')),
  CONSTRAINT "MaintenanceWorkOrder_status_check" CHECK (status IN ('PLANNED','BOOKED','IN_PROGRESS','WAITING_PARTS','COMPLETED','CANCELLED')),
  CONSTRAINT "MaintenanceWorkOrder_priority_check" CHECK (priority IN ('ROUTINE','URGENT','VEHICLE_OFF_ROAD')),
  CONSTRAINT "MaintenanceWorkOrder_costPence_check" CHECK ("costPence" IS NULL OR "costPence" >= 0),
  CONSTRAINT "MaintenanceWorkOrder_odometer_check" CHECK (odometer IS NULL OR odometer >= 0),
  CONSTRAINT "MaintenanceWorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" (id) ON DELETE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_companyId_vehicleId_fkey" FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle" ("companyId", id) ON DELETE CASCADE,
  CONSTRAINT "MaintenanceWorkOrder_companyId_depotId_fkey" FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id) ON DELETE SET NULL,
  CONSTRAINT "MaintenanceWorkOrder_companyId_planId_fkey" FOREIGN KEY ("companyId", "planId") REFERENCES "MaintenancePlan" ("companyId", id) ON DELETE SET NULL,
  CONSTRAINT "MaintenanceWorkOrder_companyId_defectId_fkey" FOREIGN KEY ("companyId", "defectId") REFERENCES "Defect" ("companyId", id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceWorkOrder_companyId_id_key" ON "MaintenanceWorkOrder" ("companyId", id);
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_companyId_status_due_idx" ON "MaintenanceWorkOrder" ("companyId", status, "dueAt");
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_vehicleId_idx" ON "MaintenanceWorkOrder" ("vehicleId");
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_depotId_idx" ON "MaintenanceWorkOrder" ("depotId") WHERE "depotId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_planId_idx" ON "MaintenanceWorkOrder" ("planId") WHERE "planId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "MaintenanceWorkOrder_defectId_idx" ON "MaintenanceWorkOrder" ("defectId") WHERE "defectId" IS NOT NULL;

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "maintenanceWorkOrderId" uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_companyId_maintenanceWorkOrderId_fkey') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_maintenanceWorkOrderId_fkey"
      FOREIGN KEY ("companyId", "maintenanceWorkOrderId") REFERENCES "MaintenanceWorkOrder" ("companyId", id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Document_maintenanceWorkOrderId_idx" ON "Document" ("maintenanceWorkOrderId") WHERE "maintenanceWorkOrderId" IS NOT NULL;

ALTER TABLE "ConversationMember" ADD COLUMN IF NOT EXISTS "lastReadAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz;
CREATE INDEX IF NOT EXISTS "Conversation_companyId_archived_updated_idx" ON "Conversation" ("companyId", "archivedAt", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message" ("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationMember_userId_lastReadAt_idx" ON "ConversationMember" ("userId", "lastReadAt");

ALTER TABLE "MaintenancePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceWorkOrder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MaintenancePlan", "MaintenanceWorkOrder" FROM anon, authenticated;
GRANT ALL ON TABLE "MaintenancePlan", "MaintenanceWorkOrder" TO service_role;
