import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireRoles } from "../../middleware/auth.js";

type TemplateItem = { id: string; section: string; label: string; target: "VEHICLE" | "TRAILER"; safetyCritical: boolean };
type VehicleRecord = { id: string; registration: string; type: string; mileage: number | null; status: string };

const driverOnly = requireRoles("DRIVER");

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
    ["cab-view", "Cab", "Mirrors, glass and driver view", true],
    ["wipers", "Cab", "Wipers and washers", false],
    ["dashboard", "Cab", "Warning lights and gauges", true],
    ["steering", "Cab", "Steering", true],
    ["brakes", "Cab", "Service and parking brakes", true],
    ["seatbelt", "Cab", "Seat belts and doors", true],
    ["lights", "Exterior", "Lights and indicators", true],
    ["leaks", "Exterior", "Fuel, oil and coolant leaks", true],
    ["body", "Exterior", "Bodywork, doors and load area", true],
    ["tyres", "Exterior", "Tyres, wheels and wheel nuts", true],
    ["load", "Load", "Load security and loose equipment", true],
    ["markings", "Exterior", "Number plates and reflectors", false],
    ["ancillary", "Equipment", "Tail lift and fitted equipment", true],
  ],
  CAR: [
    ["view", "Cab", "Glass, mirrors, cameras, wipers and washers", true],
    ["dashboard", "Cab", "Warning lights and gauges", true],
    ["steering-brakes", "Controls", "Steering and brakes", true],
    ["seatbelt", "Cab", "Seat belts and doors", true],
    ["lights", "Exterior", "Lights and indicators", true],
    ["leaks", "Exterior", "Fluid leaks", true],
    ["body", "Exterior", "Bodywork and doors", true],
    ["tyres", "Exterior", "Tyres and wheels", true],
    ["load", "Load", "Load and equipment security", true],
    ["markings", "Exterior", "Number plates", false],
  ],
  OTHER: [
    ["controls", "Controls", "Controls, warning lights, steering and brakes", true],
    ["view", "Cab", "Driver view, mirrors and glass", true],
    ["lights", "Exterior", "Lights, indicators and reflectors", true],
    ["leaks", "Exterior", "Fuel, oil, coolant and air leaks", true],
    ["body", "Exterior", "Body and attachments", true],
    ["tyres", "Exterior", "Tyres, wheels or tracks", true],
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
  const result: TemplateItem[] = base.map(([id, section, label, safetyCritical]) => ({
    id: `vehicle-${id}`, section, label, target: type === "TRAILER" ? "TRAILER" : "VEHICLE", safetyCritical,
  }));
  if (includeTrailer && type !== "TRAILER") {
    result.push(...trailerItems.map(([id, section, label, safetyCritical]) => ({
      id: `trailer-${id}`, section, label, target: "TRAILER" as const, safetyCritical,
    })));
  }
  return result;
}

const photoData = z.string().max(950_000).refine(value => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value), "Photo evidence must be a supported image");
const gpsInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000),
  capturedAt: z.coerce.date(),
}).optional();

const fieldCheckInput = z.object({
  vehicleId: z.string().trim().min(1),
  trailerVehicleId: z.string().trim().min(1).optional(),
  odometer: z.number().int().min(0).max(10_000_000).optional(),
  location: z.string().trim().max(300).optional(),
  gpsStatus: z.enum(["CAPTURED", "UNAVAILABLE", "DENIED"]),
  gps: gpsInput,
  notes: z.string().trim().max(3000).optional(),
  startedAt: z.coerce.date(),
  declarationAccepted: z.literal(true),
  items: z.array(z.object({
    id: z.string().min(1),
    status: z.enum(["PASS", "DEFECT", "NA"]),
    note: z.string().trim().max(1000).optional(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "SAFETY_CRITICAL"]).optional(),
    photoDataUrl: photoData.optional(),
    photoCapturedAt: z.coerce.date().optional(),
  })).min(1).max(80),
});

const fieldBreakdownInput = z.object({
  vehicleId: z.string().trim().min(1),
  severity: z.enum(["MINOR", "LIMITED", "UNSAFE", "IMMOBILE"]),
  location: z.string().trim().min(2).max(500),
  description: z.string().trim().min(3).max(5000),
  canMove: z.boolean(),
  occupantsSafe: z.boolean(),
  contactNumber: z.string().trim().max(80).optional(),
  gpsStatus: z.enum(["CAPTURED", "UNAVAILABLE", "DENIED"]),
  gps: gpsInput,
  photos: z.array(z.object({ dataUrl: photoData, capturedAt: z.coerce.date() })).max(6).default([]),
});

