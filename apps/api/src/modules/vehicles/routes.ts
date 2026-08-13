import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const dateField = z.string().date().optional();
const createVehicle = z.object({
  registration: z.string().trim().min(1).max(16), fleetNumber: z.string().trim().max(32).optional(),
  vin: z.string().trim().max(64).optional(), type: z.enum(["TRUCK", "VAN", "TRAILER", "CAR", "OTHER"]),
  make: z.string().trim().max(64).optional(), model: z.string().trim().max(64).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(), firstRegisteredAt: dateField,
  acquiredAt: dateField, motDue: dateField, taxDue: dateField, insuranceDue: dateField,
  tachoCalibrationDue: dateField, mileage: z.number().int().min(0).optional(), fuelType: z.string().trim().max(32).optional(),
  colour: z.string().trim().max(32).optional(), depotId: z.union([z.string().uuid(), z.literal("")]).optional(),
  depot: z.string().trim().max(64).optional(), notes: z.string().trim().max(2000).optional(),
}).superRefine((input, ctx) => {
  if (input.firstRegisteredAt && input.acquiredAt && input.acquiredAt < input.firstRegisteredAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["acquiredAt"], message: "Acquired date cannot be before first registration date." });
  if (input.type === "TRUCK" && !input.tachoCalibrationDue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tachoCalibrationDue"], message: "Tacho calibration due date is required for an HGV / Truck record." });
});

const vehicleManagers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const vehicleWriters = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);

vehiclesRouter.get("/", vehicleManagers, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT v.*, v."depotId"::text AS "depotId", d.name AS "depotName"
    FROM "Vehicle" v
    LEFT JOIN "Depot" d ON d.id=v."depotId" AND d."companyId"=v."companyId"
    WHERE v."companyId"=${req.user!.companyId}
    ORDER BY v.registration ASC LIMIT 250
  `;
  res.json(rows);
}));

vehiclesRouter.post("/", vehicleWriters, asyncHandler(async (req, res) => {
  const input = createVehicle.parse(req.body);
  const companyId = req.user!.companyId;
  const { firstRegisteredAt, acquiredAt, motDue, taxDue, insuranceDue, tachoCalibrationDue, depotId: depotIdInput, ...rest } = input;
  const depotId = depotIdInput || null;
  let depotName = input.depot || null;
  if (depotId) {
    const depots = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM "Depot" WHERE id=${depotId}::uuid AND "companyId"=${companyId} AND "isActive"=true LIMIT 1
    `;
    if (!depots.length) return res.status(400).json({ error: "Depot is not active in the selected company" });
    depotName = depots[0].name;
  }
  const vehicle = await prisma.$transaction(async tx => {
    const created = await tx.vehicle.create({ data: {
      ...rest, depot: depotName, companyId,
      firstRegisteredAt: firstRegisteredAt ? new Date(firstRegisteredAt) : undefined,
      acquiredAt: acquiredAt ? new Date(acquiredAt) : undefined, motDue: motDue ? new Date(motDue) : undefined,
      taxDue: taxDue ? new Date(taxDue) : undefined, insuranceDue: insuranceDue ? new Date(insuranceDue) : undefined,
      tachoCalibrationDue: tachoCalibrationDue ? new Date(tachoCalibrationDue) : undefined,
    } });
    if (depotId) await tx.$executeRaw`UPDATE "Vehicle" SET "depotId"=${depotId}::uuid WHERE id=${created.id} AND "companyId"=${companyId}`;
    return created;
  });
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "VEHICLE", entityId: vehicle.id, summary: `Created vehicle ${vehicle.registration}`, metadata: { type: vehicle.type, depotId } });
  res.status(201).json({ ...vehicle, depotId, depotName });
}));
