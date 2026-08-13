import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const createJob = z.object({
  reference: z.string().trim().min(1).max(80),
  customerName: z.string().trim().min(1).max(160),
  collectionAddress: z.string().trim().min(1).max(1000),
  collectionPostcode: z.string().trim().max(20).optional(),
  deliveryAddress: z.string().trim().min(1).max(1000),
  deliveryPostcode: z.string().trim().max(20).optional(),
  scheduledAt: z.coerce.date(),
  deliveryAt: z.coerce.date().optional(),
  vehicleId: z.string().trim().min(1).optional(),
  driverId: z.string().trim().min(1).optional(),
  instructions: z.string().trim().max(4000).optional(),
  rate: z.number().min(0).max(10000000).optional(),
  weightKg: z.number().min(0).max(100000000).optional(),
  pallets: z.number().int().min(0).max(100000).optional(),
}).superRefine((input, ctx) => {
  if (input.deliveryAt && input.deliveryAt < input.scheduledAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAt"], message: "Delivery cannot be before collection." });
  }
});

const jobReaders = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const jobWriters = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

jobsRouter.get(
  "/",
  jobReaders,
  asyncHandler(async (req, res) => {
    const jobs = await prisma.job.findMany({
      where: { companyId: req.user!.companyId },
      include: { driver: true, vehicle: true },
      orderBy: { collectionDateTime: "asc" },
      take: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.json(jobs.map((job: any) => ({
      ...job,
      scheduledAt: job.collectionDateTime ?? job.deliveryDateTime ?? job.createdAt,
    })));
  })
);

jobsRouter.post(
  "/",
  jobWriters,
  asyncHandler(async (req, res) => {
    const input = createJob.parse(req.body);
    const companyId = req.user!.companyId;
    if (input.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({ where: { id: input.vehicleId, companyId }, select: { id: true } });
      if (!vehicle) return res.status(400).json({ error: "Vehicle is not in the selected company" });
    }
    if (input.driverId) {
      const driver = await prisma.driver.findFirst({ where: { id: input.driverId, companyId, isActive: true }, select: { id: true } });
      if (!driver) return res.status(400).json({ error: "Driver is not active in the selected company" });
    }
    const job = await prisma.job.create({
      data: {
        jobNumber: input.reference,
        customerName: input.customerName,
        collectionAddress: input.collectionAddress,
        collectionPostcode: input.collectionPostcode || null,
        deliveryAddress: input.deliveryAddress,
        deliveryPostcode: input.deliveryPostcode || null,
        collectionDateTime: input.scheduledAt,
        deliveryDateTime: input.deliveryAt,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        instructions: input.instructions || null,
        rate: input.rate,
        weightKg: input.weightKg,
        pallets: input.pallets,
        status: input.driverId || input.vehicleId ? "ASSIGNED" : "PLANNED",
        companyId,
      },
    });

    await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "JOB", entityId: job.id, summary: `Created job ${job.jobNumber ?? job.id}`, metadata: { customerName: job.customerName, vehicleId: job.vehicleId, driverId: job.driverId } });
    res.status(201).json({
      ...job,
      reference: job.jobNumber,
      scheduledAt: job.collectionDateTime ?? job.deliveryDateTime ?? job.createdAt,
    });
  })
);
