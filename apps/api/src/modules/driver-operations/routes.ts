import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

type TemplateItem = { id: string; section: string; label: string; target: "VEHICLE" | "TRAILER"; safetyCritical: boolean };
type DriverRecord = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null };
type VehicleRecord = { id: string; registration: string; type: string; mileage: number | null; status: string };

const driverOnly = requireRoles("DRIVER");
const officeReaders = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const officeManagers = requireRoles("TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN");

const vehicleItems: Record<string, Array<[string, string, string, boolean]>> = {
  TRUCK: [
    ["cab-view", "Cab", "Mirrors, cameras, windscreen and driver view", true],
    ["wipers", "Cab", "Wipers and washers", false],
    ["dashboard", "Cab", "Warning lights, gauges, ABS and EBS indications", true],
    ["steering", "Cab", "Steering operation and excessive play", true],
    ["horn", "Cab", "Horn", false],
    ["brakes", "Cab", "Service brake, parking brake and air pressure build-up", true],
    ["height", "Cab", "Vehicle height indicator", true],
    ["seatbelt", "Cab", "Seat belt and cab security", true],
    ["lights", "Exterior", "Lights, indicators, markers and stop lamps", true],
    ["leaks", "Exterior", "Fuel, oil, coolant and air leaks", true],
    ["body", "Exterior", "Body, doors, wings, guards and landing equipment", true],
    ["battery", "Exterior", "Battery security and condition", false],
    ["adblue", "Exterior", "AdBlue level and warning state", false],
    ["exhaust", "Exterior", "Exhaust security and excessive smoke", true],
    ["tyres", "Exterior", "Tyres, wheels, wheel nuts and spray suppression", true],
    ["brake-lines", "Exterior", "Brake lines, hoses and connections", true],
    ["coupling", "Exterior", "Coupling security and fifth-wheel condition", true],
    ["load", "Load", "Load security, body restraints and loose equipment", true],
    ["markings", "Exterior", "Number plates, reflectors and conspicuity markings", false],
    ["ancillary", "Equipment", "Tail lift, crane and other fitted equipment", true],
  ],
  VAN: [
    ["cab-view", "Cab", "Mirrors, glass and driver view", true], ["wipers", "Cab", "Wipers and washers", false],
    ["dashboard", "Cab", "Warning lights and gauges", true], ["steering", "Cab", "Steering", true],
    ["brakes", "Cab", "Service and parking brakes", true], ["seatbelt", "Cab", "Seat belts and doors", true],
    ["lights", "Exterior", "Lights and indicators", true], ["leaks", "Exterior", "Fuel, oil and coolant leaks", true],
    ["body", "Exterior", "Bodywork, doors and load area", true], ["tyres", "Exterior", "Tyres, wheels and wheel nuts", true],
    ["load", "Load", "Load security and loose equipment", true], ["markings", "Exterior", "Number plates and reflectors", false],
    ["ancillary", "Equipment", "Tail lift and fitted equipment", true],
  ],
  CAR: [
    ["view", "Cab", "Glass, mirrors, cameras, wipers and washers", true], ["dashboard", "Cab", "Warning lights and gauges", true],
    ["steering-brakes", "Controls", "Steering and brakes", true], ["seatbelt", "Cab", "Seat belts and doors", true],
    ["lights", "Exterior", "Lights and indicators", true], ["leaks", "Exterior", "Fluid leaks", true],
    ["body", "Exterior", "Bodywork and doors", true], ["tyres", "Exterior", "Tyres and wheels", true],
    ["load", "Load", "Load and equipment security", true], ["markings", "Exterior", "Number plates", false],
  ],
  OTHER: [
    ["controls", "Controls", "Controls, warning lights, steering and brakes", true], ["view", "Cab", "Driver view, mirrors and glass", true],
    ["lights", "Exterior", "Lights, indicators and reflectors", true], ["leaks", "Exterior", "Fuel, oil, coolant and air leaks", true],
    ["body", "Exterior", "Body and attachments", true], ["tyres", "Exterior", "Tyres, wheels or tracks", true],
    ["load", "Load", "Load and equipment security", true],
  ],
  TRAILER: [],
};

