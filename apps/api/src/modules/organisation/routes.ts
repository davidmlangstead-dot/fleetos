import { randomUUID } from "node:crypto";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

type DepotRow = { id: string; companyId: string; name: string; address: string | null; postcode: string | null; phone: string | null; isActive: boolean; createdAt: Date; updatedAt: Date };
type AuditRow = { id: string; companyId: string; actorUserId: string | null; actorEmail: string | null; action: string; entityType: string; entityId: string | null; summary: string; metadata: unknown; createdAt: Date };

const managers = requireRoles("TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const readers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const organisationRouter = Router();
organisationRouter.use(requireAuth);

organisationRouter.get("/depots", readers, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<DepotRow[]>`
    SELECT id::text, "companyId", name, address, postcode, phone, "isActive", "createdAt", "updatedAt"
    FROM "Depot"
    WHERE "companyId" = ${req.user!.companyId}
    ORDER BY "isActive" DESC, name ASC
  `;
  res.json(rows);
}));

organisationRouter.post("/depots", managers, asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const address = typeof req.body?.address === "string" ? req.body.address.trim().slice(0, 240) : "";
  const postcode = typeof req.body?.postcode === "string" ? req.body.postcode.trim().slice(0, 20) : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 40) : "";
  if (!name) return res.status(400).json({ error: "Depot or site name is required" });

  const id = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "Depot" (id, "companyId", name, address, postcode, phone, "isActive", "createdAt", "updatedAt")
      VALUES (${id}::uuid, ${req.user!.companyId}, ${name}, ${address || null}, ${postcode || null}, ${phone || null}, true, NOW(), NOW())
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Depot_companyId_name_key")) return res.status(409).json({ error: "A depot or site with that name already exists" });
    throw error;
  }

  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DEPOT", entityId: id, summary: `Created depot/site ${name}` });
  res.status(201).json({ id, companyId: req.user!.companyId, name, address: address || null, postcode: postcode || null, phone: phone || null, isActive: true });
}));

organisationRouter.patch("/depots/:id", managers, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.$queryRaw<DepotRow[]>`
    SELECT id::text, "companyId", name, address, postcode, phone, "isActive", "createdAt", "updatedAt"
    FROM "Depot" WHERE id = ${id}::uuid AND "companyId" = ${req.user!.companyId} LIMIT 1
  `;
  if (!existing.length) return res.status(404).json({ error: "Depot or site not found" });

  const current = existing[0];
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : current.name;
  const address = typeof req.body?.address === "string" ? req.body.address.trim().slice(0, 240) : current.address ?? "";
  const postcode = typeof req.body?.postcode === "string" ? req.body.postcode.trim().slice(0, 20) : current.postcode ?? "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 40) : current.phone ?? "";
  const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : current.isActive;
  if (!name) return res.status(400).json({ error: "Depot or site name is required" });

  await prisma.$executeRaw`
    UPDATE "Depot"
    SET name = ${name}, address = ${address || null}, postcode = ${postcode || null}, phone = ${phone || null}, "isActive" = ${isActive}, "updatedAt" = NOW()
    WHERE id = ${id}::uuid AND "companyId" = ${req.user!.companyId}
  `;
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "DEPOT", entityId: id, summary: `${isActive ? "Updated" : "Archived"} depot/site ${name}`, metadata: { isActive } });
  res.json({ id, companyId: req.user!.companyId, name, address: address || null, postcode: postcode || null, phone: phone || null, isActive });
}));

organisationRouter.get("/audit", managers, asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const rows = await prisma.$queryRaw<AuditRow[]>`
    SELECT id::text, "companyId", "actorUserId", "actorEmail", action, "entityType", "entityId", summary, metadata, "createdAt"
    FROM "AuditEvent"
    WHERE "companyId" = ${req.user!.companyId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
  res.json(rows);
}));
