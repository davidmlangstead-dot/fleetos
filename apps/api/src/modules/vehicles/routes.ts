import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

const createVehicle = z.object({ registration: z.string().trim().min(1).max(16), fleetNumber: z.string().trim().max(32).optional(), vin: z.string().trim().max(64).optional(), type: z.enum(["TRUCK", "VAN", "TRAILER", "CAR", "OTHER"]) });
export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);
vehiclesRouter.get("/", asyncHandler(async (req, res) => res.json(await prisma.vehicle.findMany({ where: { companyId: req.user!.companyId }, orderBy: { registration: "asc" }, take: 100 }))));
vehiclesRouter.post("/", asyncHandler(async (req, res) => { const input = createVehicle.parse(req.body); const vehicle = await prisma.vehicle.create({ data: { ...input, companyId: req.user!.companyId } }); res.status(201).json(vehicle); }));
vehiclesRouter.delete("/:id", asyncHandler(async (req, res) => { const vehicle = await prisma.vehicle.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } }); if (!vehicle) return res.status(404).json({ error: "Vehicle not found" }); await prisma.vehicle.delete({ where: { id: vehicle.id } }); res.status(204).send(); }));