const trailerItems: Array<[string, string, string, boolean]> = [
  ["coupling", "Trailer", "Coupling, kingpin, locking devices and drawbar", true],
  ["connections", "Trailer", "Air, brake and electrical connections", true],
  ["parking-brake", "Trailer", "Trailer parking brake", true],
  ["landing-legs", "Trailer", "Landing legs and handle security", true],
  ["body", "Trailer", "Body, doors, curtains, guards and chassis", true],
  ["lights", "Trailer", "Lights, reflectors and conspicuity markings", true],
  ["tyres", "Trailer", "Tyres, wheels, wheel nuts and spray suppression", true],
  ["load", "Trailer", "Load security and restraints", true],
  ["plate", "Trailer", "Registration plate and trailer identification", false],
];

function makeTemplate(vehicleType: string, includeTrailer: boolean) {
  const type = vehicleType in vehicleItems ? vehicleType : "OTHER";
  const base = type === "TRAILER" ? trailerItems : vehicleItems[type];
  const result: TemplateItem[] = base.map(([id, section, label, safetyCritical]) => ({ id: `vehicle-${id}`, section, label, target: type === "TRAILER" ? "TRAILER" : "VEHICLE", safetyCritical }));
  if (includeTrailer && type !== "TRAILER") result.push(...trailerItems.map(([id, section, label, safetyCritical]) => ({ id: `trailer-${id}`, section, label, target: "TRAILER" as const, safetyCritical })));
  return result;
}

const checkInput = z.object({
  vehicleId: z.string().trim().min(1), trailerVehicleId: z.string().trim().min(1).optional(),
  odometer: z.number().int().min(0).max(10_000_000).optional(), location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(3000).optional(), startedAt: z.coerce.date(), signatureName: z.string().trim().min(2).max(160),
  declarationAccepted: z.literal(true),
  items: z.array(z.object({ id: z.string().min(1), status: z.enum(["PASS", "DEFECT", "NA"]), note: z.string().trim().max(1000).optional(), severity: z.enum(["LOW", "MEDIUM", "HIGH", "SAFETY_CRITICAL"]).optional() })).min(1).max(80),
});
const breakdownInput = z.object({
  vehicleId: z.string().trim().min(1), severity: z.enum(["MINOR", "LIMITED", "UNSAFE", "IMMOBILE"]),
  location: z.string().trim().min(2).max(500), description: z.string().trim().min(3).max(5000),
  canMove: z.boolean(), occupantsSafe: z.boolean(), contactNumber: z.string().trim().max(80).optional(),
});
const absenceInput = z.object({
  type: z.enum(["HOLIDAY", "SICKNESS", "OTHER"]), startsOn: z.string().date(), endsOn: z.string().date(), reason: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => { if (value.endsOn < value.startsOn) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "End date cannot be before start date" }); });
const breakdownUpdate = z.object({ status: z.enum(["ACKNOWLEDGED", "RECOVERY_ARRANGED", "RESOLVED", "CANCELLED"]), resolutionNotes: z.string().trim().max(5000).optional() });
const absenceUpdate = z.object({ status: z.enum(["APPROVED", "DECLINED", "CLOSED", "CANCELLED"]), officeNotes: z.string().trim().max(3000).optional() });
const trainingInput = z.object({
  driverId: z.string().trim().min(1), title: z.string().trim().min(2).max(200), category: z.enum(["DRIVER_CPC", "LICENCE", "TACHOGRAPH", "SAFETY", "VEHICLE", "SITE", "OTHER"]),
  status: z.enum(["PLANNED", "BOOKED", "COMPLETED", "EXPIRED", "CANCELLED"]).default("PLANNED"), provider: z.string().trim().max(200).optional(),
  dueDate: z.string().date().optional(), bookedDate: z.string().date().optional(), completedDate: z.string().date().optional(), expiryDate: z.string().date().optional(), notes: z.string().trim().max(3000).optional(),
});
const trainingUpdate = trainingInput.omit({ driverId: true }).partial();

