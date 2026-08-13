import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

type Alert = {
  id: string;
  kind: "COMPLIANCE" | "DEFECT" | "MAINTENANCE" | "MEDIC" | "DRIVER";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  detail: string | null;
  occurredAt: string;
  href: string;
};
type MedicRow = { id: string; severity: string; summary: string; detail: string | null; createdAt: Date };
type PlanRow = { id: string; title: string; category: string; nextDueAt: Date; registration: string };
type WorkRow = { id: string; title: string; status: string; priority: string; dueAt: Date | null; scheduledFor: Date | null; createdAt: Date; registration: string };
type DriverOpsAlertRow = { id: string; severity: "WARNING" | "CRITICAL"; title: string; detail: string; occurredAt: Date };

const complianceRoles = new Set(["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);
const defectRoles = new Set(["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);
const workshopRoles = new Set(["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);
const medicRoles = new Set(["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);
const driverOpsRoles = new Set(["TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const role = req.user!.role;
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [compliance, defects, plans, workOrders, medic, driverOps] = await Promise.all([
    complianceRoles.has(role)
      ? prisma.complianceItem.findMany({ where: { companyId, status: { not: "RESOLVED" }, dueDate: { lte: soon } }, select: { id: true, title: true, dueDate: true, description: true }, orderBy: { dueDate: "asc" }, take: 20 })
      : Promise.resolve([]),
    defectRoles.has(role)
      ? prisma.defect.findMany({ where: { companyId, status: { not: "RESOLVED" } }, select: { id: true, title: true, severity: true, createdAt: true, vehicle: { select: { registration: true } } }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
    workshopRoles.has(role)
      ? prisma.$queryRaw<PlanRow[]>`
          SELECT p.id::text,p.title,p.category,p."nextDueAt",v.registration
          FROM "MaintenancePlan" p JOIN "Vehicle" v ON v.id=p."vehicleId" AND v."companyId"=p."companyId"
          WHERE p."companyId"=${companyId} AND p."isActive"=true AND p."nextDueAt"<=${soon}
          ORDER BY p."nextDueAt" ASC LIMIT 20
        `
      : Promise.resolve([] as PlanRow[]),
    workshopRoles.has(role)
      ? prisma.$queryRaw<WorkRow[]>`
          SELECT w.id::text,w.title,w.status,w.priority,w."dueAt",w."scheduledFor",w."createdAt",v.registration
          FROM "MaintenanceWorkOrder" w JOIN "Vehicle" v ON v.id=w."vehicleId" AND v."companyId"=w."companyId"
          WHERE w."companyId"=${companyId} AND w.priority='VEHICLE_OFF_ROAD' AND w.status NOT IN ('COMPLETED','CANCELLED')
          ORDER BY COALESCE(w."dueAt",w."scheduledFor",w."createdAt") ASC LIMIT 20
        `
      : Promise.resolve([] as WorkRow[]),
    medicRoles.has(role)
      ? prisma.$queryRaw<MedicRow[]>`
          SELECT id::text, severity, summary, detail, "createdAt"
          FROM "MedicIncident"
          WHERE "companyId" = ${companyId} AND status <> 'RESOLVED'
          ORDER BY "createdAt" DESC LIMIT 20
        `
      : Promise.resolve([] as MedicRow[]),
    driverOpsRoles.has(role)
      ? prisma.$queryRaw<DriverOpsAlertRow[]>`
          SELECT 'breakdown:'||b.id::text AS id,
            CASE WHEN b.severity IN ('UNSAFE','IMMOBILE') THEN 'CRITICAL' ELSE 'WARNING' END AS severity,
            v.registration||': breakdown reported' AS title,
            d."firstName"||' '||d."lastName"||' · '||b.location AS detail,
            b."reportedAt" AS "occurredAt"
          FROM "DriverBreakdown" b JOIN "Vehicle" v ON v.id=b."vehicleId" JOIN "Driver" d ON d.id=b."driverId"
          WHERE b."companyId"=${companyId} AND b.status NOT IN ('RESOLVED','CANCELLED')
          UNION ALL
          SELECT 'absence:'||a.id::text,'WARNING',d."firstName"||' '||d."lastName"||': '||lower(a.type),
            to_char(a."startsOn",'DD Mon YYYY')||' to '||to_char(a."endsOn",'DD Mon YYYY'),a."createdAt"
          FROM "StaffAbsenceRequest" a JOIN "Driver" d ON d.id=a."driverId"
          WHERE a."companyId"=${companyId} AND a.status IN ('PENDING','REPORTED')
          UNION ALL
          SELECT 'training:'||t.id::text,CASE WHEN t."dueDate"<CURRENT_DATE THEN 'CRITICAL' ELSE 'WARNING' END,
            d."firstName"||' '||d."lastName"||': training '||CASE WHEN t."dueDate"<CURRENT_DATE THEN 'overdue' ELSE 'due soon' END,
            t.title||' · due '||to_char(t."dueDate",'DD Mon YYYY'),COALESCE(t."dueDate"::timestamptz,t."createdAt")
          FROM "DriverTrainingRecord" t JOIN "Driver" d ON d.id=t."driverId"
          WHERE t."companyId"=${companyId} AND t.status NOT IN ('COMPLETED','CANCELLED') AND t."dueDate"<=CURRENT_DATE+30
          ORDER BY "occurredAt" DESC LIMIT 30
        `
      : Promise.resolve([] as DriverOpsAlertRow[]),
  ]);

  const alerts: Alert[] = [];
  for (const item of compliance) {
    const overdue = item.dueDate < now;
    alerts.push({ id: `compliance:${item.id}`, kind: "COMPLIANCE", severity: overdue ? "CRITICAL" : "WARNING", title: overdue ? `Overdue: ${item.title}` : `Due soon: ${item.title}`, detail: item.description, occurredAt: item.dueDate.toISOString(), href: "/compliance" });
  }
  for (const defect of defects) {
    const high = ["HIGH", "CRITICAL", "DANGEROUS"].includes((defect.severity ?? "").toUpperCase());
    alerts.push({ id: `defect:${defect.id}`, kind: "DEFECT", severity: high ? "CRITICAL" : "WARNING", title: defect.vehicle?.registration ? `${defect.vehicle.registration}: ${defect.title}` : defect.title, detail: defect.severity ? `Open defect Â· ${defect.severity}` : "Open defect", occurredAt: defect.createdAt.toISOString(), href: "/workshop" });
  }
  for (const plan of plans) {
    const overdue = plan.nextDueAt < now;
    alerts.push({ id: `maintenance-plan:${plan.id}`, kind: "MAINTENANCE", severity: overdue ? "CRITICAL" : "WARNING", title: `${plan.registration}: ${plan.title}`, detail: overdue ? `${plan.category} schedule is overdue` : `${plan.category} is due within 30 days`, occurredAt: plan.nextDueAt.toISOString(), href: "/workshop" });
  }
  for (const work of workOrders) {
    const when = work.dueAt ?? work.scheduledFor ?? work.createdAt;
    alerts.push({ id: `work-order:${work.id}`, kind: "MAINTENANCE", severity: "CRITICAL", title: `${work.registration}: vehicle off road`, detail: `${work.title} Â· ${work.status.replaceAll("_", " ")}`, occurredAt: when.toISOString(), href: "/workshop" });
  }
  for (const incident of medic) {
    alerts.push({ id: `medic:${incident.id}`, kind: "MEDIC", severity: incident.severity === "CRITICAL" ? "CRITICAL" : "WARNING", title: incident.summary, detail: incident.detail, occurredAt: incident.createdAt.toISOString(), href: "/settings/medic" });
  }
  for (const item of driverOps) {
    alerts.push({ id: item.id, kind: "DRIVER", severity: item.severity, title: item.title, detail: item.detail, occurredAt: item.occurredAt.toISOString(), href: "/driver-operations" });
  }

  const severityRank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.occurredAt.localeCompare(a.occurredAt));
  res.json({ total: alerts.length, critical: alerts.filter((item) => item.severity === "CRITICAL").length, items: alerts.slice(0, 30) });
}));


