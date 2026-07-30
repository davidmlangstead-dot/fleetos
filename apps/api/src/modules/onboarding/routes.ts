import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireIdentity } from "../../middleware/auth.js";

const createCompany = z.object({ companyName: z.string().trim().min(2).max(100) });

function slugifyCompanyName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "company";
}

async function buildUniqueSlug(baseName: string) {
  const baseSlug = slugifyCompanyName(baseName);
  let slug = baseSlug;
  let counter = 1;

  while (await prisma.company.findFirst({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

export const onboardingRouter = Router();
onboardingRouter.use(requireIdentity);

onboardingRouter.get(
  "/me",
  asyncHandler(async (_req, res) => {
    const membership = await prisma.companyMembership.findFirst({ where: { userId: res.locals.identity.id }, include: { company: true } });
    res.json({ membership: membership ? { companyName: membership.company.name, role: membership.role } : null });
  })
);

onboardingRouter.post(
  "/company",
  asyncHandler(async (req, res) => {
    const { companyName } = createCompany.parse(req.body);
    const existing = await prisma.companyMembership.findFirst({ where: { userId: res.locals.identity.id } });
    if (existing) return res.status(409).json({ error: "You already belong to a company" });

    const slug = await buildUniqueSlug(companyName);
    const company = await prisma.company.create({
      data: {
        name: companyName,
        slug,
        ownerId: res.locals.identity.id,
        memberships: {
          create: {
            userId: res.locals.identity.id,
            role: "COMPANY_ADMIN",
          },
        },
      },
    });

    res.status(201).json({ id: company.id, name: company.name });
  })
);