async function currentDriver(companyId: string, email: string): Promise<DriverRecord | null> {
  return prisma.driver.findFirst({ where: { companyId, email, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
}
async function activeVehicle(companyId: string, id: string): Promise<VehicleRecord | null> {
  return prisma.vehicle.findFirst({ where: { companyId, id, status: "ACTIVE" }, select: { id: true, registration: true, type: true, mileage: true, status: true } }) as Promise<VehicleRecord | null>;
}
async function requireCurrentDriver(companyId: string, email: string) {
  return currentDriver(companyId, email);
}

export const driverOperationsRouter = Router();
driverOperationsRouter.use(requireAuth);

driverOperationsRouter.get("/me", driverOnly, asyncHandler(async (req, res) => {
  const driver = await requireCurrentDriver(req.user!.companyId, req.user!.email);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  const companyId = req.user!.companyId;
  const [vehicles, jobs, checks, breakdowns, absences, training] = await Promise.all([
    prisma.vehicle.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, registration: true, type: true, mileage: true, status: true }, orderBy: { registration: "asc" } }),
    prisma.job.findMany({ where: { companyId, driverId: driver.id, status: { notIn: ["CANCELLED"] } }, select: { id: true, jobNumber: true, customerName: true, collectionAddress: true, collectionPostcode: true, deliveryAddress: true, deliveryPostcode: true, collectionDateTime: true, deliveryDateTime: true, status: true, instructions: true, vehicle: { select: { id: true, registration: true } } }, orderBy: { collectionDateTime: "asc" }, take: 50 }),
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT c.id::text,c.status,c."nilDefect",c."roadworthyConfirmed",c.odometer,c.location,c.items,c."completedAt",c."durationSeconds",v.registration,t.registration AS "trailerRegistration" FROM "DriverWalkaroundCheck" c JOIN "Vehicle" v ON v.id=c."vehicleId" LEFT JOIN "Vehicle" t ON t.id=c."trailerVehicleId" WHERE c."companyId"=${companyId} AND c."driverId"=${driver.id} ORDER BY c."completedAt" DESC LIMIT 30`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT b.id::text,b.severity,b.status,b.location,b.description,b."canMove",b."occupantsSafe",b."reportedAt",b."resolutionNotes",v.registration FROM "DriverBreakdown" b JOIN "Vehicle" v ON v.id=b."vehicleId" WHERE b."companyId"=${companyId} AND b."driverId"=${driver.id} ORDER BY b."reportedAt" DESC LIMIT 30`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT id::text,type,status,"startsOn","endsOn",reason,"officeNotes","createdAt" FROM "StaffAbsenceRequest" WHERE "companyId"=${companyId} AND "driverId"=${driver.id} ORDER BY "startsOn" DESC LIMIT 50`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT id::text,title,category,status,provider,"dueDate","bookedDate","completedDate","expiryDate",notes FROM "DriverTrainingRecord" WHERE "companyId"=${companyId} AND "driverId"=${driver.id} ORDER BY COALESCE("dueDate","bookedDate","expiryDate") ASC NULLS LAST LIMIT 100`,
  ]);
  res.json({ driver, vehicles, jobs: jobs.map(job => ({ ...job, reference: job.jobNumber, scheduledAt: job.collectionDateTime ?? job.deliveryDateTime })), checks, breakdowns, absences, training });
}));

driverOperationsRouter.get("/check-template", driverOnly, asyncHandler(async (req, res) => {
  const vehicleId = String(req.query.vehicleId ?? "");
  const trailerVehicleId = String(req.query.trailerVehicleId ?? "");
  const vehicle = await activeVehicle(req.user!.companyId, vehicleId);
  if (!vehicle) return res.status(400).json({ error: "Choose an active company vehicle" });
  const trailer = trailerVehicleId ? await activeVehicle(req.user!.companyId, trailerVehicleId) : null;
  if (trailerVehicleId && (!trailer || trailer.type !== "TRAILER")) return res.status(400).json({ error: "Choose an active trailer from this company" });
  res.json({ version: "DVSA-2026.1", vehicle, trailer, items: makeTemplate(vehicle.type, !!trailer) });
}));

