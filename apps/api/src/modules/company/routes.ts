import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireIdentity, requireRoles } from "../../middleware/auth.js";

export const companyRouter = Router();

const allowedIndustries = new Set(["HAULAGE", "LOGISTICS", "DRAINAGE", "CONSTRUCTION", "UTILITIES", "PLANT", "SERVICE", "OTHER"]);
const allowedSchemes = new Set(["FORS", "CLOCS", "DVSA_EARNED_RECOGNITION", "ISO_9001", "ISO_14001", "ISO_45001"]);
const allowedLicenceTypes = new Set(["RESTRICTED", "STANDARD_NATIONAL", "STANDARD_INTERNATIONAL"]);

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "fleet";
}
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cleanList(value: unknown, allowed: Set<string>) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))] : [];
}
function profileFromBody(body: any) {
  const operatorLicenceType = clean(body?.operatorLicenceType, 40);
  return {
    address: clean(body?.address, 240) || null,
    postcode: clean(body?.postcode, 20) || null,
    phone: clean(body?.phone, 40) || null,
    industries: cleanList(body?.industries, allowedIndustries),
    teamSize: clean(body?.teamSize, 40) || null,
    operatorLicenceNumber: clean(body?.operatorLicenceNumber, 60) || null,
    operatorLicenceType: allowedLicenceTypes.has(operatorLicenceType) ? operatorLicenceType : null,
    complianceSchemes: cleanList(body?.complianceSchemes, allowedSchemes),
    homeDepotName: clean(body?.homeDepotName, 120) || null,
    countryCode: clean(body?.countryCode, 2).toUpperCase() || "GB",
    usesHgv: body?.usesHgv === true,
  };
}

companyRouter.get("/workspaces", requireIdentity, asyncHandler(async (_req, res) => {
  const memberships = await prisma.companyMembership.findMany({
    where: { userId: res.locals.identity.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, company: { select: { id: true, name: true, slug: true } } },
  });
  return res.json(memberships.map((m) => ({ ...m.company, role: m.role })));
}));

companyRouter.post("/workspaces", requireIdentity, asyncHandler(async (req, res) => {
  const name = clean(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: "Company name is required" });

  const ownerId = res.locals.identity.id;
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await prisma.company.findUnique({ where: { slug } }); i += 1) slug = `${base}-${i}`.slice(0, 50);

  const profile = profileFromBody(req.body);
  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({ data: { name, slug, ownerId, ...profile } });
    await tx.companyMembership.create({ data: { userId: ownerId, companyId: created.id, role: "COMPANY_ADMIN" } });
    return created;
  });
  await writeAuditEvent({ companyId: company.id, actorUserId: ownerId, actorEmail: res.locals.identity.email, action: "CREATE", entityType: "COMPANY", entityId: company.id, summary: `Created company workspace ${company.name}` });
  return res.status(201).json({ id: company.id, name: company.name, slug: company.slug, role: "COMPANY_ADMIN" });
}));

companyRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.user!.companyId },
    select: {
      id: true, name: true, slug: true, address: true, postcode: true, phone: true,
      industries: true, teamSize: true, operatorLicenceNumber: true, operatorLicenceType: true,
      complianceSchemes: true, homeDepotName: true, countryCode: true, usesHgv: true,
    },
  });
  if (!company) return res.status(404).json({ error: "Company not found" });
  return res.json(company);
}));

companyRouter.patch("/", requireAuth, requireRoles("TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"), asyncHandler(async (req, res) => {
  const name = clean(req.body?.name, 120);
  const company = await prisma.company.update({
    where: { id: req.user!.companyId },
    data: { ...(name ? { name } : {}), ...profileFromBody(req.body) },
    select: {
      id: true, name: true, slug: true, address: true, postcode: true, phone: true,
      industries: true, teamSize: true, operatorLicenceNumber: true, operatorLicenceType: true,
      complianceSchemes: true, homeDepotName: true, countryCode: true, usesHgv: true,
    },
  });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "COMPANY", entityId: company.id, summary: `Updated company settings for ${company.name}` });
  return res.json(company);
}));
