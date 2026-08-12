import { randomUUID } from "node:crypto";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const activities = ["DRIVING", "OTHER_WORK", "POA", "BREAK_REST"] as const;
type Activity = typeof activities[number];
type ActivityRow = { id: string; driverId: string; activity: Activity; startedAt: Date; endedAt: Date | null };

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

const operationsReaders = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const operationsManagers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const hoursReaders = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

operationsRouter.get("/vehicles/available", asyncHandler(async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: req.user!.companyId, status: "ACTIVE" },
    select: { id: true, registration: true, type: true },
    orderBy: { registration: "asc" },
    take: 250,
  });
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
  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId: req.user!.companyId }, select: { id: true } });
    if (!vehicle) return res.status(400).json({ error: "Vehicle is not in the active workspace" });
  }
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
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "DriverActivity" SET "endedAt" = ${now}, "updatedAt" = ${now} WHERE "companyId" = ${req.user!.companyId} AND "driverId" = ${driver.id} AND "endedAt" IS NULL`;
    await tx.$executeRaw`INSERT INTO "DriverActivity" (id, "companyId", "driverId", activity, "startedAt", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${req.user!.companyId}, ${driver.id}, ${activity}, ${now}, ${now}, ${now})`;
  });
  res.status(201).json({ ok: true, activity, startedAt: now });
}));

operationsRouter.get("/driver-hours", hoursReaders, asyncHandler(async (req, res) => {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const drivers = await prisma.driver.findMany({ where: { companyId: req.user!.companyId, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const rows = await prisma.$queryRaw<ActivityRow[]>`SELECT id, "driverId", activity, "startedAt", "endedAt" FROM "DriverActivity" WHERE "companyId" = ${req.user!.companyId} AND "startedAt" >= ${dayStart} ORDER BY "startedAt" ASC`;
  res.json(drivers.map((driver) => { const own = rows.filter((r) => r.driverId === driver.id); return { ...driver, current: currentOpen(own), totals: summarize(own) }; }));
}));

operationsRouter.get("/guardian", operationsReaders, asyncHandler(async (req, res) => {
  const now = new Date(); const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [vehicles, drivers, items, openDefects] = await Promise.all([
    prisma.vehicle.findMany({ where: { companyId: req.user!.companyId, status: "ACTIVE" }, select: { registration: true, motDue: true, taxDue: true, insuranceDue: true, tachoCalibrationDue: true } }),
    prisma.driver.findMany({ where: { companyId: req.user!.companyId, isActive: true }, select: { firstName: true, lastName: true, licenceExpiry: true, cpcExpiry: true, tachoCardExpiry: true, medicalDue: true } }),
    prisma.complianceItem.findMany({ where: { companyId: req.user!.companyId, status: { not: "RESOLVED" }, dueDate: { lte: soon } }, orderBy: { dueDate: "asc" }, take: 100 }),
    prisma.defect.count({ where: { companyId: req.user!.companyId, status: { not: "RESOLVED" } } }),
  ]);
  const alerts: Array<{ severity: "OVERDUE" | "DUE_SOON"; kind: string; label: string; dueDate: string }> = [];
  const add = (kind: string, label: string, date: Date | null) => { if (date && date <= soon) alerts.push({ severity: date < now ? "OVERDUE" : "DUE_SOON", kind, label, dueDate: date.toISOString() }); };
  for (const v of vehicles) { add("MOT", `${v.registration} MOT / test`, v.motDue); add("INSURANCE", `${v.registration} insurance`, v.insuranceDue); add("TAX", `${v.registration} tax`, v.taxDue); add("TACHO_CAL", `${v.registration} tacho calibration`, v.tachoCalibrationDue); }
  for (const d of drivers) { const name = `${d.firstName} ${d.lastName}`; add("LICENCE", `${name} licence`, d.licenceExpiry); add("CPC", `${name} CPC`, d.cpcExpiry); add("TACHO_CARD", `${name} tacho card`, d.tachoCardExpiry); add("MEDICAL", `${name} medical`, d.medicalDue); }
  for (const item of items) add("COMPLIANCE", item.title, item.dueDate);
  alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  res.json({ alerts, openDefects, summary: { overdue: alerts.filter((a) => a.severity === "OVERDUE").length, dueSoon: alerts.filter((a) => a.severity === "DUE_SOON").length } });
}));
