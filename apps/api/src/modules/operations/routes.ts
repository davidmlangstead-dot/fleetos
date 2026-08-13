import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const activities = ["DRIVING", "OTHER_WORK", "POA", "BREAK_REST"] as const;
type Activity = typeof activities[number];
type ActivityRow = { id: string; driverId: string; activity: Activity; startedAt: Date; endedAt: Date | null };
type MaintenancePlanRow = {
  id: string; vehicleId: string; depotId: string | null; title: string; category: string;
  intervalWeeks: number; nextDueAt: Date; lastCompletedAt: Date | null; odometerInterval: number | null;
  nextDueMileage: number | null; notes: string | null; isActive: boolean; createdAt: Date; updatedAt: Date;
  registration: string; depotName: string | null;
};
type WorkOrderRow = {
  id: string; vehicleId: string; depotId: string | null; planId: string | null; defectId: string | null;
  title: string; category: string; status: string; priority: string; description: string | null;
  scheduledFor: Date | null; dueAt: Date | null; assignedTo: string | null; supplier: string | null;
  completionNotes: string | null; costPence: number | null; odometer: number | null; completedAt: Date | null;
  createdAt: Date; updatedAt: Date; registration: string; depotName: string | null;
};

const planCategories = ["PMI", "SERVICE", "MOT_PREP", "TACHO", "TYRES", "OTHER"] as const;
const workCategories = ["PMI", "SERVICE", "MOT_PREP", "TACHO", "TYRES", "DEFECT", "REPAIR", "OTHER"] as const;
const workStatuses = ["PLANNED", "BOOKED", "IN_PROGRESS", "WAITING_PARTS", "COMPLETED", "CANCELLED"] as const;
const priorities = ["ROUTINE", "URGENT", "VEHICLE_OFF_ROAD"] as const;
const nullableUuid = z.union([z.string().uuid(), z.literal("")]).optional();
const nullableId = z.union([z.string().trim().min(1), z.literal("")]).optional();

const planInput = z.object({
  vehicleId: z.string().trim().min(1), depotId: nullableUuid, title: z.string().trim().min(1).max(160),
  category: z.enum(planCategories).default("PMI"), intervalWeeks: z.number().int().min(1).max(104),
  nextDueAt: z.coerce.date(), odometerInterval: z.number().int().positive().optional(),
  nextDueMileage: z.number().int().min(0).optional(), notes: z.string().trim().max(3000).optional(),
});
const planUpdate = planInput.partial().extend({ isActive: z.boolean().optional() });
const workOrderInput = z.object({
  vehicleId: z.string().trim().min(1), depotId: nullableUuid, planId: nullableUuid, defectId: nullableId,
  title: z.string().trim().min(1).max(160), category: z.enum(workCategories).default("REPAIR"),
  priority: z.enum(priorities).default("ROUTINE"), description: z.string().trim().max(5000).optional(),
  scheduledFor: z.coerce.date().optional(), dueAt: z.coerce.date().optional(), assignedTo: z.string().trim().max(160).optional(),
  supplier: z.string().trim().max(160).optional(),
});
const workOrderUpdate = z.object({
  status: z.enum(workStatuses).optional(), priority: z.enum(priorities).optional(), scheduledFor: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(), assignedTo: z.string().trim().max(160).nullable().optional(),
  supplier: z.string().trim().max(160).nullable().optional(), completionNotes: z.string().trim().max(5000).nullable().optional(),
  costPence: z.number().int().min(0).nullable().optional(), odometer: z.number().int().min(0).nullable().optional(),
});

