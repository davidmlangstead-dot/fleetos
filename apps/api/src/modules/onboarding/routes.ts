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
    const { companyName } = req.body;

    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({ error: "Company name is required" });
    }

    const ownerId = res.locals.identity.id;
    console.log("Onboarding ownerId:", ownerId);
console.log("Onboarding company:", companyName);

    const existing = await prisma.company.findFirst({
      where: { ownerId },
    });

    if (existing) {
      return res.status(409).json({
        ok: true,
        duplicate: true,
        company: existing,
      });
    }
console.log("Creating company...");
    const company = await prisma.company.create({
      data: {
        name: companyName.trim(),
        slug: slugify(companyName),
        vatNumber: "",
        ownerId,
      },
    });

    res.status(201).json({
      ok: true,
      company,
    });
  })
);