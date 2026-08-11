import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const [vehicles, activeJobs, overdueCompliance, openDefects, jobs] = await Promise.all([
      prisma.vehicle.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.job.count({ where: { companyId, status: { in: ["PLANNED", "ASSIGNED", "IN_PROGRESS"] } } }),
      prisma.complianceItem.count({ where: { companyId, dueDate: { lt: new Date() }, status: { not: "RESOLVED" } } }),
      prisma.defect.count({ where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.job.findMany({
        where: { companyId },
        include: { driver: true },
        orderBy: { collectionDateTime: "asc" },
        take: 5,
      }),
    ]);

    res.json({
      vehicles,
      activeJobs,
      overdueCompliance,
      openDefects,
      jobs: jobs.map((job) => ({
        id: job.id,
        reference: job.jobNumber,
        collectionAddress: job.collectionAddress,
        deliveryAddress: job.deliveryAddress,
        scheduledAt: job.collectionDateTime ?? job.deliveryDateTime ?? job.createdAt,
        status: job.status,
        driver: job.driver
          ? { firstName: job.driver.firstName, lastName: job.driver.lastName }
          : null,
      })),
    });
  }),
);