function minutesBetween(start: Date, end: Date) { return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000)); }
function summarize(rows: ActivityRow[]) {
  const now = new Date();
  const totals: Record<Activity, number> = { DRIVING: 0, OTHER_WORK: 0, POA: 0, BREAK_REST: 0 };
  for (const row of rows) totals[row.activity] += minutesBetween(new Date(row.startedAt), row.endedAt ? new Date(row.endedAt) : now);
  return totals;
}
function currentOpen(rows: ActivityRow[]) { for (let i = rows.length - 1; i >= 0; i -= 1) if (!rows[i].endedAt) return rows[i]; return null; }
async function currentDriver(companyId: string, email: string) {
  return prisma.driver.findFirst({ where: { companyId, email }, select: { id: true, firstName: true, lastName: true } });
}
async function scopedVehicle(companyId: string, vehicleId: string) {
  return prisma.vehicle.findFirst({ where: { companyId, id: vehicleId }, select: { id: true, registration: true } });
}
async function scopedDepot(companyId: string, depotId?: string) {
  if (!depotId) return null;
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id::text, name FROM "Depot" WHERE id = ${depotId}::uuid AND "companyId" = ${companyId} AND "isActive" = true LIMIT 1
  `;
  return rows[0] ?? undefined;
}

const operationsReaders = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const operationsManagers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const hoursReaders = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

operationsRouter.get("/vehicles/available", asyncHandler(async (req, res) => {
  const vehicles = await prisma.$queryRaw<Array<{ id: string; registration: string; type: string; depotId: string | null; depotName: string | null }>>`
    SELECT v.id, v.registration, v.type::text, v."depotId"::text AS "depotId", d.name AS "depotName"
    FROM "Vehicle" v LEFT JOIN "Depot" d ON d.id = v."depotId" AND d."companyId" = v."companyId"
    WHERE v."companyId" = ${req.user!.companyId} AND v.status = 'ACTIVE'
    ORDER BY v.registration ASC LIMIT 250
  `;
  res.json(vehicles);
}));

operationsRouter.get("/defects", operationsReaders, asyncHandler(async (req, res) => {
  const defects = await prisma.defect.findMany({ where: { companyId: req.user!.companyId }, include: { vehicle: { select: { id: true, registration: true } }, reportedBy: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(defects);
}));

operationsRouter.post("/defects", asyncHandler(async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const severity = typeof req.body?.severity === "string" ? req.body.severity.trim().toUpperCase() : "MEDIUM";
  const vehicleId = typeof req.body?.vehicleId === "string" ? req.body.vehicleId : "";
  if (!title) return res.status(400).json({ error: "Defect title is required" });
  if (vehicleId && !(await scopedVehicle(req.user!.companyId, vehicleId))) return res.status(400).json({ error: "Vehicle is not in the active workspace" });
  const driver = await currentDriver(req.user!.companyId, req.user!.email);
  const defect = await prisma.defect.create({ data: { companyId: req.user!.companyId, vehicleId: vehicleId || null, reportedById: driver?.id ?? null, title, description: description || null, severity, status: "OPEN" } });
  res.status(201).json(defect);
}));

operationsRouter.patch("/defects/:id", operationsManagers, asyncHandler(async (req, res) => {
  const existing = await prisma.defect.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
  if (!existing) return res.status(404).json({ error: "Defect not found" });
  const allowed = ["OPEN", "IN_PROGRESS", "RESOLVED"];
  const status = allowed.includes(req.body?.status) ? req.body.status : existing.status;
  const resolutionNotes = typeof req.body?.resolutionNotes === "string" ? req.body.resolutionNotes.trim() : existing.resolutionNotes;
  const defect = await prisma.defect.update({ where: { id: existing.id }, data: { status, resolutionNotes: resolutionNotes || null, resolvedAt: status === "RESOLVED" ? new Date() : null } });
  res.json(defect);
}));

operationsRouter.get("/maintenance", operationsReaders, asyncHandler(async (req, res) => {
  const [plans, workOrders] = await Promise.all([
    prisma.$queryRaw<MaintenancePlanRow[]>`
      SELECT p.id::text, p."vehicleId", p."depotId"::text AS "depotId", p.title, p.category,
        p."intervalWeeks", p."nextDueAt", p."lastCompletedAt", p."odometerInterval", p."nextDueMileage",
        p.notes, p."isActive", p."createdAt", p."updatedAt", v.registration, d.name AS "depotName"
      FROM "MaintenancePlan" p
      JOIN "Vehicle" v ON v.id = p."vehicleId" AND v."companyId" = p."companyId"
      LEFT JOIN "Depot" d ON d.id = p."depotId" AND d."companyId" = p."companyId"
      WHERE p."companyId" = ${req.user!.companyId}
      ORDER BY p."isActive" DESC, p."nextDueAt" ASC LIMIT 300
    `,
    prisma.$queryRaw<WorkOrderRow[]>`
      SELECT w.id::text, w."vehicleId", w."depotId"::text AS "depotId", w."planId"::text AS "planId", w."defectId",
        w.title, w.category, w.status, w.priority, w.description, w."scheduledFor", w."dueAt", w."assignedTo",
        w.supplier, w."completionNotes", w."costPence", w.odometer, w."completedAt", w."createdAt", w."updatedAt",
        v.registration, d.name AS "depotName"
      FROM "MaintenanceWorkOrder" w
      JOIN "Vehicle" v ON v.id = w."vehicleId" AND v."companyId" = w."companyId"
      LEFT JOIN "Depot" d ON d.id = w."depotId" AND d."companyId" = w."companyId"
      WHERE w."companyId" = ${req.user!.companyId}
      ORDER BY CASE w.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'WAITING_PARTS' THEN 1 WHEN 'BOOKED' THEN 2 WHEN 'PLANNED' THEN 3 ELSE 4 END,
        COALESCE(w."dueAt", w."scheduledFor", w."createdAt") ASC LIMIT 400
    `,
  ]);
  const now = Date.now();
  const horizon = now + 28 * 86400000;
  res.json({
    plans, workOrders,
    summary: {
      overdue: plans.filter(p => p.isActive && new Date(p.nextDueAt).getTime() < now).length,
      dueSoon: plans.filter(p => p.isActive && new Date(p.nextDueAt).getTime() >= now && new Date(p.nextDueAt).getTime() <= horizon).length,
      openWork: workOrders.filter(w => !["COMPLETED", "CANCELLED"].includes(w.status)).length,
      vehicleOffRoad: workOrders.filter(w => w.priority === "VEHICLE_OFF_ROAD" && !["COMPLETED", "CANCELLED"].includes(w.status)).length,
    },
  });
}));

operationsRouter.post("/maintenance/plans", operationsManagers, asyncHandler(async (req, res) => {
  const input = planInput.parse(req.body);
  const companyId = req.user!.companyId;
  const [vehicle, depot] = await Promise.all([scopedVehicle(companyId, input.vehicleId), scopedDepot(companyId, input.depotId || undefined)]);
  if (!vehicle) return res.status(400).json({ error: "Vehicle is not in the active workspace" });
  if (input.depotId && !depot) return res.status(400).json({ error: "Depot is not active in the selected company" });
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "MaintenancePlan" (id, "companyId", "vehicleId", "depotId", title, category, "intervalWeeks", "nextDueAt", "odometerInterval", "nextDueMileage", notes, "createdById", "createdAt", "updatedAt")
    VALUES (${id}::uuid, ${companyId}, ${input.vehicleId}, ${input.depotId || null}::uuid, ${input.title}, ${input.category}, ${input.intervalWeeks}, ${input.nextDueAt}, ${input.odometerInterval ?? null}, ${input.nextDueMileage ?? null}, ${input.notes || null}, ${req.user!.id}, NOW(), NOW())
  `;
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "MAINTENANCE_PLAN", entityId: id, summary: `Created ${input.category} plan for ${vehicle.registration}` });
  res.status(201).json({ id });
}));

