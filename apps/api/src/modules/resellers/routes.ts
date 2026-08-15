import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { isPlatformOwner, requireIdentity, requirePlatformOwner } from "../../middleware/auth.js";
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
const inviteSchema=z.object({email:z.string().email().optional(),role:z.enum(["ADMIN","SALES","SUPPORT","VIEWER"]).default("ADMIN"),expiresInDays:z.number().int().min(1).max(30).default(7)});
const tokenSchema=z.object({token:z.string().min(32).max(256)});
const claimSchema=z.object({token:z.string().min(32).max(256),companyId:z.string().min(1)});

type ResellerRow={id:string;name:string;slug:string;status:string;supportEmail:string|null;supportPhone:string|null;wholesaleModel:string;branding:Record<string,unknown>;createdAt:Date;updatedAt:Date};
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
const newToken=()=>randomBytes(32).toString("base64url");

const requireResellerAccess: RequestHandler = async (req,res,next)=>{
  const membership=await prisma.$queryRaw<Array<{role:string}>>`SELECT role FROM "ResellerMembership" WHERE "resellerId"=${req.params.id} AND "userId"=${res.locals.identity.id} LIMIT 1`;
  if(membership[0]) { res.locals.resellerRole=membership[0].role; return next(); }
  if(await isPlatformOwner(res.locals.identity.id)) { res.locals.platformOwner=true; return next(); }
  return res.status(403).json({error:"You do not have access to this reseller"});
};

