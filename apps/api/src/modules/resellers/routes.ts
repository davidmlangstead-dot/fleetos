import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireIdentity } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const resellersRouter = Router();
resellersRouter.use(requireIdentity);

const createSchema = z.object({
  name:z.string().trim().min(2).max(160), slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  supportEmail:z.string().email().optional(), supportPhone:z.string().trim().max(80).optional(),
  wholesaleModel:z.enum(["PER_TENANT","PER_VEHICLE","FIXED_MINIMUM","NEGOTIATED"]).default("PER_TENANT"),
  branding:z.record(z.string(),z.unknown()).default({}),
});
const linkSchema=z.object({companyId:z.string().min(1),wholesaleMonthlyPence:z.number().int().min(0).nullable().optional(),retailMonthlyPence:z.number().int().min(0).nullable().optional()});
const memberSchema=z.object({email:z.string().email(),role:z.enum(["ADMIN","SALES","SUPPORT","VIEWER"]).default("ADMIN")});

type ResellerRow={id:string;name:string;slug:string;status:string;supportEmail:string|null;supportPhone:string|null;wholesaleModel:string;branding:Record<string,unknown>;createdAt:Date;updatedAt:Date};

const requirePlatformAdmin: RequestHandler = async (_req,res,next)=>{
  const rows=await prisma.$queryRaw<Array<{companyId:string}>>`SELECT "companyId" FROM "CompanyMembership" WHERE "userId"=${res.locals.identity.id} AND role='PLATFORM_ADMIN' LIMIT 1`;
  if(!rows[0]) return res.status(403).json({error:"Platform administrator access is required"});
  res.locals.platformCompanyId=rows[0].companyId; next();
};

const requireResellerAccess: RequestHandler = async (req,res,next)=>{
  const membership=await prisma.$queryRaw<Array<{role:string}>>`SELECT role FROM "ResellerMembership" WHERE "resellerId"=${req.params.id} AND "userId"=${res.locals.identity.id} LIMIT 1`;
  if(membership[0]) { res.locals.resellerRole=membership[0].role; return next(); }
  const platform=await prisma.$queryRaw<Array<{companyId:string}>>`SELECT "companyId" FROM "CompanyMembership" WHERE "userId"=${res.locals.identity.id} AND role='PLATFORM_ADMIN' LIMIT 1`;
  if(platform[0]) { res.locals.platformCompanyId=platform[0].companyId; return next(); }
  return res.status(403).json({error:"You do not have access to this reseller"});
};

resellersRouter.get("/mine", asyncHandler(async (_req,res)=>{
  const rows=await prisma.$queryRaw<Array<ResellerRow & {role:string;customers:bigint;vehicles:bigint}>>`
    SELECT r.*,rm.role,COUNT(DISTINCT cc."companyId")::bigint customers,COUNT(DISTINCT v.id)::bigint vehicles
    FROM "ResellerMembership" rm JOIN "Reseller" r ON r.id=rm."resellerId"
    LEFT JOIN "CompanyControl" cc ON cc."resellerId"=r.id LEFT JOIN "Vehicle" v ON v."companyId"=cc."companyId"
    WHERE rm."userId"=${res.locals.identity.id}
    GROUP BY r.id,rm.role ORDER BY r.name
  `;
  res.json(rows.map(r=>({...r,customers:Number(r.customers),vehicles:Number(r.vehicles)})));
}));

resellersRouter.get("/", requirePlatformAdmin, asyncHandler(async (_req,res)=>{
  const rows=await prisma.$queryRaw<Array<ResellerRow & {customers:bigint;vehicles:bigint;wholesalePence:bigint}>>`
    SELECT r.*,COUNT(DISTINCT cc."companyId")::bigint customers,COUNT(DISTINCT v.id)::bigint vehicles,COALESCE(SUM(DISTINCT cc."wholesaleMonthlyPence"),0)::bigint "wholesalePence"
    FROM "Reseller" r LEFT JOIN "CompanyControl" cc ON cc."resellerId"=r.id LEFT JOIN "Vehicle" v ON v."companyId"=cc."companyId"
    GROUP BY r.id ORDER BY r."createdAt" DESC
  `;
  res.json(rows.map(r=>({...r,customers:Number(r.customers),vehicles:Number(r.vehicles),wholesalePence:Number(r.wholesalePence)})));
}));