operationsRouter.patch("/maintenance/plans/:id", operationsManagers, asyncHandler(async (req, res) => {
  const input = planUpdate.parse(req.body);
  const companyId = req.user!.companyId;
  const rows = await prisma.$queryRaw<MaintenancePlanRow[]>`
    SELECT p.*, p.id::text, p."depotId"::text AS "depotId", v.registration, d.name AS "depotName"
    FROM "MaintenancePlan" p JOIN "Vehicle" v ON v.id=p."vehicleId" AND v."companyId"=p."companyId"
    LEFT JOIN "Depot" d ON d.id=p."depotId" WHERE p.id=${req.params.id}::uuid AND p."companyId"=${companyId} LIMIT 1
  `;
  const current = rows[0];
  if (!current) return res.status(404).json({ error: "Maintenance plan not found" });
  const vehicleId = input.vehicleId ?? current.vehicleId;
  const depotId = input.depotId === undefined ? current.depotId : input.depotId || null;
  const [vehicle, depot] = await Promise.all([scopedVehicle(companyId, vehicleId), scopedDepot(companyId, depotId || undefined)]);
  if (!vehicle || (depotId && !depot)) return res.status(400).json({ error: "Vehicle or depot is not in the active workspace" });
  await prisma.$executeRaw`
    UPDATE "MaintenancePlan" SET "vehicleId"=${vehicleId}, "depotId"=${depotId}::uuid,
      title=${input.title ?? current.title}, category=${input.category ?? current.category},
      "intervalWeeks"=${input.intervalWeeks ?? current.intervalWeeks}, "nextDueAt"=${input.nextDueAt ?? current.nextDueAt},
      "odometerInterval"=${input.odometerInterval ?? current.odometerInterval}, "nextDueMileage"=${input.nextDueMileage ?? current.nextDueMileage},
      notes=${input.notes ?? current.notes}, "isActive"=${input.isActive ?? current.isActive}, "updatedAt"=NOW()
    WHERE id=${req.params.id}::uuid AND "companyId"=${companyId}
  `;
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "MAINTENANCE_PLAN", entityId: req.params.id, summary: `Updated maintenance plan for ${vehicle.registration}` });
  res.json({ ok: true });
}));

