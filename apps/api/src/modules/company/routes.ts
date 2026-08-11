import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const companyRouter = Router();

companyRouter.use(requireAuth);

companyRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { id: true, name: true, slug: true },
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    return res.json(company);
  }),
);