const requireResellerManager: RequestHandler = async (req,res,next)=>{
  await requireResellerAccess(req,res,()=>{
    if(res.locals.platformOwner || ["ADMIN","SALES"].includes(res.locals.resellerRole)) return next();
    return res.status(403).json({error:"Reseller admin or sales access is required"});
  });
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

resellersRouter.get("/", requirePlatformOwner, asyncHandler(async (_req,res)=>{
  const rows=await prisma.$queryRaw<Array<ResellerRow & {customers:bigint;vehicles:bigint;wholesalePence:bigint}>>`
    SELECT r.*,COUNT(DISTINCT cc."companyId")::bigint customers,COUNT(DISTINCT v.id)::bigint vehicles,COALESCE(SUM(DISTINCT cc."wholesaleMonthlyPence"),0)::bigint "wholesalePence"
    FROM "Reseller" r LEFT JOIN "CompanyControl" cc ON cc."resellerId"=r.id LEFT JOIN "Vehicle" v ON v."companyId"=cc."companyId"
    GROUP BY r.id ORDER BY r."createdAt" DESC
  `;
  res.json(rows.map(r=>({...r,customers:Number(r.customers),vehicles:Number(r.vehicles),wholesalePence:Number(r.wholesalePence)})));
}));

resellersRouter.post("/", requirePlatformOwner, asyncHandler(async (req,res)=>{
  const v=createSchema.parse(req.body);
  const rows=await prisma.$queryRaw<ResellerRow[]>`
    INSERT INTO "Reseller" (name,slug,"supportEmail","supportPhone","wholesaleModel",branding) VALUES (${v.name},${v.slug},${v.supportEmail||null},${v.supportPhone||null},${v.wholesaleModel},${JSON.stringify(v.branding)}::jsonb) RETURNING *
  `;
  res.status(201).json(rows[0]);
}));

resellersRouter.post("/:id/members", requirePlatformOwner, asyncHandler(async (req,res)=>{
  const v=memberSchema.parse(req.body);
  const users=await prisma.$queryRaw<Array<{id:string;email:string}>>`SELECT id,email FROM "User" WHERE lower(email)=lower(${v.email}) LIMIT 1`;
  if(!users[0]) return res.status(404).json({error:"That email must have a FleetOS user account before reseller access can be granted"});
  const rows=await prisma.$queryRaw<Array<{id:string;resellerId:string;userId:string;role:string}>>`
    INSERT INTO "ResellerMembership" ("resellerId","userId",role) VALUES (${req.params.id},${users[0].id},${v.role})
    ON CONFLICT ("resellerId","userId") DO UPDATE SET role=EXCLUDED.role RETURNING id,"resellerId","userId",role
  `;
  res.status(201).json({...rows[0],email:users[0].email});
}));

resellersRouter.post("/:id/invites", requirePlatformOwner, asyncHandler(async (req,res)=>{
  const v=inviteSchema.parse(req.body);
  const exists=(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "Reseller" WHERE id=${req.params.id} LIMIT 1`)[0];
  if(!exists) return res.status(404).json({error:"Reseller not found"});
  const token=newToken();
  const expiresAt=new Date(Date.now()+v.expiresInDays*86_400_000);
  await prisma.$executeRaw`INSERT INTO "ResellerInvite" ("resellerId","tokenHash",email,role,"expiresAt","createdByUserId") VALUES (${req.params.id},${tokenHash(token)},${v.email||null},${v.role},${expiresAt},${res.locals.identity.id})`;
  res.status(201).json({inviteUrl:`https://fleetos-orpin-one.vercel.app/reseller/join?token=${token}`,expiresAt:expiresAt.toISOString(),email:v.email??null,role:v.role});
}));

resellersRouter.post("/invites/accept", asyncHandler(async (req,res)=>{
  const {token}=tokenSchema.parse(req.body);
  const rows=await prisma.$queryRaw<Array<{id:string;resellerId:string;email:string|null;role:string;expiresAt:Date;acceptedAt:Date|null}>>`
    SELECT id::text,"resellerId",email,role,"expiresAt","acceptedAt" FROM "ResellerInvite" WHERE "tokenHash"=${tokenHash(token)} LIMIT 1
  `;
  const invite=rows[0];
  if(!invite || invite.acceptedAt || invite.expiresAt.getTime()<Date.now()) return res.status(400).json({error:"This reseller invitation is invalid, expired or already used"});
  if(invite.email && invite.email.toLowerCase()!==res.locals.identity.email.toLowerCase()) return res.status(403).json({error:"This invitation was issued to a different email address"});
  await prisma.$transaction(async(tx)=>{
    await tx.$executeRaw`INSERT INTO "ResellerMembership" ("resellerId","userId",role) VALUES (${invite.resellerId},${res.locals.identity.id},${invite.role}) ON CONFLICT ("resellerId","userId") DO UPDATE SET role=EXCLUDED.role`;
    await tx.$executeRaw`UPDATE "ResellerInvite" SET "acceptedAt"=NOW(),"acceptedByUserId"=${res.locals.identity.id} WHERE id=${invite.id}::uuid AND "acceptedAt" IS NULL`;
  });
  res.json({ok:true,resellerId:invite.resellerId});
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

resellersRouter.post("/:id/customers", requirePlatformOwner, asyncHandler(async (req,res)=>{
  const v=linkSchema.parse(req.body);
  const exists=(await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "Reseller" WHERE id=${req.params.id} LIMIT 1`)[0];
  if(!exists) return res.status(404).json({error:"Reseller not found"});
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    UPDATE "CompanyControl" SET "resellerId"=${req.params.id},"wholesaleMonthlyPence"=${v.wholesaleMonthlyPence??null},"retailMonthlyPence"=${v.retailMonthlyPence??null},"updatedAt"=NOW() WHERE "companyId"=${v.companyId}
    RETURNING "companyId","resellerId","wholesaleMonthlyPence","retailMonthlyPence"
  `;
  if(!rows[0]) return res.status(404).json({error:"Company controls not found"});
  res.json(rows[0]);
}));

resellersRouter.post("/:id/customer-invites", requireResellerManager, asyncHandler(async (req,res)=>{
  const v=z.object({expiresInDays:z.number().int().min(1).max(30).default(14)}).parse(req.body);
  const token=newToken();
  const expiresAt=new Date(Date.now()+v.expiresInDays*86_400_000);
  await prisma.$executeRaw`INSERT INTO "ResellerCustomerInvite" ("resellerId","tokenHash","expiresAt","createdByUserId") VALUES (${req.params.id},${tokenHash(token)},${expiresAt},${res.locals.identity.id})`;
  res.status(201).json({customerUrl:`https://fleetos-orpin-one.vercel.app/join?reseller=${token}`,expiresAt:expiresAt.toISOString()});
}));

resellersRouter.post("/customer-invites/claim", asyncHandler(async (req,res)=>{
  const v=claimSchema.parse(req.body);
  const membership=await prisma.$queryRaw<Array<{role:string}>>`SELECT role FROM "CompanyMembership" WHERE "companyId"=${v.companyId} AND "userId"=${res.locals.identity.id} LIMIT 1`;
  if(!membership[0] || !["COMPANY_ADMIN","PLATFORM_ADMIN"].includes(membership[0].role)) return res.status(403).json({error:"Company administrator access is required"});
  const rows=await prisma.$queryRaw<Array<{id:string;resellerId:string;expiresAt:Date;usedAt:Date|null}>>`SELECT id::text,"resellerId","expiresAt","usedAt" FROM "ResellerCustomerInvite" WHERE "tokenHash"=${tokenHash(v.token)} LIMIT 1`;
  const invite=rows[0];
  if(!invite || invite.usedAt || invite.expiresAt.getTime()<Date.now()) return res.status(400).json({error:"This customer invitation is invalid, expired or already used"});
  await prisma.$transaction(async(tx)=>{
    await tx.$executeRaw`UPDATE "CompanyControl" SET "resellerId"=${invite.resellerId},"updatedAt"=NOW() WHERE "companyId"=${v.companyId}`;
    await tx.$executeRaw`UPDATE "ResellerCustomerInvite" SET "usedAt"=NOW(),"usedByCompanyId"=${v.companyId} WHERE id=${invite.id}::uuid AND "usedAt" IS NULL`;
  });
  res.json({ok:true,resellerId:invite.resellerId,companyId:v.companyId});
}));
