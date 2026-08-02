import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireIdentity } from "../../middleware/auth.js";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export const onboardingRouter = Router();
onboardingRouter.use(requireIdentity);

onboardingRouter.post(
  "/company",
  asyncHandler(async (req, res) => {
    const { companyName } = req.body;
    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({ error: "Company name is required" });
    }

    const existing = await prisma.company.findFirst({
      where: { ownerId: req.user!.id },
    });

    if (existing) {
      return res.status(409).json({ ok: true, duplicate: true, company: existing });
    }

    const company = await prisma.company.create({
      data: {
        name: companyName.trim(),
        slug: slugify(companyName),
        vatNumber: "",
        ownerId: res.locals.identity.id,
      },
    });

    res.status(201).json({ ok: true, company });
  })
);