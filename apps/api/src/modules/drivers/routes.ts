import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

const createDriver = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().email().optional(), phone: z.string().trim().max(40).optional(), licenceNumber: z.string().trim().max(64).optional() });
export const driversRouter = Router();
driversRouter.use(requireAuth);
driversRouter.get("/", asyncHandler(async (req, res) => res.json(await prisma.driver.findMany({ where: { companyId: req.user!.companyId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 100 }))));
driversRouter.post("/", asyncHandler(async (req, res) => { const input = createDriver.parse(req.body); const driver = await prisma.driver.create({ data: { ...input, companyId: req.user!.companyId } }); res.status(201).json(driver); }));
driversRouter.delete("/:id", asyncHandler(async (req, res) => { const driver = await prisma.driver.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } }); if (!driver) return res.status(404).json({ error: "Driver not found" }); await prisma.driver.delete({ where: { id: driver.id } }); res.status(204).send(); }));
