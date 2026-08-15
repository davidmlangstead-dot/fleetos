import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const resellersRouter = Router();
resellersRouter.use(requireAuth);

const createSchema = z.object({
  name:z.string().trim().min(2).max(160), slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  supportEmail:z.string().email().optional(), supportPhone:z.string().trim().max(80).optional(),
  wholesaleModel:z.enum(["PER_TENANT","PER_VEHICLE","FIXED_MINIMUM","NEGOTIATED"]).default("PER_TENANT"),
  branding:z.record(z.string(),z.unknown()).default({}),
});
const linkSchema=z.object({companyId:z.string().min(1),wholesaleMonthlyPence:z.number().int().min(0).nullable().optional(),retailMonthlyPence:z.number().int().min(0).nullable().optional()});

type ResellerRow={id:string;name:string;slug:string;status:string;supportEmail:string|null;supportPhone:string|null;wholesaleModel:string;branding:Record<string,unknown>;createdAt:Date;updatedAt:Date};

resellersRouter.get("/", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (_req,res)=>{
  const rows=await prisma.$queryRaw<Array<ResellerRow & {customers:bigint;vehicles:bigint;wholesalePence:bigint}>>`
    SELECT r.*,COUNT(DISTINCT cc."companyId")::bigint customers,COUNT(DISTINCT v.id)::bigint vehicles,COALESCE(SUM(DISTINCT cc."wholesaleMonthlyPence"),0)::bigint "wholesalePence"
    FROM "Reseller" r LEFT JOIN "CompanyControl" cc ON cc."resellerId"=r.id LEFT JOIN "Vehicle" v ON v."companyId"=cc."companyId"
    GROUP BY r.id ORDER BY r."createdAt" DESC
  `;
  res.json(rows.map(r=>({...r,customers:Number(r.customers),vehicles:Number(r.vehicles),wholesalePence:Number(r.wholesalePence)})));
}));

resellersRouter.post("/", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (req,res)=>{
  const v=createSchema.parse(req.body);
  const rows=await prisma.$queryRaw<ResellerRow[]>`
    INSERT INTO "Reseller" (name,slug,"supportEmail","supportPhone","wholesaleModel",branding) VALUES (${v.name},${v.slug},${v.supportEmail||null},${v.supportPhone||null},${v.wholesaleModel},${JSON.stringify(v.branding)}::jsonb) RETURNING *
  `;
  await writeAuditEvent({companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"CREATE",entityType:"RESELLER",entityId:rows[0].id,summary:`Created reseller ${v.name}`});
  res.status(201).json(rows[0]);
}));

resellersRouter.get("/:id/customers", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (req,res)=>{
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT c.id,c.name,c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."trialEndsAt",cc."vehicleLimit",cc."wholesaleMonthlyPence",cc."retailMonthlyPence",COUNT(v.id)::bigint AS "vehicleUsage"
    FROM "CompanyControl" cc JOIN "Company" c ON c.id=cc."companyId" LEFT JOIN "Vehicle" v ON v."companyId"=c.id
    WHERE cc."resellerId"=${req.params.id}
    GROUP BY c.id,c.name,c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."trialEndsAt",cc."vehicleLimit",cc."wholesaleMonthlyPence",cc."retailMonthlyPence" ORDER BY c.name
  `;
  res.json(rows.map(r=>({...r,vehicleUsage:Number(r.vehicleUsage)})));
}));

resellersRouter.post("/:id/customers", requireRoles("PLATFORM_ADMIN"), asyncHandler(async (req,res)=>{
  const v=linkSchema.parse(req.body);
  const exists=(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "Reseller" WHERE id=${req.params.id} LIMIT 1`)[0];
  if(!exists) return res.status(404).json({error:"Reseller not found"});
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    UPDATE "CompanyControl" SET "resellerId"=${req.params.id},"wholesaleMonthlyPence"=${v.wholesaleMonthlyPence??null},"retailMonthlyPence"=${v.retailMonthlyPence??null},"updatedAt"=NOW() WHERE "companyId"=${v.companyId}
    RETURNING "companyId","resellerId","wholesaleMonthlyPence","retailMonthlyPence"
  `;
  if(!rows[0]) return res.status(404).json({error:"Company controls not found"});
  await writeAuditEvent({companyId:v.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"UPDATE",entityType:"RESELLER_LINK",entityId:v.companyId,summary:`Linked company to reseller ${req.params.id}`});
  res.json(rows[0]);
}));
