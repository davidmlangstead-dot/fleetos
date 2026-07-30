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
    const [vehicles, activeJobs, overdueCompliance, openDefects] = await Promise.all([
      prisma.vehicle.count({ where: { companyId, status: "ACTIVE" } }).catch(() => 0),
      prisma.job.count({ where: { companyId, status: { in: ["PLANNED", "ASSIGNED", "IN_PROGRESS"] } } }).catch(() => 0),
      prisma.complianceItem.count({ where: { companyId, dueDate: { lt: new Date() }, status: { not: "RESOLVED" } } }).catch(() => 0),
      prisma.defect.count({ where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }).catch(() => 0),
    ]);
    res.json({ vehicles, activeJobs, overdueCompliance, openDefects });
  })
);