operationsRouter.post("/maintenance/work-orders", operationsManagers, asyncHandler(async (req, res) => {
  const input = workOrderInput.parse(req.body);
  const companyId = req.user!.companyId;
  const [vehicle, depot, plan, defect] = await Promise.all([
    scopedVehicle(companyId, input.vehicleId), scopedDepot(companyId, input.depotId || undefined),
    input.planId ? prisma.$queryRaw<{ id: string }[]>`SELECT id::text FROM "MaintenancePlan" WHERE id=${input.planId}::uuid AND "companyId"=${companyId} LIMIT 1` : Promise.resolve([]),
    input.defectId ? prisma.defect.findFirst({ where: { id: input.defectId, companyId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!vehicle) return res.status(400).json({ error: "Vehicle is not in the active workspace" });
  if (input.depotId && !depot) return res.status(400).json({ error: "Depot is not active in the selected company" });
  if (input.planId && !plan.length) return res.status(400).json({ error: "Maintenance plan is not in the active workspace" });
  if (input.defectId && !defect) return res.status(400).json({ error: "Defect is not in the active workspace" });
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "MaintenanceWorkOrder" (id, "companyId", "vehicleId", "depotId", "planId", "defectId", title, category, priority, description, "scheduledFor", "dueAt", "assignedTo", supplier, "createdById", "createdAt", "updatedAt")
    VALUES (${id}::uuid, ${companyId}, ${input.vehicleId}, ${input.depotId || null}::uuid, ${input.planId || null}::uuid, ${input.defectId || null}, ${input.title}, ${input.category}, ${input.priority}, ${input.description || null}, ${input.scheduledFor ?? null}, ${input.dueAt ?? null}, ${input.assignedTo || null}, ${input.supplier || null}, ${req.user!.id}, NOW(), NOW())
  `;
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "WORK_ORDER", entityId: id, summary: `Created workshop order for ${vehicle.registration}: ${input.title}` });
  res.status(201).json({ id });
}));

operationsRouter.patch("/maintenance/work-orders/:id", operationsManagers, asyncHandler(async (req, res) => {
  const input = workOrderUpdate.parse(req.body);
  const companyId = req.user!.companyId;
  const rows = await prisma.$queryRaw<WorkOrderRow[]>`
    SELECT w.*, w.id::text, w."depotId"::text AS "depotId", w."planId"::text AS "planId", v.registration, d.name AS "depotName"
    FROM "MaintenanceWorkOrder" w JOIN "Vehicle" v ON v.id=w."vehicleId" AND v."companyId"=w."companyId"
    LEFT JOIN "Depot" d ON d.id=w."depotId" WHERE w.id=${req.params.id}::uuid AND w."companyId"=${companyId} LIMIT 1
  `;
  const current = rows[0];
  if (!current) return res.status(404).json({ error: "Work order not found" });
  const status = input.status ?? current.status;
  const completedAt = status === "COMPLETED" ? current.completedAt ?? new Date() : null;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`
      UPDATE "MaintenanceWorkOrder" SET status=${status}, priority=${input.priority ?? current.priority},
        "scheduledFor"=${input.scheduledFor === undefined ? current.scheduledFor : input.scheduledFor},
        "dueAt"=${input.dueAt === undefined ? current.dueAt : input.dueAt},
        "assignedTo"=${input.assignedTo === undefined ? current.assignedTo : input.assignedTo},
        supplier=${input.supplier === undefined ? current.supplier : input.supplier},
        "completionNotes"=${input.completionNotes === undefined ? current.completionNotes : input.completionNotes},
        "costPence"=${input.costPence === undefined ? current.costPence : input.costPence},
        odometer=${input.odometer === undefined ? current.odometer : input.odometer},
        "completedAt"=${completedAt}, "updatedAt"=NOW()
      WHERE id=${req.params.id}::uuid AND "companyId"=${companyId}
    `;
    if (status === "COMPLETED" && current.planId) {
      await tx.$executeRaw`
        UPDATE "MaintenancePlan" SET "lastCompletedAt"=${completedAt},
          "nextDueAt"=${completedAt} + make_interval(weeks => "intervalWeeks"),
          "nextDueMileage"=CASE WHEN "odometerInterval" IS NOT NULL AND ${input.odometer ?? current.odometer}::integer IS NOT NULL THEN ${input.odometer ?? current.odometer}::integer + "odometerInterval" ELSE "nextDueMileage" END,
          "updatedAt"=NOW()
        WHERE id=${current.planId}::uuid AND "companyId"=${companyId}
      `;
    }
    if (status === "COMPLETED" && current.defectId) {
      await tx.defect.updateMany({ where: { id: current.defectId, companyId }, data: { status: "RESOLVED", resolvedAt: completedAt, resolutionNotes: input.completionNotes || "Completed through workshop work order" } });
    }
  });
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "WORK_ORDER", entityId: req.params.id, summary: `${current.registration} work order moved to ${status}` });
  res.json({ ok: true, status, completedAt });
}));

operationsRouter.get("/driver-hours/me", asyncHandler(async (req, res) => {
  const driver = await currentDriver(req.user!.companyId, req.user!.email);
  if (!driver) return res.status(404).json({ error: "No driver profile is linked to this account" });
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const rows = await prisma.$queryRaw<ActivityRow[]>`SELECT id, "driverId", activity, "startedAt", "endedAt" FROM "DriverActivity" WHERE "companyId" = ${req.user!.companyId} AND "driverId" = ${driver.id} AND "startedAt" >= ${dayStart} ORDER BY "startedAt" ASC`;
  res.json({ driver, current: currentOpen(rows), totals: summarize(rows), activities: rows });
}));

operationsRouter.post("/driver-hours/me", asyncHandler(async (req, res) => {
  const activity = req.body?.activity as Activity;
  if (!activities.includes(activity)) return res.status(400).json({ error: "Invalid activity" });
  const driver = await currentDriver(req.user!.companyId, req.user!.email);
  if (!driver) return res.status(404).json({ error: "No driver profile is linked to this account" });
  const now = new Date();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "DriverActivity" SET "endedAt" = ${now}, "updatedAt" = ${now} WHERE "companyId" = ${req.user!.companyId} AND "driverId" = ${driver.id} AND "endedAt" IS NULL`;
    await tx.$executeRaw`INSERT INTO "DriverActivity" (id, "companyId", "driverId", activity, "startedAt", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${req.user!.companyId}, ${driver.id}, ${activity}, ${now}, ${now}, ${now})`;
  });
  res.status(201).json({ ok: true, activity, startedAt: now });
}));

operationsRouter.get("/driver-hours", hoursReaders, asyncHandler(async (req, res) => {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const drivers = await prisma.driver.findMany({ where: { companyId: req.user!.companyId, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const rows = await prisma.$queryRaw<ActivityRow[]>`SELECT id, "driverId", activity, "startedAt", "endedAt" FROM "DriverActivity" WHERE "companyId" = ${req.user!.companyId} AND "startedAt" >= ${dayStart} ORDER BY "startedAt" ASC`;
  res.json(drivers.map(driver => { const own = rows.filter(r => r.driverId === driver.id); return { ...driver, current: currentOpen(own), totals: summarize(own) }; }));
}));

operationsRouter.get("/guardian", operationsReaders, asyncHandler(async (req, res) => {
  const now = new Date(); const soon = new Date(now.getTime() + 30 * 86400000);
  const [vehicles, drivers, items, openDefects, maintenance] = await Promise.all([
    prisma.vehicle.findMany({ where: { companyId: req.user!.companyId, status: "ACTIVE" }, select: { registration: true, motDue: true, taxDue: true, insuranceDue: true, tachoCalibrationDue: true } }),
    prisma.driver.findMany({ where: { companyId: req.user!.companyId, isActive: true }, select: { firstName: true, lastName: true, licenceExpiry: true, cpcExpiry: true, tachoCardExpiry: true, medicalDue: true } }),
    prisma.complianceItem.findMany({ where: { companyId: req.user!.companyId, status: { not: "RESOLVED" }, dueDate: { lte: soon } }, orderBy: { dueDate: "asc" }, take: 100 }),
    prisma.defect.count({ where: { companyId: req.user!.companyId, status: { not: "RESOLVED" } } }),
    prisma.$queryRaw<Array<{ title: string; registration: string; nextDueAt: Date }>>`SELECT p.title, v.registration, p."nextDueAt" FROM "MaintenancePlan" p JOIN "Vehicle" v ON v.id=p."vehicleId" AND v."companyId"=p."companyId" WHERE p."companyId"=${req.user!.companyId} AND p."isActive"=true AND p."nextDueAt"<=${soon}`,
  ]);
  const alerts: Array<{ severity: "OVERDUE" | "DUE_SOON"; kind: string; label: string; dueDate: string }> = [];
  const add = (kind: string, label: string, date: Date | null) => { if (date && date <= soon) alerts.push({ severity: date < now ? "OVERDUE" : "DUE_SOON", kind, label, dueDate: date.toISOString() }); };
  for (const v of vehicles) { add("MOT", `${v.registration} MOT / test`, v.motDue); add("INSURANCE", `${v.registration} insurance`, v.insuranceDue); add("TAX", `${v.registration} tax`, v.taxDue); add("TACHO_CAL", `${v.registration} tacho calibration`, v.tachoCalibrationDue); }
  for (const d of drivers) { const name = `${d.firstName} ${d.lastName}`; add("LICENCE", `${name} licence`, d.licenceExpiry); add("CPC", `${name} CPC`, d.cpcExpiry); add("TACHO_CARD", `${name} tacho card`, d.tachoCardExpiry); add("MEDICAL", `${name} medical`, d.medicalDue); }
  for (const item of items) add("COMPLIANCE", item.title, item.dueDate);
  for (const plan of maintenance) add("MAINTENANCE", `${plan.registration} ${plan.title}`, plan.nextDueAt);
  alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  res.json({ alerts, openDefects, summary: { overdue: alerts.filter(a => a.severity === "OVERDUE").length, dueSoon: alerts.filter(a => a.severity === "DUE_SOON").length } });
}));