resellersRouter.post("/", requirePlatformAdmin, asyncHandler(async (req,res)=>{
  const v=createSchema.parse(req.body);
  const rows=await prisma.$queryRaw<ResellerRow[]>`
    INSERT INTO "Reseller" (name,slug,"supportEmail","supportPhone","wholesaleModel",branding) VALUES (${v.name},${v.slug},${v.supportEmail||null},${v.supportPhone||null},${v.wholesaleModel},${JSON.stringify(v.branding)}::jsonb) RETURNING *
  `;
  await writeAuditEvent({companyId:res.locals.platformCompanyId,actorUserId:res.locals.identity.id,actorEmail:res.locals.identity.email,action:"CREATE",entityType:"RESELLER",entityId:rows[0].id,summary:`Created reseller ${v.name}`});
  res.status(201).json(rows[0]);
}));

resellersRouter.post("/:id/members", requirePlatformAdmin, asyncHandler(async (req,res)=>{
  const v=memberSchema.parse(req.body);
  const users=await prisma.$queryRaw<Array<{id:string;email:string}>>`SELECT id,email FROM "User" WHERE lower(email)=lower(${v.email}) LIMIT 1`;
  if(!users[0]) return res.status(404).json({error:"That email must have a FleetOS user account before reseller access can be granted"});
  const rows=await prisma.$queryRaw<Array<{id:string;resellerId:string;userId:string;role:string}>>`
    INSERT INTO "ResellerMembership" ("resellerId","userId",role) VALUES (${req.params.id},${users[0].id},${v.role})
    ON CONFLICT ("resellerId","userId") DO UPDATE SET role=EXCLUDED.role RETURNING id,"resellerId","userId",role
  `;
  res.status(201).json({...rows[0],email:users[0].email});
}));

resellersRouter.get("/:id/customers", requireResellerAccess, asyncHandler(async (req,res)=>{
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT c.id,c.name,c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."trialEndsAt",cc."vehicleLimit",cc."wholesaleMonthlyPence",cc."retailMonthlyPence",COUNT(v.id)::bigint AS "vehicleUsage"
    FROM "CompanyControl" cc JOIN "Company" c ON c.id=cc."companyId" LEFT JOIN "Vehicle" v ON v."companyId"=c.id
    WHERE cc."resellerId"=${req.params.id}
    GROUP BY c.id,c.name,c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."trialEndsAt",cc."vehicleLimit",cc."wholesaleMonthlyPence",cc."retailMonthlyPence" ORDER BY c.name
  `;
  res.json(rows.map(r=>({...r,vehicleUsage:Number(r.vehicleUsage)})));
}));

resellersRouter.post("/:id/customers", requirePlatformAdmin, asyncHandler(async (req,res)=>{
  const v=linkSchema.parse(req.body);
  const exists=(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "Reseller" WHERE id=${req.params.id} LIMIT 1`)[0];
  if(!exists) return res.status(404).json({error:"Reseller not found"});
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    UPDATE "CompanyControl" SET "resellerId"=${req.params.id},"wholesaleMonthlyPence"=${v.wholesaleMonthlyPence??null},"retailMonthlyPence"=${v.retailMonthlyPence??null},"updatedAt"=NOW() WHERE "companyId"=${v.companyId}
    RETURNING "companyId","resellerId","wholesaleMonthlyPence","retailMonthlyPence"
  `;
  if(!rows[0]) return res.status(404).json({error:"Company controls not found"});
  await writeAuditEvent({companyId:v.companyId,actorUserId:res.locals.identity.id,actorEmail:res.locals.identity.email,action:"UPDATE",entityType:"RESELLER_LINK",entityId:v.companyId,summary:`Linked company to reseller ${req.params.id}`});
  res.json(rows[0]);
}));
