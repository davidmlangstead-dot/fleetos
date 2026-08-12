import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const createDriver = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
});

const driverManagers = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const driversRouter = Router();
driversRouter.use(requireAuth);

driversRouter.get("/", driverManagers, asyncHandler(async (req, res) => {
  const drivers = await prisma.driver.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 250,
  });
  res.json(drivers);
}));

driversRouter.post("/", driverManagers, asyncHandler(async (req, res) => {
  const input = createDriver.parse(req.body);
  const driver = await prisma.driver.create({
    data: {
      companyId: req.user!.companyId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email || null,
      phone: input.phone || null,
      isActive: true,
    },
  });
  res.status(201).json(driver);
}));

driversRouter.delete("/:id", requireRoles("TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"), asyncHandler(async (req, res) => {
  const driver = await prisma.driver.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId }, select: { id: true } });
  if (!driver) return res.status(404).json({ error: "Driver not found" });
  await prisma.driver.update({ where: { id: driver.id }, data: { isActive: false, leftDate: new Date() } });
  res.status(204).end();
}));