driverOperationsRouter.post("/checks", driverOnly, asyncHandler(async (req, res) => {
  const input = checkInput.parse(req.body);
  const companyId = req.user!.companyId;
  const [driver, vehicle, trailer] = await Promise.all([
    requireCurrentDriver(companyId, req.user!.email), activeVehicle(companyId, input.vehicleId), input.trailerVehicleId ? activeVehicle(companyId, input.trailerVehicleId) : Promise.resolve(null),
  ]);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  if (!vehicle) return res.status(400).json({ error: "Vehicle is not active in this company" });
  if (input.trailerVehicleId && (!trailer || trailer.type !== "TRAILER")) return res.status(400).json({ error: "Trailer is not active in this company" });
  const template = makeTemplate(vehicle.type, !!trailer);
  const expected = new Set(template.map(item => item.id));
  const submitted = new Map(input.items.map(item => [item.id, item]));
  if (input.items.length !== expected.size || submitted.size !== expected.size || [...expected].some(id => !submitted.has(id))) return res.status(400).json({ error: "Complete every item in the current vehicle checklist" });
  const defectItems = template.flatMap(item => { const answer = submitted.get(item.id)!; return answer.status === "DEFECT" ? [{ ...item, ...answer }] : []; });
  if (defectItems.some(item => !item.note?.trim())) return res.status(400).json({ error: "Add details for every failed checklist item" });
  if (defectItems.some(item => !item.severity)) return res.status(400).json({ error: "Choose a severity for every failed checklist item" });
  const completedAt = new Date();
  if (input.startedAt.getTime() > completedAt.getTime() + 60_000 || input.startedAt.getTime() < completedAt.getTime() - 86_400_000) return res.status(400).json({ error: "The check start time is invalid; start a fresh check" });
  const durationSeconds = Math.max(0, Math.min(86_400, Math.round((completedAt.getTime() - input.startedAt.getTime()) / 1000)));
  const unsafe = defectItems.some(item => item.severity === "SAFETY_CRITICAL");
  const status = unsafe ? "UNSAFE" : defectItems.length ? "DEFECTS_REPORTED" : "ROADWORTHY";
  const checkId = randomUUID();
  const defectIds: string[] = [];
  await prisma.$transaction(async tx => {
    for (const item of defectItems) {
      const targetVehicleId = item.target === "TRAILER" && trailer ? trailer.id : vehicle.id;
      const targetRegistration = item.target === "TRAILER" && trailer ? trailer.registration : vehicle.registration;
      const defect = await tx.defect.create({ data: { companyId, vehicleId: targetVehicleId, reportedById: driver.id, title: `${item.label}`, description: `Daily walkaround ${targetRegistration}: ${item.note}`, severity: item.severity ?? (item.safetyCritical ? "HIGH" : "MEDIUM"), status: "OPEN" } });
      defectIds.push(defect.id);
    }
    if (unsafe) {
      const unsafeVehicleIds = [...new Set(defectItems.filter(item => item.severity === "SAFETY_CRITICAL").map(item => item.target === "TRAILER" && trailer ? trailer.id : vehicle.id))];
      await tx.vehicle.updateMany({ where: { companyId, id: { in: unsafeVehicleIds } }, data: { status: "OFF_ROAD" } });
    }
    await tx.$executeRaw`INSERT INTO "DriverWalkaroundCheck" (id,"companyId","driverId","vehicleId","trailerVehicleId","vehicleType","checklistVersion",status,"nilDefect","roadworthyConfirmed",odometer,location,notes,items,"defectIds","signatureName","startedAt","completedAt","durationSeconds","createdAt") VALUES (${checkId}::uuid,${companyId},${driver.id},${vehicle.id},${trailer?.id ?? null},${vehicle.type},'DVSA-2026.1',${status},${defectItems.length === 0},${!unsafe},${input.odometer ?? null},${input.location || null},${input.notes || null},${JSON.stringify(input.items)}::jsonb,${JSON.stringify(defectIds)}::jsonb,${input.signatureName},${input.startedAt},${completedAt},${durationSeconds},NOW())`;
    if (input.odometer !== undefined) await tx.vehicle.updateMany({ where: { companyId, id: vehicle.id, OR: [{ mileage: null }, { mileage: { lte: input.odometer } }] }, data: { mileage: input.odometer } });
  });
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DRIVER_WALKAROUND", entityId: checkId, summary: `${vehicle.registration} daily check completed: ${status}`, metadata: { driverId: driver.id, trailerVehicleId: trailer?.id ?? null, defectIds, nilDefect: defectItems.length === 0 } });
  res.status(201).json({ id: checkId, status, nilDefect: defectItems.length === 0, defectIds, vehicleOffRoad: unsafe, completedAt });
}));

