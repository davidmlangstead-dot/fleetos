import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { runAdvancedMedicChecks } from "./advancedChecks.js";

const roles = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"] as const;
export const medicAdvancedRouter = Router();
medicAdvancedRouter.use(requireAuth, requireRoles(...roles));

medicAdvancedRouter.get("/status", asyncHandler(async (req, res) => {
  const checks = await runAdvancedMedicChecks(req.user!.companyId);
  res.json({
    overall: checks.some((item) => item.status === "DEGRADED") ? "DEGRADED" : "HEALTHY",
    checkedAt: new Date().toISOString(),
    authority: { observe: true, safeRecovery: true, destructiveRecovery: false, automaticDeployments: false, automaticSecurityChanges: false },
    checks,
  });
}));

medicAdvancedRouter.get("/intelligence", asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId }, select: { usesHgv: true, complianceSchemes: true } });
  const schemes = new Set((company?.complianceSchemes ?? []).map((item) => item.toUpperCase()));
  const allowed = ["DVSA", "RHA", ...(schemes.has("FORS") ? ["FORS"] : []), ...(schemes.has("CLOCS") ? ["CLOCS"] : [])];
  if (!company?.usesHgv) allowed.splice(allowed.indexOf("RHA"), 1);
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; source: string; title: string; url: string; severity: string; topics: string[]; publishedAt: Date | null; firstSeenAt: Date }>>`
      SELECT id,source,title,url,severity,topics,"publishedAt","firstSeenAt"
      FROM "ComplianceIntelligenceItem"
      WHERE source = ANY(${allowed})
        AND COALESCE("publishedAt","firstSeenAt") > NOW()-INTERVAL '60 days'
      ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
               COALESCE("publishedAt","firstSeenAt") DESC
      LIMIT 50
    `;
    res.json({ sources: allowed, items: rows });
  } catch {
    res.json({ sources: allowed, items: [], note: "Compliance intelligence has not completed its first storage migration/sweep yet." });
  }
}));
