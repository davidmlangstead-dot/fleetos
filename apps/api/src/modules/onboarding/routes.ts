import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireIdentity } from "../../middleware/auth.js";

export const onboardingRouter = Router();

function generateSlug(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
  return base || "company";
}

async function findAvailableSlug(name: string) {
  const base = generateSlug(name);
  let slug = base;
  let suffix = 1;

  while (await prisma.company.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix++}`;
  }

  return slug;
}

onboardingRouter.get(
  "/me",
  requireIdentity,
  asyncHandler(async (req, res) => {
    const membership = await prisma.companyMembership.findFirst({
      where: { userId: res.locals.identity.id },
      select: { id: true, companyId: true, role: true },
    });

    res.json({ membership });
  })
);

onboardingRouter.post(
  "/",
  requireIdentity,
  asyncHandler(async (req, res) => {
    const { companyName } = req.body;
    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({ error: "Company name is required" });
    }

    const userId = res.locals.identity.id;
    const existingMembership = await prisma.companyMembership.findFirst({ where: { userId } });
    if (existingMembership) {
      return res.status(409).json({ error: "User already has an active workspace", membership: existingMembership });
    }

    const slug = await findAvailableSlug(companyName);
    const company = await prisma.company.create({
      data: {
        name: companyName.trim(),
        slug,
        ownerId: userId,
        memberships: {
          create: {
            userId,
            role: "COMPANY_ADMIN",
          },
        },
      },
    });

    return res.status(201).json({ ok: true, company: { id: company.id, name: company.name, slug: company.slug } });
  })
);
