import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { isPlatformOwner, requireIdentity, requirePlatformOwner } from "../../middleware/auth.js";

export const resellersRouter = Router();
resellersRouter.use(requireIdentity);

const CUSTOMER_APP_URL = "https://fleetos-orpin-one.vercel.app";
const RESELLER_PORTAL_URL = "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app";
const DEFAULT_BRAND = { primaryColor:"#197B58", accentColor:"#32C58B", sidebarColor:"#0E1B2C" } as const;

const createSchema = z.object({
  name:z.string().trim().min(2).max(160), slug:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  supportEmail:z.string().email().optional(), supportPhone:z.string().trim().max(80).optional(),
  wholesaleModel:z.enum(["PER_TENANT","PER_VEHICLE","FIXED_MINIMUM","NEGOTIATED"]).default("PER_TENANT"),
  branding:z.record(z.string(),z.unknown()).default({}),
});
const brandingPatchSchema=z.object({
  name:z.string().trim().min(2).max(80).optional(),
  tagline:z.string().trim().max(160).optional(),
  logoUrl:z.union([z.string().trim().url().max(2048).refine(value=>new URL(value).protocol==="https:","Logo URL must use HTTPS"),z.literal(""),z.null()]).optional(),
  primaryColor:z.string().trim().regex(/^#[0-9a-f]{6}$/i).optional(),
  accentColor:z.string().trim().regex(/^#[0-9a-f]{6}$/i).optional(),
  sidebarColor:z.string().trim().regex(/^#[0-9a-f]{6}$/i).optional(),
  supportEmail:z.union([z.string().trim().email(),z.literal(""),z.null()]).optional(),
  supportPhone:z.union([z.string().trim().max(40),z.null()]).optional(),
  showPoweredBy:z.boolean().optional(),
  marketplaceEnabled:z.boolean().optional(),
});
const linkSchema=z.object({companyId:z.string().min(1),wholesaleMonthlyPence:z.number().int().min(0).nullable().optional(),retailMonthlyPence:z.number().int().min(0).nullable().optional()});
const memberSchema=z.object({email:z.string().email(),role:z.enum(["ADMIN","SALES","SUPPORT","VIEWER"]).default("ADMIN")});
const inviteSchema=z.object({email:z.string().email().optional(),role:z.enum(["ADMIN","SALES","SUPPORT","VIEWER"]).default("ADMIN"),expiresInDays:z.number().int().min(1).max(30).default(7)});
const tokenSchema=z.object({token:z.string().min(32).max(256)});
const claimSchema=z.object({token:z.string().min(32).max(256),companyId:z.string().min(1)});

type ResellerRow={id:string;name:string;slug:string;status:string;supportEmail:string|null;supportPhone:string|null;wholesaleModel:string;branding:Record<string,unknown>;createdAt:Date;updatedAt:Date};
type WhiteLabelBranding={name:string;tagline:string;logoUrl:string|null;primaryColor:string;accentColor:string;sidebarColor:string;supportEmail:string|null;supportPhone:string|null;showPoweredBy:boolean;marketplaceEnabled:boolean};
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
const newToken=()=>randomBytes(32).toString("base64url");

function normaliseBranding(row: Pick<ResellerRow,"name"|"supportEmail"|"supportPhone"|"branding">):WhiteLabelBranding{
  const raw=row.branding??{};
  const text=(key:string,fallback:string)=>typeof raw[key]==="string"&&String(raw[key]).trim()?String(raw[key]).trim():fallback;
  const nullable=(key:string,fallback:string|null)=>typeof raw[key]==="string"&&String(raw[key]).trim()?String(raw[key]).trim():fallback;
  const colour=(key:string,fallback:string)=>typeof raw[key]==="string"&&/^#[0-9a-f]{6}$/i.test(String(raw[key]))?String(raw[key]).toUpperCase():fallback;
  return {
    name:text("name",row.name),
    tagline:text("tagline","Transport operations, made simpler"),
    logoUrl:typeof raw.logoUrl==="string"&&raw.logoUrl.startsWith("https://")?raw.logoUrl:null,
    primaryColor:colour("primaryColor",DEFAULT_BRAND.primaryColor),
    accentColor:colour("accentColor",DEFAULT_BRAND.accentColor),
    sidebarColor:colour("sidebarColor",DEFAULT_BRAND.sidebarColor),
    supportEmail:nullable("supportEmail",row.supportEmail),
    supportPhone:nullable("supportPhone",row.supportPhone),
    showPoweredBy:raw.showPoweredBy!==false,
    marketplaceEnabled:raw.marketplaceEnabled!==false,
  };
}

async function applyBranding(resellerId:string,branding:WhiteLabelBranding,companyId?:string){
  await prisma.$executeRaw`
    UPDATE "CompanyControl" SET
      "brandName"=${branding.name},"brandTagline"=${branding.tagline},"brandLogoUrl"=${branding.logoUrl},
      "brandPrimaryColor"=${branding.primaryColor},"brandAccentColor"=${branding.accentColor},"brandSidebarColor"=${branding.sidebarColor},
      "brandSupportEmail"=${branding.supportEmail},"brandSupportPhone"=${branding.supportPhone},
      "showPoweredBy"=${branding.showPoweredBy},"marketplaceEnabled"=${branding.marketplaceEnabled},"updatedAt"=NOW()
    WHERE "resellerId"=${resellerId} AND (${companyId??null}::text IS NULL OR "companyId"=${companyId??null})
  `;
}

async function applyStoredBranding(resellerId:string,companyId?:string){
  const rows=await prisma.$queryRaw<ResellerRow[]>`SELECT * FROM "Reseller" WHERE id=${resellerId} LIMIT 1`;
  if(rows[0])await applyBranding(resellerId,normaliseBranding(rows[0]),companyId);
}

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

const requireResellerAdmin: RequestHandler = async (req,res,next)=>{
  await requireResellerAccess(req,res,()=>{
    if(res.locals.platformOwner || res.locals.resellerRole==="ADMIN") return next();
    return res.status(403).json({error:"Reseller administrator access is required"});
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

resellersRouter.get("/:id/branding",requireResellerAccess,asyncHandler(async(req,res)=>{
  const rows=await prisma.$queryRaw<ResellerRow[]>`SELECT * FROM "Reseller" WHERE id=${req.params.id} LIMIT 1`;
  if(!rows[0])return res.status(404).json({error:"Reseller not found"});
  res.json(normaliseBranding(rows[0]));
}));

resellersRouter.patch("/:id/branding",requireResellerAdmin,asyncHandler(async(req,res)=>{
  const input=brandingPatchSchema.parse(req.body);
  const rows=await prisma.$queryRaw<ResellerRow[]>`SELECT * FROM "Reseller" WHERE id=${req.params.id} LIMIT 1`;
  if(!rows[0])return res.status(404).json({error:"Reseller not found"});
  const current=normaliseBranding(rows[0]);
  const next:WhiteLabelBranding={
    ...current,...input,
    logoUrl:input.logoUrl===undefined?current.logoUrl:input.logoUrl||null,
    supportEmail:input.supportEmail===undefined?current.supportEmail:input.supportEmail||null,
    supportPhone:input.supportPhone===undefined?current.supportPhone:input.supportPhone||null,
    primaryColor:(input.primaryColor??current.primaryColor).toUpperCase(),
    accentColor:(input.accentColor??current.accentColor).toUpperCase(),
    sidebarColor:(input.sidebarColor??current.sidebarColor).toUpperCase(),
  };
  const updated=await prisma.$queryRaw<ResellerRow[]>`
    UPDATE "Reseller" SET branding=${JSON.stringify(next)}::jsonb,"supportEmail"=${next.supportEmail},"supportPhone"=${next.supportPhone},"updatedAt"=NOW() WHERE id=${req.params.id} RETURNING *
  `;
  await applyBranding(req.params.id,next);
  res.json(normaliseBranding(updated[0]));
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
  res.status(201).json({inviteUrl:`${RESELLER_PORTAL_URL}/join?token=${token}`,expiresAt:expiresAt.toISOString(),email:v.email??null,role:v.role});
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
  await applyStoredBranding(req.params.id,v.companyId);
  res.json(rows[0]);
}));

resellersRouter.post("/:id/customer-invites", requireResellerManager, asyncHandler(async (req,res)=>{
  const v=z.object({expiresInDays:z.number().int().min(1).max(30).default(14)}).parse(req.body);
  const token=newToken();
  const expiresAt=new Date(Date.now()+v.expiresInDays*86_400_000);
  await prisma.$executeRaw`INSERT INTO "ResellerCustomerInvite" ("resellerId","tokenHash","expiresAt","createdByUserId") VALUES (${req.params.id},${tokenHash(token)},${expiresAt},${res.locals.identity.id})`;
  res.status(201).json({customerUrl:`${CUSTOMER_APP_URL}/join?reseller=${token}`,expiresAt:expiresAt.toISOString()});
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
  await applyStoredBranding(invite.resellerId,v.companyId);
  res.json({ok:true,resellerId:invite.resellerId,companyId:v.companyId});
}));
