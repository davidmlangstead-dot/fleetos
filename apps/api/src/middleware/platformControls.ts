import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { isPlatformOwner, requireAuth } from "./auth.js";

const ownerOnlyFields = new Set([
  "subscriptionPlan", "subscriptionStatus", "seatLimit",
  "customDomain", "customDomainVerified", "emailSenderDomain", "emailDomainVerified",
  "brandName", "brandTagline", "brandLogoUrl", "brandPrimaryColor", "brandAccentColor", "brandSidebarColor",
  "brandSupportEmail", "brandSupportPhone", "showPoweredBy",
]);

export const protectOwnerCompanyControls: RequestHandler = async (req, res, next) => {
  if (req.method !== "PATCH") return next();
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const protectedKeys = Object.keys(body).filter((key) => ownerOnlyFields.has(key));
  if (!protectedKeys.length) return next();

  await requireAuth(req, res, async () => {
    if (await isPlatformOwner(req.user!.id)) return next();

    const reseller = await prisma.$queryRaw<Array<{ role: string }>>`
      SELECT rm.role
      FROM "CompanyControl" cc
      JOIN "ResellerMembership" rm ON rm."resellerId"=cc."resellerId"
      WHERE cc."companyId"=${req.user!.companyId}
        AND rm."userId"=${req.user!.id}
        AND rm.role='ADMIN'
      LIMIT 1
    `;
    if (reseller[0]) return next();

    return res.status(403).json({
      error: "White-label and commercial platform controls are managed by FleetOS or the assigned reseller",
      blockedFields: protectedKeys,
    });
  });
};