driverOperationsRouter.post("/breakdowns", driverOnly, asyncHandler(async (req, res) => {
  const input = breakdownInput.parse(req.body);
  const companyId = req.user!.companyId;
  const [driver, vehicle] = await Promise.all([requireCurrentDriver(companyId, req.user!.email), activeVehicle(companyId, input.vehicleId)]);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  if (!vehicle) return res.status(400).json({ error: "Vehicle is not active in this company" });
  const offRoad = ["UNSAFE", "IMMOBILE"].includes(input.severity);
  const breakdownId = randomUUID();
  const defect = await prisma.$transaction(async tx => {
    const created = await tx.defect.create({ data: { companyId, vehicleId: vehicle.id, reportedById: driver.id, title: `Breakdown: ${input.description.slice(0, 120)}`, description: `${input.location}\n${input.description}`, severity: offRoad ? "SAFETY_CRITICAL" : input.severity === "LIMITED" ? "HIGH" : "MEDIUM", status: "OPEN" } });
    await tx.$executeRaw`INSERT INTO "DriverBreakdown" (id,"companyId","driverId","vehicleId","reportedByUserId","defectId",severity,status,location,description,"canMove","occupantsSafe","contactNumber","reportedAt","updatedAt") VALUES (${breakdownId}::uuid,${companyId},${driver.id},${vehicle.id},${req.user!.id},${created.id},${input.severity},'REPORTED',${input.location},${input.description},${input.canMove},${input.occupantsSafe},${input.contactNumber || null},NOW(),NOW())`;
    if (offRoad) await tx.vehicle.updateMany({ where: { companyId, id: vehicle.id }, data: { status: "OFF_ROAD" } });
    return created;
  });
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DRIVER_BREAKDOWN", entityId: breakdownId, summary: `${vehicle.registration} breakdown reported`, metadata: { defectId: defect.id, severity: input.severity, vehicleOffRoad: offRoad } });
  res.status(201).json({ id: breakdownId, status: "REPORTED", defectId: defect.id, vehicleOffRoad: offRoad });
}));

driverOperationsRouter.post("/absences", driverOnly, asyncHandler(async (req, res) => {
  const input = absenceInput.parse(req.body);
  const driver = await requireCurrentDriver(req.user!.companyId, req.user!.email);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  const id = randomUUID();
  const status = input.type === "HOLIDAY" ? "PENDING" : "REPORTED";
  await prisma.$executeRaw`INSERT INTO "StaffAbsenceRequest" (id,"companyId","driverId","userId",type,status,"startsOn","endsOn",reason,"createdAt","updatedAt") VALUES (${id}::uuid,${req.user!.companyId},${driver.id},${req.user!.id},${input.type},${status},${input.startsOn}::date,${input.endsOn}::date,${input.reason || null},NOW(),NOW())`;
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "STAFF_ABSENCE", entityId: id, summary: `${driver.firstName} ${driver.lastName}: ${input.type.toLowerCase()} ${status.toLowerCase()}` });
  res.status(201).json({ id, ...input, status });
}));

