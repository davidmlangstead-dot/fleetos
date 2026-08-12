import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const createJob = z.object({
  reference: z.string().min(1),
  customerName: z.string().min(1),
  collectionAddress: z.string().min(1),
  deliveryAddress: z.string().min(1),
  scheduledAt: z.coerce.date(),
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
    const job = await prisma.job.create({
      data: {
        jobNumber: input.reference,
        customerName: input.customerName,
        collectionAddress: input.collectionAddress,
        deliveryAddress: input.deliveryAddress,
        collectionDateTime: input.scheduledAt,
        companyId: req.user!.companyId,
      },
    });

    res.status(201).json({
      ...job,
      reference: job.jobNumber,
      scheduledAt: job.collectionDateTime ?? job.deliveryDateTime ?? job.createdAt,
    });
  })
);