async function currentDriver(companyId: string, email: string) {
  return prisma.driver.findFirst({ where: { companyId, email, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
}
async function activeVehicle(companyId: string, id: string): Promise<VehicleRecord | null> {
  return prisma.vehicle.findFirst({ where: { companyId, id, status: "ACTIVE" }, select: { id: true, registration: true, type: true, mileage: true, status: true } }) as Promise<VehicleRecord | null>;
}
function mimeFromDataUrl(value: string) {
  return value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,/i)?.[1]?.toLowerCase() ?? "image/jpeg";
}

export const driverFieldRouter = Router();

driverFieldRouter.post("/field-checks", driverOnly, asyncHandler(async (req, res) => {
  const input = fieldCheckInput.parse(req.body);
  const companyId = req.user!.companyId;
  const [driver, vehicle, trailer] = await Promise.all([
    currentDriver(companyId, req.user!.email),
    activeVehicle(companyId, input.vehicleId),
    input.trailerVehicleId ? activeVehicle(companyId, input.trailerVehicleId) : Promise.resolve(null),
  ]);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  if (!vehicle) return res.status(400).json({ error: "Vehicle is not active in this company" });
  if (input.trailerVehicleId && (!trailer || trailer.type !== "TRAILER")) return res.status(400).json({ error: "Trailer is not active in this company" });

  const template = makeTemplate(vehicle.type, !!trailer);
  const expected = new Set(template.map(item => item.id));
  const submitted = new Map(input.items.map(item => [item.id, item]));
  if (input.items.length !== expected.size || submitted.size !== expected.size || [...expected].some(id => !submitted.has(id))) {
    return res.status(400).json({ error: "Complete every item in the current vehicle checklist" });
  }

  const defectItems = template.flatMap(item => {
    const answer = submitted.get(item.id)!;
    return answer.status === "DEFECT" ? [{ ...item, ...answer }] : [];
  });
  if (defectItems.some(item => !item.note?.trim())) return res.status(400).json({ error: "Add a short description for every failed item" });
  if (defectItems.some(item => !item.severity)) return res.status(400).json({ error: "Choose a safety outcome for every failed item" });
  if (defectItems.some(item => !item.photoDataUrl || !item.photoCapturedAt)) return res.status(400).json({ error: "A photo is required for every failed item" });

  const completedAt = new Date();
  if (input.startedAt.getTime() > completedAt.getTime() + 60_000 || input.startedAt.getTime() < completedAt.getTime() - 86_400_000) {
    return res.status(400).json({ error: "The check start time is invalid; start a fresh check" });
  }
  const durationSeconds = Math.max(0, Math.min(86_400, Math.round((completedAt.getTime() - input.startedAt.getTime()) / 1000)));
  const unsafe = defectItems.some(item => item.severity === "SAFETY_CRITICAL");
  const status = unsafe ? "UNSAFE" : defectItems.length ? "DEFECTS_REPORTED" : "ROADWORTHY";
  const checkId = randomUUID();
  const defectIds: string[] = [];
  const storedItems = input.items.map(({ photoDataUrl: _photo, ...item }) => ({ ...item, photoEvidence: item.status === "DEFECT" }));

  await prisma.$transaction(async tx => {
    for (const item of defectItems) {
      const targetVehicleId = item.target === "TRAILER" && trailer ? trailer.id : vehicle.id;
      const targetRegistration = item.target === "TRAILER" && trailer ? trailer.registration : vehicle.registration;
      const defect = await tx.defect.create({
        data: {
          companyId,
          vehicleId: targetVehicleId,
          reportedById: driver.id,
          title: item.label,
          description: `Daily walkaround ${targetRegistration}: ${item.note}`,
          severity: item.severity ?? (item.safetyCritical ? "HIGH" : "MEDIUM"),
          status: "OPEN",
        },
      });
      defectIds.push(defect.id);
      await tx.$executeRaw`INSERT INTO "DriverEvidence" (id,"companyId","driverId","entityType","entityId","itemId","mimeType",data,latitude,longitude,accuracy,"capturedAt","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${driver.id},'WALKAROUND',${checkId}::uuid,${item.id},${mimeFromDataUrl(item.photoDataUrl!)},${item.photoDataUrl!},${input.gps?.latitude ?? null},${input.gps?.longitude ?? null},${input.gps?.accuracy ?? null},${item.photoCapturedAt!},NOW())`;
    }
    if (unsafe) {
      const unsafeVehicleIds = [...new Set(defectItems.filter(item => item.severity === "SAFETY_CRITICAL").map(item => item.target === "TRAILER" && trailer ? trailer.id : vehicle.id))];
      await tx.vehicle.updateMany({ where: { companyId, id: { in: unsafeVehicleIds } }, data: { status: "OFF_ROAD" } });
    }
    const locationEvidence = input.gps
      ? `${input.location || "GPS captured"} [${input.gps.latitude.toFixed(6)}, ${input.gps.longitude.toFixed(6)} ±${Math.round(input.gps.accuracy)}m]`
      : input.location || `GPS ${input.gpsStatus.toLowerCase()}`;
    await tx.$executeRaw`INSERT INTO "DriverWalkaroundCheck" (id,"companyId","driverId","vehicleId","trailerVehicleId","vehicleType","checklistVersion",status,"nilDefect","roadworthyConfirmed",odometer,location,notes,items,"defectIds","signatureName","startedAt","completedAt","durationSeconds","createdAt") VALUES (${checkId}::uuid,${companyId},${driver.id},${vehicle.id},${trailer?.id ?? null},${vehicle.type},'DVSA-2026.2-FIELD',${status},${defectItems.length === 0},${!unsafe},${input.odometer ?? null},${locationEvidence},${input.notes || null},${JSON.stringify(storedItems)}::jsonb,${JSON.stringify(defectIds)}::jsonb,${`${driver.firstName} ${driver.lastName}`},${input.startedAt},${completedAt},${durationSeconds},NOW())`;
    if (input.odometer !== undefined) {
      await tx.vehicle.updateMany({ where: { companyId, id: vehicle.id, OR: [{ mileage: null }, { mileage: { lte: input.odometer } }] }, data: { mileage: input.odometer } });
    }
  });

  await writeAuditEvent({
    companyId,
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: "CREATE",
    entityType: "DRIVER_WALKAROUND",
    entityId: checkId,
    summary: `${vehicle.registration} field check completed: ${status}`,
    metadata: { driverId: driver.id, trailerVehicleId: trailer?.id ?? null, defectIds, nilDefect: defectItems.length === 0, gpsStatus: input.gpsStatus, photoEvidenceCount: defectItems.length },
  });

  res.status(201).json({ id: checkId, status, nilDefect: defectItems.length === 0, defectIds, vehicleOffRoad: unsafe, completedAt, gpsStatus: input.gpsStatus, photoEvidenceCount: defectItems.length });
}));

driverFieldRouter.post("/field-breakdowns", driverOnly, asyncHandler(async (req, res) => {
  const input = fieldBreakdownInput.parse(req.body);
  const companyId = req.user!.companyId;
  const [driver, vehicle] = await Promise.all([currentDriver(companyId, req.user!.email), activeVehicle(companyId, input.vehicleId)]);
  if (!driver) return res.status(404).json({ error: "No active driver profile is linked to this login" });
  if (!vehicle) return res.status(400).json({ error: "Vehicle is not active in this company" });

  const offRoad = ["UNSAFE", "IMMOBILE"].includes(input.severity);
  const breakdownId = randomUUID();
  const locationEvidence = input.gps
    ? `${input.location} [${input.gps.latitude.toFixed(6)}, ${input.gps.longitude.toFixed(6)} ±${Math.round(input.gps.accuracy)}m]`
    : input.location;

  const defect = await prisma.$transaction(async tx => {
    const created = await tx.defect.create({
      data: {
        companyId,
        vehicleId: vehicle.id,
        reportedById: driver.id,
        title: `Breakdown: ${input.description.slice(0, 120)}`,
        description: `${locationEvidence}\n${input.description}`,
        severity: offRoad ? "SAFETY_CRITICAL" : input.severity === "LIMITED" ? "HIGH" : "MEDIUM",
        status: "OPEN",
      },
    });
    await tx.$executeRaw`INSERT INTO "DriverBreakdown" (id,"companyId","driverId","vehicleId","reportedByUserId","defectId",severity,status,location,description,"canMove","occupantsSafe","contactNumber","reportedAt","updatedAt") VALUES (${breakdownId}::uuid,${companyId},${driver.id},${vehicle.id},${req.user!.id},${created.id},${input.severity},'REPORTED',${locationEvidence},${input.description},${input.canMove},${input.occupantsSafe},${input.contactNumber || null},NOW(),NOW())`;
    for (const photo of input.photos) {
      await tx.$executeRaw`INSERT INTO "DriverEvidence" (id,"companyId","driverId","entityType","entityId","itemId","mimeType",data,latitude,longitude,accuracy,"capturedAt","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${driver.id},'BREAKDOWN',${breakdownId}::uuid,NULL,${mimeFromDataUrl(photo.dataUrl)},${photo.dataUrl},${input.gps?.latitude ?? null},${input.gps?.longitude ?? null},${input.gps?.accuracy ?? null},${photo.capturedAt},NOW())`;
    }
    if (offRoad) await tx.vehicle.updateMany({ where: { companyId, id: vehicle.id }, data: { status: "OFF_ROAD" } });
    return created;
  });

  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DRIVER_BREAKDOWN", entityId: breakdownId, summary: `${vehicle.registration} field breakdown reported`, metadata: { defectId: defect.id, severity: input.severity, vehicleOffRoad: offRoad, gpsStatus: input.gpsStatus, photoEvidenceCount: input.photos.length } });
  res.status(201).json({ id: breakdownId, status: "REPORTED", defectId: defect.id, vehicleOffRoad: offRoad, gpsStatus: input.gpsStatus, photoEvidenceCount: input.photos.length });
}));
