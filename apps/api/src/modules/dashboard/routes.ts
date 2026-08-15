import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86_400_000);
    const [vehicles, activeJobs, overdueCompliance, openDefects, jobs, vehicleDates, driverDates, tachograph, control] = await Promise.all([
      prisma.vehicle.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.job.count({ where: { companyId, status: { in: ["PLANNED", "ASSIGNED", "IN_PROGRESS"] } } }),
      prisma.complianceItem.count({ where: { companyId, dueDate: { lt: now }, status: { not: "RESOLVED" } } }),
      prisma.defect.count({ where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.job.findMany({ where: { companyId }, include: { driver: true }, orderBy: { collectionDateTime: "asc" }, take: 5 }),
      prisma.$queryRaw<Array<{ overdue: bigint; dueSoon: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE d < ${now})::bigint AS overdue,
          COUNT(*) FILTER (WHERE d >= ${now} AND d <= ${soon})::bigint AS "dueSoon"
        FROM "Vehicle" v
        CROSS JOIN LATERAL unnest(ARRAY[v."motDue",v."taxDue",v."insuranceDue",v."tachoCalibrationDue"]) AS d
        WHERE v."companyId"=${companyId} AND v.status='ACTIVE' AND d IS NOT NULL
      `,
      prisma.$queryRaw<Array<{ overdue: bigint; dueSoon: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE d < ${now})::bigint AS overdue,
          COUNT(*) FILTER (WHERE d >= ${now} AND d <= ${soon})::bigint AS "dueSoon"
        FROM "Driver" dr
        CROSS JOIN LATERAL unnest(ARRAY[dr."licenceExpiry",dr."cpcExpiry",dr."dcpcExpiry",dr."tachoCardExpiry",dr."medicalDue"]) AS d
        WHERE dr."companyId"=${companyId} AND dr."isActive"=true AND d IS NOT NULL
      `,
      prisma.$queryRaw<Array<{ overdue: bigint; dueSoon: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE "nextDueAt" < ${now})::bigint AS overdue,
          COUNT(*) FILTER (WHERE "nextDueAt" >= ${now} AND "nextDueAt" <= ${soon})::bigint AS "dueSoon"
        FROM "TachographDownload" WHERE "companyId"=${companyId}
      `,
      prisma.$queryRaw<Array<{ subscriptionStatus: string; betaEnabled: boolean; trialEndsAt: Date | null }>>`
        SELECT "subscriptionStatus","betaEnabled","trialEndsAt" FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
      `,
    ]);

    const v = vehicleDates[0] ?? { overdue: 0n, dueSoon: 0n };
    const d = driverDates[0] ?? { overdue: 0n, dueSoon: 0n };
    const t = tachograph[0] ?? { overdue: 0n, dueSoon: 0n };
    const c = control[0];
    const attention = {
      critical: overdueCompliance + openDefects + Number(v.overdue) + Number(d.overdue) + Number(t.overdue),
      dueSoon: Number(v.dueSoon) + Number(d.dueSoon) + Number(t.dueSoon),
      vehicleDates: { overdue: Number(v.overdue), dueSoon: Number(v.dueSoon) },
      driverDates: { overdue: Number(d.overdue), dueSoon: Number(d.dueSoon) },
      tachograph: { overdue: Number(t.overdue), dueSoon: Number(t.dueSoon) },
    };
    const trialDaysRemaining = c?.trialEndsAt ? Math.max(0, Math.ceil((c.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null;

    res.json({
      vehicles,
      activeJobs,
      overdueCompliance,
      openDefects,
      attention,
      commercial: c ? { subscriptionStatus: c.subscriptionStatus, betaEnabled: c.betaEnabled, trialEndsAt: c.trialEndsAt?.toISOString() ?? null, trialDaysRemaining } : null,
      jobs: jobs.map((job) => ({
        id: job.id,
        reference: job.jobNumber,
        collectionAddress: job.collectionAddress,
        deliveryAddress: job.deliveryAddress,
        scheduledAt: job.collectionDateTime ?? job.deliveryDateTime ?? job.createdAt,
        status: job.status,
        driver: job.driver ? { firstName: job.driver.firstName, lastName: job.driver.lastName } : null,
      })),
    });
  }),
);
