import { readFile } from "node:fs/promises";

const [organisation, vehicles, personalUi, vehicleUi] = await Promise.all([
  readFile(new URL("../apps/api/src/modules/organisation/routes.ts", import.meta.url), "utf8"),
  readFile(new URL("../apps/api/src/modules/vehicles/routes.ts", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/src/modules/personal/PersonalPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/src/modules/vehicles/VehiclesPage.tsx", import.meta.url), "utf8"),
]);

const checks = [
  [organisation, 'organisationRouter.delete("/staff/:id", managers', "staff removal requires a manager role"],
  [organisation, 'p."companyId"=${req.user!.companyId}', "staff lookup is tenant scoped"],
  [organisation, "You cannot remove your own access", "staff removal blocks self-lockout"],
  [organisation, "The company owner cannot be removed", "staff removal protects the company owner"],
  [organisation, 'UPDATE "Person"', "staff record is archived"],
  [organisation, 'UPDATE "Driver"', "linked driver record is archived"],
  [organisation, 'DELETE FROM "CompanyMembership"', "company access is revoked"],
  [organisation, 'entityType:"PERSON"', "staff removal is audited"],
  [vehicles, 'vehiclesRouter.delete("/:id", vehicleWriters', "vehicle removal requires a write role"],
  [vehicles, 'status:{ notIn:["COMPLETED"', "vehicle removal checks active jobs"],
  [vehicles, 'MaintenanceWorkOrder', "vehicle removal checks workshop orders"],
  [vehicles, 'data:{ status:"ARCHIVED" }', "vehicle history is archived instead of deleted"],
  [vehicles, 'status: { not: "ARCHIVED" }', "archived vehicles no longer consume the active plan limit"],
  [vehicles, 'entityType:"VEHICLE"', "vehicle removal is audited"],
  [personalUi, 'method: "DELETE"', "staff page calls the removal endpoint"],
  [vehicleUi, 'method:"DELETE"', "vehicle page calls the removal endpoint"],
];

for (const [source, text, message] of checks) {
  if (!source.includes(text)) {
    console.error(`FAIL removal contract: ${message}`);
    process.exit(1);
  }
}

console.log(`PASS removal contract: ${checks.length}/${checks.length} staff and vehicle safeguards found.`);
