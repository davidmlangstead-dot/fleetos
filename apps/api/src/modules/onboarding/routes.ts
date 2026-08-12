import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireIdentity } from "../../middleware/auth.js";

function slugify(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50); }
function cleanString(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
const vehicleTypes = ["TRUCK", "VAN", "TRAILER", "CAR", "OTHER"] as const;

export const onboardingRouter = Router();
onboardingRouter.use(requireIdentity);

onboardingRouter.post("/company", asyncHandler(async (req, res) => {
  const companyName = cleanString(req.body?.companyName);
  if (!companyName) return res.status(400).json({ error: "Company name is required" });

  const ownerId = res.locals.identity.id;
  const existing = await prisma.company.findFirst({ where: { ownerId } });
  if (existing) {
    await prisma.companyMembership.upsert({
      where: { userId_companyId: { userId: ownerId, companyId: existing.id } },
      update: { role: "COMPANY_ADMIN" },
      create: { userId: ownerId, companyId: existing.id, role: "COMPANY_ADMIN" },
    });
    return res.status(409).json({ ok: true, duplicate: true, company: existing });
  }

  const baseSlug = slugify(companyName) || "company";
  let slug = baseSlug;
  for (let suffix = 2; ; suffix += 1) {
    if (!(await prisma.company.findUnique({ where: { slug } }))) break;
    slug = `${baseSlug}-${suffix}`.slice(0, 50);
  }

  const inputVehicles = Array.isArray(req.body?.vehicles) ? req.body.vehicles : [];
  const vehicles = inputVehicles.map((v: any) => ({
    registration: cleanString(v?.registration).toUpperCase(),
    type: vehicleTypes.includes(v?.type) ? v.type : "OTHER",
    firstRegisteredAt: cleanString(v?.firstRegisteredAt),
    acquiredAt: cleanString(v?.acquiredAt),
    motDue: cleanString(v?.motDue),
    taxDue: cleanString(v?.taxDue),
    insuranceDue: cleanString(v?.insuranceDue),
    tachoCalibrationDue: cleanString(v?.tachoCalibrationDue),
  })).filter((v: any) => v.registration);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const company = await tx.company.create({ data: { name: companyName, slug, vatNumber: "", ownerId } });
    await tx.companyMembership.create({ data: { userId: ownerId, companyId: company.id, role: "COMPANY_ADMIN" } });

    for (const v of vehicles) {
      if (v.acquiredAt && v.firstRegisteredAt && v.acquiredAt < v.firstRegisteredAt) throw new Error(`Acquired date cannot be before first registration for ${v.registration}.`);
      await tx.vehicle.create({ data: {
        companyId: company.id,
        registration: v.registration,
        type: v.type,
        status: "ACTIVE",
        firstRegisteredAt: v.firstRegisteredAt ? new Date(v.firstRegisteredAt) : undefined,
        acquiredAt: v.acquiredAt ? new Date(v.acquiredAt) : undefined,
        motDue: v.motDue ? new Date(v.motDue) : undefined,
        taxDue: v.taxDue ? new Date(v.taxDue) : undefined,
        insuranceDue: v.insuranceDue ? new Date(v.insuranceDue) : undefined,
        tachoCalibrationDue: v.tachoCalibrationDue ? new Date(v.tachoCalibrationDue) : undefined,
      } });
    }
    return company;
  });

  return res.status(201).json({ ok: true, company: result, vehicleCount: vehicles.length });
}));
