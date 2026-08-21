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
  const includeArchived = req.query.includeArchived === "true";
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT v.*, v."depotId"::text AS "depotId", d.name AS "depotName"
    FROM "Vehicle" v
    LEFT JOIN "Depot" d ON d.id=v."depotId" AND d."companyId"=v."companyId"
    WHERE v."companyId"=${req.user!.companyId} AND (${includeArchived} OR v.status<>'ARCHIVED')
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

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
    const controls = await tx.$queryRaw<Array<{ vehicleLimit: number }>>`
      SELECT "vehicleLimit" FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
    `;
    const vehicleLimit = controls[0]?.vehicleLimit ?? 10;
    const vehicleUsage = await tx.vehicle.count({ where: { companyId, status: { not: "ARCHIVED" } } });
    if (vehicleUsage >= vehicleLimit) return { blocked: true as const, vehicleLimit, vehicleUsage };

    const created = await tx.vehicle.create({ data: {
      ...rest, depot: depotName, companyId,
      firstRegisteredAt: firstRegisteredAt ? new Date(firstRegisteredAt) : undefined,
      acquiredAt: acquiredAt ? new Date(acquiredAt) : undefined, motDue: motDue ? new Date(motDue) : undefined,
      taxDue: taxDue ? new Date(taxDue) : undefined, insuranceDue: insuranceDue ? new Date(insuranceDue) : undefined,
      tachoCalibrationDue: tachoCalibrationDue ? new Date(tachoCalibrationDue) : undefined,
    } });
    if (depotId) await tx.$executeRaw`UPDATE "Vehicle" SET "depotId"=${depotId}::uuid WHERE id=${created.id} AND "companyId"=${companyId}`;
    return { blocked: false as const, created, vehicleLimit, vehicleUsage: vehicleUsage + 1 };
  });

  if (result.blocked) return res.status(409).json({
    error: `Your current plan supports ${result.vehicleLimit} vehicles. Upgrade your FleetOS plan to add another vehicle.`,
    code: "VEHICLE_LIMIT_REACHED",
    vehicleLimit: result.vehicleLimit,
    vehicleUsage: result.vehicleUsage,
  });

  const vehicle = result.created;
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "VEHICLE", entityId: vehicle.id, summary: `Created vehicle ${vehicle.registration}`, metadata: { type: vehicle.type, depotId } });
  res.status(201).json({ ...vehicle, depotId, depotName, vehicleLimit: result.vehicleLimit, vehicleUsage: result.vehicleUsage });
}));

vehiclesRouter.delete("/:id", vehicleWriters, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const vehicle = await prisma.vehicle.findFirst({ where:{ id:req.params.id,companyId }, select:{ id:true,registration:true,status:true } });
  if (!vehicle) return res.status(404).json({ error:"Vehicle not found" });
  if (vehicle.status === "ARCHIVED") return res.status(204).end();

  const [activeJobs, activeWorkOrders] = await Promise.all([
    prisma.job.count({ where:{ companyId,vehicleId:vehicle.id,status:{ notIn:["COMPLETED","COMPLETED_ISSUES","CLOSED","CANCELLED"] } } }),
    prisma.$queryRaw<Array<{ count:bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "MaintenanceWorkOrder"
      WHERE "companyId"=${companyId} AND "vehicleId"=${vehicle.id} AND status NOT IN ('COMPLETED','CANCELLED')
    `,
  ]);
  const workOrderCount = Number(activeWorkOrders[0]?.count ?? 0n);
  if (activeJobs || workOrderCount) return res.status(409).json({
    error:`Finish or cancel this vehicle's ${activeJobs} active job${activeJobs === 1 ? "" : "s"} and ${workOrderCount} open workshop order${workOrderCount === 1 ? "" : "s"} before removing it.`,
    activeJobs,openWorkOrders:workOrderCount,
  });

  await prisma.vehicle.update({ where:{ id:vehicle.id }, data:{ status:"ARCHIVED" } });
  await writeAuditEvent({ companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"ARCHIVE",entityType:"VEHICLE",entityId:vehicle.id,summary:`Removed vehicle ${vehicle.registration}`,metadata:{previousStatus:vehicle.status} });
  res.status(204).end();
}));
