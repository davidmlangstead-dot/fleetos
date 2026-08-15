import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const commercialRouter = Router();
commercialRouter.use(requireAuth);

const managers = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"] as const;
const patchSchema = z.object({
  betaEnabled: z.boolean().optional(),
  subscriptionPlan: z.enum(["EARLY_ACCESS", "STARTER", "GROWTH", "ENTERPRISE"]).optional(),
  subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  trialEndsAt: z.union([z.string().datetime(), z.null()]).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
});

type ControlRow = {
  companyId: string; subscriptionPlan: string; subscriptionStatus: string; betaEnabled: boolean;
  trialStartedAt: Date | null; trialEndsAt: Date | null; featureFlags: Record<string, boolean>;
};

function payload(row: ControlRow) {
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
    featureFlags: row.featureFlags ?? {},
  };
}

async function getControl(companyId: string) {
  const rows = await prisma.$queryRaw<ControlRow[]>`
    SELECT "companyId","subscriptionPlan","subscriptionStatus","betaEnabled","trialStartedAt","trialEndsAt","featureFlags"
    FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
  `;
  return rows[0];
}

commercialRouter.get("/", requireRoles(...managers), asyncHandler(async (req, res) => {
  const row = await getControl(req.user!.companyId);
  if (!row) return res.status(404).json({ error: "Company controls not found." });
  res.json(payload(row));
}));

commercialRouter.patch("/", requireRoles(...managers), asyncHandler(async (req, res) => {
  const input = patchSchema.parse(req.body);
  const companyId = req.user!.companyId;
  const current = await getControl(companyId);
  if (!current) return res.status(404).json({ error: "Company controls not found." });
  const betaEnabled = input.betaEnabled ?? current.betaEnabled;
  const subscriptionPlan = input.subscriptionPlan ?? current.subscriptionPlan;
  const subscriptionStatus = input.subscriptionStatus ?? current.subscriptionStatus;
  const trialEndsAt = input.trialEndsAt === undefined ? current.trialEndsAt : input.trialEndsAt === null ? null : new Date(input.trialEndsAt);
  const featureFlags = input.featureFlags ?? current.featureFlags ?? {};
  const rows = await prisma.$queryRaw<ControlRow[]>`
    UPDATE "CompanyControl"
    SET "betaEnabled"=${betaEnabled}, "subscriptionPlan"=${subscriptionPlan}, "subscriptionStatus"=${subscriptionStatus},
        "trialStartedAt"=CASE WHEN ${subscriptionStatus}='TRIAL' AND "trialStartedAt" IS NULL THEN NOW() ELSE "trialStartedAt" END,
        "trialEndsAt"=${trialEndsAt}, "featureFlags"=${JSON.stringify(featureFlags)}::jsonb, "updatedAt"=NOW()
    WHERE "companyId"=${companyId}
    RETURNING "companyId","subscriptionPlan","subscriptionStatus","betaEnabled","trialStartedAt","trialEndsAt","featureFlags"
  `;
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "COMMERCIAL_CONTROL", entityId: companyId, summary: `Updated beta/trial controls to ${subscriptionStatus}` });
  res.json(payload(rows[0]));
}));

commercialRouter.get("/portfolio", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (_req, res) => {
  const rows = await prisma.$queryRaw<Array<ControlRow & { companyName: string; slug: string; members: bigint }>>`
    SELECT cc."companyId",c.name AS "companyName",c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."betaEnabled",
      cc."trialStartedAt",cc."trialEndsAt",cc."featureFlags",COUNT(cm.id)::bigint AS members
    FROM "CompanyControl" cc JOIN "Company" c ON c.id=cc."companyId"
    LEFT JOIN "CompanyMembership" cm ON cm."companyId"=c.id
    GROUP BY cc."companyId",c.name,c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."betaEnabled",cc."trialStartedAt",cc."trialEndsAt",cc."featureFlags"
    ORDER BY c."createdAt" DESC
  `;
  res.json(rows.map((row) => ({ ...payload(row), companyName: row.companyName, slug: row.slug, members: Number(row.members) })));
}));
