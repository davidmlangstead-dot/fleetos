import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const modules = ["TRAINING","INCIDENT","INFRINGEMENT","PCN","TOOLBOX_TALK","FUEL","TYRE","EQUIPMENT","COST","SUPPLIER","INSURANCE_CLAIM","SERVICE_HISTORY","PARTS_STOCK","DRIVER_SCORECARD"] as const;
type Module = typeof modules[number];
const moduleSet = new Set<string>(modules);

const readRoles = ["WORKSHOP_TECHNICIAN","TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","FINANCE","COMPANY_ADMIN","PLATFORM_ADMIN"] as const;
const managementRoles = new Set(["TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","COMPANY_ADMIN","PLATFORM_ADMIN"]);
const workshopRoles = new Set(["WORKSHOP_TECHNICIAN","TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","COMPANY_ADMIN","PLATFORM_ADMIN"]);
const financeRoles = new Set(["FINANCE","TRANSPORT_MANAGER","OFFICE_STAFF","COMPANY_ADMIN","PLATFORM_ADMIN"]);

function canUse(role: string, module: Module) {
  if (["FUEL","TYRE","EQUIPMENT","SERVICE_HISTORY","PARTS_STOCK"].includes(module)) return workshopRoles.has(role);
  if (["COST","SUPPLIER","INSURANCE_CLAIM"].includes(module)) return financeRoles.has(role) || managementRoles.has(role);
  return managementRoles.has(role);
}

function moduleFrom(value: unknown): Module | null {
  return typeof value === "string" && moduleSet.has(value.toUpperCase()) ? value.toUpperCase() as Module : null;
}

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const createSchema = z.object({
  reference: z.string().trim().max(80).optional(),
  title: z.string().trim().min(1).max(180),
  status: z.string().trim().max(40).default("OPEN"),
  occurredAt: z.string().trim().max(40).optional(),
  dueAt: z.string().trim().max(40).optional(),
  amountPence: z.number().int().min(0).max(2_000_000_000).optional(),
  subjectType: z.string().trim().max(40).optional(),
  subjectId: z.string().trim().max(120).optional(),
  subjectLabel: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const patchSchema = createSchema.partial().extend({ archived: z.boolean().optional() });

export const registersRouter = Router();
registersRouter.use(requireAuth, requireRoles(...readRoles));

registersRouter.get("/:module", asyncHandler(async (req, res) => {
  const module = moduleFrom(req.params.module);
  if (!module) return res.status(404).json({ error: "Unknown register module" });
  if (!canUse(req.user!.role, module)) return res.status(403).json({ error: "You do not have permission for this register" });
  const includeArchived = req.query.archived === "true";
  const items = await prisma.registerItem.findMany({
    where: { companyId: req.user!.companyId, module, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 250,
  });
  return res.json(items);
}));

registersRouter.post("/:module", asyncHandler(async (req, res) => {
  const module = moduleFrom(req.params.module);
  if (!module) return res.status(404).json({ error: "Unknown register module" });
  if (!canUse(req.user!.role, module)) return res.status(403).json({ error: "You do not have permission for this register" });
  const input = createSchema.parse(req.body);
  const item = await prisma.registerItem.create({ data: {
    companyId: req.user!.companyId,
    module,
    reference: input.reference || null,
    title: input.title,
    status: input.status || "OPEN",
    occurredAt: asDate(input.occurredAt),
    dueAt: asDate(input.dueAt),
    amountPence: input.amountPence ?? null,
    subjectType: input.subjectType || null,
    subjectId: input.subjectId || null,
    subjectLabel: input.subjectLabel || null,
    notes: input.notes || null,
    createdById: req.user!.id,
  }});
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: `REGISTER_${module}`, entityId: item.id, summary: `${module.replaceAll("_", " ")} record created: ${item.title}` });
  return res.status(201).json(item);
}));

registersRouter.patch("/:module/:id", asyncHandler(async (req, res) => {
  const module = moduleFrom(req.params.module);
  if (!module) return res.status(404).json({ error: "Unknown register module" });
  if (!canUse(req.user!.role, module)) return res.status(403).json({ error: "You do not have permission for this register" });
  const existing = await prisma.registerItem.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId, module } });
  if (!existing) return res.status(404).json({ error: "Register item not found" });
  const input = patchSchema.parse(req.body);
  const item = await prisma.registerItem.update({ where: { id: existing.id }, data: {
    ...(input.reference !== undefined ? { reference: input.reference || null } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.status !== undefined ? { status: input.status || "OPEN" } : {}),
    ...(input.occurredAt !== undefined ? { occurredAt: asDate(input.occurredAt) } : {}),
    ...(input.dueAt !== undefined ? { dueAt: asDate(input.dueAt) } : {}),
    ...(input.amountPence !== undefined ? { amountPence: input.amountPence } : {}),
    ...(input.subjectType !== undefined ? { subjectType: input.subjectType || null } : {}),
    ...(input.subjectId !== undefined ? { subjectId: input.subjectId || null } : {}),
    ...(input.subjectLabel !== undefined ? { subjectLabel: input.subjectLabel || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
  }});
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: input.archived === true ? "ARCHIVE" : input.archived === false ? "RESTORE" : "UPDATE", entityType: `REGISTER_${module}`, entityId: item.id, summary: `${module.replaceAll("_", " ")} record updated: ${item.title}` });
  return res.json(item);
}));
