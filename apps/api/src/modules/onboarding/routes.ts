import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireIdentity } from "../../middleware/auth.js";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export const onboardingRouter = Router();
onboardingRouter.use(requireIdentity);

onboardingRouter.post(
  "/company",
  asyncHandler(async (req, res) => {
    const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim() : "";
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
    for (let suffix = 2; await prisma.company.findUnique({ where: { slug } }); suffix += 1) {
      slug = `${baseSlug}-${suffix}`.slice(0, 50);
    }

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: companyName, slug, vatNumber: "", ownerId },
      });
      await tx.companyMembership.create({
        data: { userId: ownerId, companyId: company.id, role: "COMPANY_ADMIN" },
      });
      return company;
    });

    return res.status(201).json({ ok: true, company: result });
  })
);
