-- Preserve the non-null tenant key when an optional linked record is removed.
-- PostgreSQL 17 supports column-specific SET NULL actions on composite FKs.

ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_companyId_depotId_fkey";
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_depotId_fkey"
  FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id)
  ON DELETE SET NULL ("depotId");

ALTER TABLE "Driver" DROP CONSTRAINT IF EXISTS "Driver_companyId_depotId_fkey";
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_companyId_depotId_fkey"
  FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id)
  ON DELETE SET NULL ("depotId");

ALTER TABLE "Person" DROP CONSTRAINT IF EXISTS "Person_companyId_depotId_fkey";
ALTER TABLE "Person" ADD CONSTRAINT "Person_companyId_depotId_fkey"
  FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id)
  ON DELETE SET NULL ("depotId");

ALTER TABLE "MaintenancePlan" DROP CONSTRAINT IF EXISTS "MaintenancePlan_companyId_depotId_fkey";
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_companyId_depotId_fkey"
  FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id)
  ON DELETE SET NULL ("depotId");

ALTER TABLE "MaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "MaintenanceWorkOrder_companyId_depotId_fkey";
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_companyId_depotId_fkey"
  FOREIGN KEY ("companyId", "depotId") REFERENCES "Depot" ("companyId", id)
  ON DELETE SET NULL ("depotId");

ALTER TABLE "MaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "MaintenanceWorkOrder_companyId_planId_fkey";
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_companyId_planId_fkey"
  FOREIGN KEY ("companyId", "planId") REFERENCES "MaintenancePlan" ("companyId", id)
  ON DELETE SET NULL ("planId");

ALTER TABLE "MaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "MaintenanceWorkOrder_companyId_defectId_fkey";
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_companyId_defectId_fkey"
  FOREIGN KEY ("companyId", "defectId") REFERENCES "Defect" ("companyId", id)
  ON DELETE SET NULL ("defectId");

ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_companyId_maintenanceWorkOrderId_fkey";
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_maintenanceWorkOrderId_fkey"
  FOREIGN KEY ("companyId", "maintenanceWorkOrderId") REFERENCES "MaintenanceWorkOrder" ("companyId", id)
  ON DELETE SET NULL ("maintenanceWorkOrderId");