driverOperationsRouter.patch("/jobs/:id/status", driverOnly, asyncHandler(async (req, res) => {
  const status = z.enum(["IN_PROGRESS", "DELIVERED"]).parse(req.body?.status);
  const driver = await requireCurrentDriver(req.user!.companyId, req.user!.email);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  const job = await prisma.job.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId, driverId: driver.id } });
  if (!job) return res.status(404).json({ error: "Assigned job not found" });
  if (status === "IN_PROGRESS" && !["ASSIGNED", "PLANNED"].includes(job.status)) return res.status(409).json({ error: "This job cannot be started from its current status" });
  if (status === "DELIVERED" && job.status !== "IN_PROGRESS") return res.status(409).json({ error: "Start the job before marking it delivered" });
  const updated = await prisma.job.update({ where: { id: job.id }, data: { status } });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "JOB", entityId: job.id, summary: `Driver moved job ${job.jobNumber ?? job.id} to ${status}` });
  res.json({ id: updated.id, status: updated.status });
}));

driverOperationsRouter.get("/office", officeReaders, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const [drivers, checks, breakdowns, absences, training] = await Promise.all([
    prisma.driver.findMany({ where: { companyId, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT c.id::text,c.status,c."nilDefect",c."roadworthyConfirmed",c.odometer,c.location,c.items,c."defectIds",c."signatureName",c."completedAt",c."durationSeconds",v.registration,t.registration AS "trailerRegistration",d."firstName",d."lastName" FROM "DriverWalkaroundCheck" c JOIN "Vehicle" v ON v.id=c."vehicleId" LEFT JOIN "Vehicle" t ON t.id=c."trailerVehicleId" JOIN "Driver" d ON d.id=c."driverId" WHERE c."companyId"=${companyId} ORDER BY c."completedAt" DESC LIMIT 250`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT b.id::text,b.severity,b.status,b.location,b.description,b."canMove",b."occupantsSafe",b."contactNumber",b."reportedAt",b."acknowledgedAt",b."resolvedAt",b."resolutionNotes",v.registration,d."firstName",d."lastName" FROM "DriverBreakdown" b JOIN "Vehicle" v ON v.id=b."vehicleId" JOIN "Driver" d ON d.id=b."driverId" WHERE b."companyId"=${companyId} ORDER BY CASE b.status WHEN 'REPORTED' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 WHEN 'RECOVERY_ARRANGED' THEN 2 ELSE 3 END,b."reportedAt" DESC LIMIT 200`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT a.id::text,a.type,a.status,a."startsOn",a."endsOn",a.reason,a."officeNotes",a."createdAt",d."firstName",d."lastName" FROM "StaffAbsenceRequest" a JOIN "Driver" d ON d.id=a."driverId" WHERE a."companyId"=${companyId} ORDER BY CASE a.status WHEN 'PENDING' THEN 0 WHEN 'REPORTED' THEN 1 ELSE 2 END,a."startsOn" DESC LIMIT 250`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT t.id::text,t."driverId",t.title,t.category,t.status,t.provider,t."dueDate",t."bookedDate",t."completedDate",t."expiryDate",t.notes,d."firstName",d."lastName" FROM "DriverTrainingRecord" t JOIN "Driver" d ON d.id=t."driverId" WHERE t."companyId"=${companyId} ORDER BY COALESCE(t."dueDate",t."bookedDate",t."expiryDate") ASC NULLS LAST LIMIT 300`,
  ]);
  res.json({ drivers, checks, breakdowns, absences, training, canManage: ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(req.user!.role) });
}));

driverOperationsRouter.patch("/breakdowns/:id", officeReaders, asyncHandler(async (req, res) => {
  const input = breakdownUpdate.parse(req.body);
  const rows = await prisma.$queryRaw<Array<{ id: string; defectId: string | null }>>`UPDATE "DriverBreakdown" SET status=${input.status},"resolutionNotes"=${input.resolutionNotes || null},"acknowledgedAt"=CASE WHEN ${input.status} IN ('ACKNOWLEDGED','RECOVERY_ARRANGED') THEN COALESCE("acknowledgedAt",NOW()) ELSE "acknowledgedAt" END,"resolvedAt"=CASE WHEN ${input.status}='RESOLVED' THEN NOW() ELSE "resolvedAt" END,"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId} RETURNING id::text,"defectId"`;
  if (!rows[0]) return res.status(404).json({ error: "Breakdown not found" });
  if (input.status === "RESOLVED" && rows[0].defectId) await prisma.defect.updateMany({ where: { id: rows[0].defectId, companyId: req.user!.companyId }, data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNotes: input.resolutionNotes || "Breakdown resolved through Driver Operations" } });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "DRIVER_BREAKDOWN", entityId: req.params.id, summary: `Breakdown moved to ${input.status}` });
  res.json({ ok: true, status: input.status });
}));

