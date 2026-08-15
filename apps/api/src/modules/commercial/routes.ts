import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const commercialRouter = Router();
commercialRouter.use(requireAuth);

const viewers = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"] as const;
const patchSchema = z.object({
  betaEnabled: z.boolean().optional(),
  subscriptionPlan: z.enum(["EARLY_ACCESS", "STARTER", "GROWTH", "ENTERPRISE"]).optional(),
  subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  trialEndsAt: z.union([z.string().datetime(), z.null()]).optional(),
  vehicleLimit: z.number().int().min(1).max(100000).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
});

type ControlRow = {
  companyId: string; subscriptionPlan: string; subscriptionStatus: string; betaEnabled: boolean;
  trialStartedAt: Date | null; trialEndsAt: Date | null; vehicleLimit: number; featureFlags: Record<string, boolean>;
};

function payload(row: ControlRow, vehicles = 0) {
  const now = Date.now();
  const ends = row.trialEndsAt?.getTime() ?? null;
  const remainingMs = ends === null ? null : Math.max(0, ends - now);
  return {
    companyId: row.companyId,
    subscriptionPlan: row.subscriptionPlan,
    subscriptionStatus: row.subscriptionStatus,
    betaEnabled: row.betaEnabled,
    trialStartedAt: row.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    trialExpired: row.subscriptionStatus === "TRIAL" && ends !== null && ends < now,
    trialDaysRemaining: remainingMs === null ? null : Math.ceil(remainingMs / 86_400_000),
    vehicleLimit: row.vehicleLimit,
    vehicleUsage: vehicles,
    vehiclesAvailable: Math.max(0, row.vehicleLimit - vehicles),
    vehicleLimitReached: vehicles >= row.vehicleLimit,
    featureFlags: row.featureFlags ?? {},
  };
}

async function getControl(companyId: string) {
  const rows = await prisma.$queryRaw<ControlRow[]>`
    SELECT "companyId","subscriptionPlan","subscriptionStatus","betaEnabled","trialStartedAt","trialEndsAt","vehicleLimit","featureFlags"
    FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
  `;
  return rows[0];
}

commercialRouter.get("/", requireRoles(...viewers), asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const [row, vehicles] = await Promise.all([getControl(companyId), prisma.vehicle.count({ where: { companyId } })]);
  if (!row) return res.status(404).json({ error: "Company controls not found." });
  res.json(payload(row, vehicles));
}));

// Paid tier, trial and allowance changes are platform-managed. Stripe/webhooks can call the
// same underlying service later; customer tenant admins cannot self-upgrade through this API.
commercialRouter.patch("/", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (req, res) => {
  const input = patchSchema.parse(req.body);
  const companyId = req.user!.companyId;
  const current = await getControl(companyId);
  if (!current) return res.status(404).json({ error: "Company controls not found." });

  const betaEnabled = input.betaEnabled ?? current.betaEnabled;
  const subscriptionPlan = input.subscriptionPlan ?? current.subscriptionPlan;
  const subscriptionStatus = input.subscriptionStatus ?? current.subscriptionStatus;
  const featureFlags = input.featureFlags ?? current.featureFlags ?? {};
  const vehicleLimit = input.vehicleLimit ?? current.vehicleLimit;

  const startingTrial = subscriptionStatus === "TRIAL" && current.subscriptionStatus !== "TRIAL";
  const trialStartedAt = startingTrial ? new Date() : current.trialStartedAt;
  const defaultTrialEnd = startingTrial ? new Date(Date.now() + 90 * 86_400_000) : current.trialEndsAt;
  const trialEndsAt = input.trialEndsAt === undefined ? defaultTrialEnd : input.trialEndsAt === null ? null : new Date(input.trialEndsAt);

  const rows = await prisma.$queryRaw<ControlRow[]>`
    UPDATE "CompanyControl"
    SET "betaEnabled"=${betaEnabled}, "subscriptionPlan"=${subscriptionPlan}, "subscriptionStatus"=${subscriptionStatus},
        "trialStartedAt"=${trialStartedAt}, "trialEndsAt"=${trialEndsAt}, "vehicleLimit"=${vehicleLimit},
        "featureFlags"=${JSON.stringify(featureFlags)}::jsonb, "updatedAt"=NOW()
    WHERE "companyId"=${companyId}
    RETURNING "companyId","subscriptionPlan","subscriptionStatus","betaEnabled","trialStartedAt","trialEndsAt","vehicleLimit","featureFlags"
  `;
  const vehicles = await prisma.vehicle.count({ where: { companyId } });
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "COMMERCIAL_CONTROL", entityId: companyId, summary: `Updated commercial controls to ${subscriptionStatus}; vehicle limit ${vehicleLimit}` });
  res.json(payload(rows[0], vehicles));
}));

commercialRouter.get("/portfolio", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (_req, res) => {
  const rows = await prisma.$queryRaw<Array<ControlRow & { companyName: string; slug: string; members: bigint; vehicles: bigint }>>`
    SELECT cc."companyId",c.name AS "companyName",c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."betaEnabled",
      cc."trialStartedAt",cc."trialEndsAt",cc."vehicleLimit",cc."featureFlags",COUNT(DISTINCT cm.id)::bigint AS members,
      COUNT(DISTINCT v.id)::bigint AS vehicles
    FROM "CompanyControl" cc JOIN "Company" c ON c.id=cc."companyId"
    LEFT JOIN "CompanyMembership" cm ON cm."companyId"=c.id
    LEFT JOIN "Vehicle" v ON v."companyId"=c.id
    GROUP BY cc."companyId",c.name,c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."betaEnabled",cc."trialStartedAt",cc."trialEndsAt",cc."vehicleLimit",cc."featureFlags"
    ORDER BY c."createdAt" DESC
  `;
  res.json(rows.map((row) => ({ ...payload(row, Number(row.vehicles)), companyName: row.companyName, slug: row.slug, members: Number(row.members) })));
}));
