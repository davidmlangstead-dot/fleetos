import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireIdentity } from "../../middleware/auth.js";

export const companyRouter = Router();

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "fleet";
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
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "Company name is required" });

  const ownerId = res.locals.identity.id;
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await prisma.company.findUnique({ where: { slug } }); i += 1) slug = `${base}-${i}`.slice(0, 50);

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({ data: { name, slug, ownerId } });
    await tx.companyMembership.create({ data: { userId: ownerId, companyId: created.id, role: "COMPANY_ADMIN" } });
    return created;
  });
  return res.status(201).json({ id: company.id, name: company.name, slug: company.slug, role: "COMPANY_ADMIN" });
}));

companyRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId }, select: { id: true, name: true, slug: true } });
  if (!company) return res.status(404).json({ error: "Company not found" });
  return res.json(company);
}));