driverOperationsRouter.patch("/absences/:id", officeManagers, asyncHandler(async (req, res) => {
  const input = absenceUpdate.parse(req.body);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`UPDATE "StaffAbsenceRequest" SET status=${input.status},"officeNotes"=${input.officeNotes || null},"reviewedById"=${req.user!.id},"reviewedAt"=NOW(),"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId} RETURNING id::text`;
  if (!rows[0]) return res.status(404).json({ error: "Absence record not found" });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "STAFF_ABSENCE", entityId: req.params.id, summary: `Absence record moved to ${input.status}` });
  res.json({ ok: true, status: input.status });
}));

driverOperationsRouter.post("/training", officeManagers, asyncHandler(async (req, res) => {
  const input = trainingInput.parse(req.body);
  const driver = await prisma.driver.findFirst({ where: { id: input.driverId, companyId: req.user!.companyId, isActive: true }, select: { id: true, firstName: true, lastName: true } });
  if (!driver) return res.status(400).json({ error: "Choose an active driver from this company" });
  const id = randomUUID();
  await prisma.$executeRaw`INSERT INTO "DriverTrainingRecord" (id,"companyId","driverId",title,category,status,provider,"dueDate","bookedDate","completedDate","expiryDate",notes,"createdById","createdAt","updatedAt") VALUES (${id}::uuid,${req.user!.companyId},${driver.id},${input.title},${input.category},${input.status},${input.provider || null},${input.dueDate || null}::date,${input.bookedDate || null}::date,${input.completedDate || null}::date,${input.expiryDate || null}::date,${input.notes || null},${req.user!.id},NOW(),NOW())`;
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DRIVER_TRAINING", entityId: id, summary: `Training added for ${driver.firstName} ${driver.lastName}: ${input.title}` });
  res.status(201).json({ id, ...input });
}));

driverOperationsRouter.patch("/training/:id", officeManagers, asyncHandler(async (req, res) => {
  const input = trainingUpdate.parse(req.body);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`UPDATE "DriverTrainingRecord" SET title=COALESCE(${input.title ?? null},title),category=COALESCE(${input.category ?? null},category),status=COALESCE(${input.status ?? null},status),provider=COALESCE(${input.provider ?? null},provider),"dueDate"=COALESCE(${input.dueDate ?? null}::date,"dueDate"),"bookedDate"=COALESCE(${input.bookedDate ?? null}::date,"bookedDate"),"completedDate"=COALESCE(${input.completedDate ?? null}::date,"completedDate"),"expiryDate"=COALESCE(${input.expiryDate ?? null}::date,"expiryDate"),notes=COALESCE(${input.notes ?? null},notes),"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId} RETURNING id::text`;
  if (!rows[0]) return res.status(404).json({ error: "Training record not found" });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "DRIVER_TRAINING", entityId: req.params.id, summary: `Training record updated${input.status ? `: ${input.status}` : ""}` });
  res.json({ ok: true });
}));
