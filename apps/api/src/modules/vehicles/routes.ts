import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

const dateField = z.string().date().optional();
const createVehicle = z.object({
  registration: z.string().min(1).max(16),
  fleetNumber: z.string().max(32).optional(),
  vin: z.string().max(64).optional(),
  type: z.enum(["TRUCK", "VAN", "TRAILER", "CAR", "OTHER"]),
  make: z.string().max(64).optional(),
  model: z.string().max(64).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  firstRegisteredAt: dateField,
  acquiredAt: dateField,
  motDue: dateField,
  taxDue: dateField,
  insuranceDue: dateField,
  tachoCalibrationDue: dateField,
  mileage: z.number().int().min(0).optional(),
  fuelType: z.string().max(32).optional(),
  colour: z.string().max(32).optional(),
  depot: z.string().max(64).optional(),
  notes: z.string().max(2000).optional(),
}).superRefine((input, ctx) => {
  if (input.firstRegisteredAt && input.acquiredAt && input.acquiredAt < input.firstRegisteredAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["acquiredAt"], message: "Acquired date cannot be before first registration date." });
  }
  if (input.type === "TRUCK" && !input.tachoCalibrationDue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tachoCalibrationDue"], message: "Tacho calibration due date is required for an HGV / Truck record." });
  }
});

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);
vehiclesRouter.get("/", asyncHandler(async (req, res) => res.json(await prisma.vehicle.findMany({ where: { companyId: req.user!.companyId }, orderBy: { registration: "asc" }, take: 100 }))));
vehiclesRouter.post("/", asyncHandler(async (req, res) => {
  const input = createVehicle.parse(req.body);
  const { firstRegisteredAt, acquiredAt, motDue, taxDue, insuranceDue, tachoCalibrationDue, ...rest } = input;
  const vehicle = await prisma.vehicle.create({
    data: {
      ...rest,
      companyId: req.user!.companyId,
      firstRegisteredAt: firstRegisteredAt ? new Date(firstRegisteredAt) : undefined,
      acquiredAt: acquiredAt ? new Date(acquiredAt) : undefined,
      motDue: motDue ? new Date(motDue) : undefined,
      taxDue: taxDue ? new Date(taxDue) : undefined,
      insuranceDue: insuranceDue ? new Date(insuranceDue) : undefined,
      tachoCalibrationDue: tachoCalibrationDue ? new Date(tachoCalibrationDue) : undefined,
    },
  });
  res.status(201).json(vehicle);
}));
