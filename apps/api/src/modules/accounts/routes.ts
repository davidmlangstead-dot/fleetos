import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

const readers = requireRoles("TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const writers = requireRoles("TRANSPORT_MANAGER", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const types = ["QUOTE","SALES_INVOICE","PURCHASE_ORDER","SUPPLIER_INVOICE","EXPENSE","CREDIT_NOTE","PAYMENT","FUEL_COST","WORKSHOP_COST"] as const;
const statuses = ["DRAFT","ISSUED","APPROVED","PART_PAID","PAID","VOID","CANCELLED"] as const;
const baseSchema = z.object({
  type: z.enum(types), status: z.enum(statuses).default("DRAFT"), reference: z.string().trim().max(120).optional(),
  counterparty: z.string().trim().max(240).optional(), description: z.string().trim().max(3000).optional(),
  netPence: z.number().int().min(0), vatPence: z.number().int().min(0), grossPence: z.number().int().min(0),
  jobId: z.string().trim().max(120).optional(), vehicleId: z.string().trim().max(120).optional(),
  occurredAt: z.coerce.date().optional(), dueAt: z.coerce.date().nullable().optional(), paidAt: z.coerce.date().nullable().optional(),
  externalReference: z.string().trim().max(240).optional(), notes: z.string().trim().max(5000).optional(),
});
const inputSchema = baseSchema.superRefine((v, ctx) => { if (v.grossPence !== v.netPence + v.vatPence) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["grossPence"], message: "Gross must equal net plus VAT" }); });
const patchSchema = baseSchema.partial();

type Row = { id:string; companyId:string; type:string; status:string; reference:string|null; counterparty:string|null; description:string|null; netPence:number; vatPence:number; grossPence:number; jobId:string|null; vehicleId:string|null; occurredAt:Date; dueAt:Date|null; paidAt:Date|null; externalReference:string|null; notes:string|null; createdBy:string|null; createdAt:Date; updatedAt:Date };

accountsRouter.get("/transactions", readers, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT * FROM "OperationalTransaction" WHERE "companyId"=${req.user!.companyId} ORDER BY "occurredAt" DESC,"createdAt" DESC LIMIT 1000
  `;
  res.json(rows);
}));

accountsRouter.post("/transactions", writers, asyncHandler(async (req, res) => {
  const v = inputSchema.parse(req.body); const companyId=req.user!.companyId;
  const rows = await prisma.$queryRaw<Row[]>`
    INSERT INTO "OperationalTransaction" ("companyId",type,status,reference,counterparty,description,"netPence","vatPence","grossPence","jobId","vehicleId","occurredAt","dueAt","paidAt","externalReference",notes,"createdBy")
    VALUES (${companyId},${v.type},${v.status},${v.reference||null},${v.counterparty||null},${v.description||null},${v.netPence},${v.vatPence},${v.grossPence},${v.jobId||null},${v.vehicleId||null},${v.occurredAt??new Date()},${v.dueAt??null},${v.paidAt??null},${v.externalReference||null},${v.notes||null},${req.user!.id}) RETURNING *
  `;
  await writeAuditEvent({ companyId, actorUserId:req.user!.id, actorEmail:req.user!.email, action:"CREATE", entityType:"OPERATIONAL_TRANSACTION", entityId:rows[0].id, summary:`Created ${v.type} ${v.reference ?? ""}`.trim() });
  res.status(201).json(rows[0]);
}));

accountsRouter.patch("/transactions/:id", writers, asyncHandler(async (req, res) => {
  const input=patchSchema.parse(req.body); const companyId=req.user!.companyId;
  const current=(await prisma.$queryRaw<Row[]>`SELECT * FROM "OperationalTransaction" WHERE id=${req.params.id} AND "companyId"=${companyId} LIMIT 1`)[0];
  if(!current) return res.status(404).json({error:"Transaction not found"});
  const next={...current,...input}; if(next.grossPence!==next.netPence+next.vatPence) return res.status(400).json({error:"Gross must equal net plus VAT"});
  const rows=await prisma.$queryRaw<Row[]>`
    UPDATE "OperationalTransaction" SET type=${next.type},status=${next.status},reference=${next.reference},counterparty=${next.counterparty},description=${next.description},"netPence"=${next.netPence},"vatPence"=${next.vatPence},"grossPence"=${next.grossPence},"jobId"=${next.jobId},"vehicleId"=${next.vehicleId},"occurredAt"=${next.occurredAt},"dueAt"=${next.dueAt},"paidAt"=${next.paidAt},"externalReference"=${next.externalReference},notes=${next.notes},"updatedAt"=NOW() WHERE id=${current.id} AND "companyId"=${companyId} RETURNING *
  `;
  await writeAuditEvent({ companyId, actorUserId:req.user!.id, actorEmail:req.user!.email, action:"UPDATE", entityType:"OPERATIONAL_TRANSACTION", entityId:current.id, summary:`Updated ${next.type} ${next.reference ?? ""}`.trim() });
  res.json(rows[0]);
}));

accountsRouter.get("/handover", readers, asyncHandler(async (req,res)=>{
  const companyId=req.user!.companyId;
  const rows=await prisma.$queryRaw<Array<{type:string;count:bigint;netPence:bigint;vatPence:bigint;grossPence:bigint}>>`
    SELECT type,COUNT(*)::bigint count,COALESCE(SUM("netPence"),0)::bigint "netPence",COALESCE(SUM("vatPence"),0)::bigint "vatPence",COALESCE(SUM("grossPence"),0)::bigint "grossPence" FROM "OperationalTransaction" WHERE "companyId"=${companyId} GROUP BY type ORDER BY type
  `;
  res.json({generatedAt:new Date().toISOString(),currency:"GBP",summary:rows.map(r=>({type:r.type,count:Number(r.count),netPence:Number(r.netPence),vatPence:Number(r.vatPence),grossPence:Number(r.grossPence)}))});
}));
