import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const marketplaceRoles = requireRoles("WORKSHOP_TECHNICIAN","TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","COMPANY_ADMIN","PLATFORM_ADMIN");
const createListing = z.object({
  category:z.string().trim().min(1).max(60), title:z.string().trim().min(1).max(160),
  description:z.string().trim().max(3000).optional(), location:z.string().trim().max(120).optional(),
  pricePence:z.number().int().min(0).max(2_000_000_000).optional(),
});
const inquirySchema = z.object({message:z.string().trim().min(1).max(3000)});
const listingIdSchema = z.string().uuid();

type ListingRow = { id:string; companyId:string; companyName:string; category:string; title:string; description:string|null; location:string|null; pricePence:number|null; status:string; createdAt:Date; updatedAt:Date };
type InquiryRow = { id:string; listingId:string; listingTitle:string; sellerCompanyId:string; sellerCompanyName:string; fromCompanyId:string; fromCompanyName:string; message:string; status:string; createdAt:Date; updatedAt:Date };

export const marketplaceRouter = Router();
marketplaceRouter.use(requireAuth,marketplaceRoles);

marketplaceRouter.get("/listings",asyncHandler(async(_req,res)=>{
  const rows=await prisma.$queryRaw<ListingRow[]>`
    SELECT ml.id,ml."companyId",c.name AS "companyName",ml.category,ml.title,ml.description,ml.location,ml."pricePence",ml.status,ml."createdAt",ml."updatedAt"
    FROM "MarketplaceListing" ml JOIN "Company" c ON c.id=ml."companyId"
    WHERE ml.status='ACTIVE' ORDER BY ml."createdAt" DESC LIMIT 250`;
  return res.json(rows);
}));

marketplaceRouter.get("/mine",asyncHandler(async(req,res)=>{
  const rows=await prisma.$queryRaw<ListingRow[]>`
    SELECT ml.id,ml."companyId",c.name AS "companyName",ml.category,ml.title,ml.description,ml.location,ml."pricePence",ml.status,ml."createdAt",ml."updatedAt"
    FROM "MarketplaceListing" ml JOIN "Company" c ON c.id=ml."companyId"
    WHERE ml."companyId"=${req.user!.companyId} ORDER BY ml."createdAt" DESC LIMIT 250`;
  return res.json(rows);
}));

marketplaceRouter.post("/listings",asyncHandler(async(req,res)=>{
  const input=createListing.parse(req.body); const id=randomUUID();
  await prisma.$executeRaw`INSERT INTO "MarketplaceListing" (id,"companyId","createdById",category,title,description,location,"pricePence",status,"createdAt","updatedAt") VALUES (${id}::uuid,${req.user!.companyId},${req.user!.id},${input.category},${input.title},${input.description??null},${input.location??null},${input.pricePence??null},'ACTIVE',NOW(),NOW())`;
  await writeAuditEvent({companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"CREATE",entityType:"MARKETPLACE_LISTING",entityId:id,summary:`Marketplace listing created: ${input.title}`});
  return res.status(201).json({id,...input,status:"ACTIVE"});
}));

marketplaceRouter.patch("/listings/:id",asyncHandler(async(req,res)=>{
  const id=listingIdSchema.parse(req.params.id); const status=z.enum(["ACTIVE","CLOSED","ARCHIVED"]).parse(req.body?.status);
  const updated=await prisma.$queryRaw<{id:string;title:string}[]>`UPDATE "MarketplaceListing" SET status=${status},"updatedAt"=NOW() WHERE id=${id}::uuid AND "companyId"=${req.user!.companyId} RETURNING id,title`;
  if(!updated[0]) return res.status(404).json({error:"Listing not found"});
  await writeAuditEvent({companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"UPDATE",entityType:"MARKETPLACE_LISTING",entityId:id,summary:`Marketplace listing ${status.toLowerCase()}: ${updated[0].title}`});
  return res.json({id,status});
}));

marketplaceRouter.post("/listings/:id/inquiries",asyncHandler(async(req,res)=>{
  const listingId=listingIdSchema.parse(req.params.id); const input=inquirySchema.parse(req.body);
  const listing=await prisma.$queryRaw<{id:string;companyId:string;title:string}[]>`SELECT id,"companyId",title FROM "MarketplaceListing" WHERE id=${listingId}::uuid AND status='ACTIVE' LIMIT 1`;
  if(!listing[0]) return res.status(404).json({error:"Listing not found"});
  if(listing[0].companyId===req.user!.companyId) return res.status(400).json({error:"You cannot enquire on your own company listing"});
  const id=randomUUID();
  await prisma.$executeRaw`INSERT INTO "MarketplaceInquiry" (id,"listingId","fromCompanyId","fromUserId",message,status,"createdAt","updatedAt") VALUES (${id}::uuid,${listingId}::uuid,${req.user!.companyId},${req.user!.id},${input.message},'OPEN',NOW(),NOW())`;
  await writeAuditEvent({companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"CREATE",entityType:"MARKETPLACE_INQUIRY",entityId:id,summary:`Marketplace enquiry sent for: ${listing[0].title}`});
  return res.status(201).json({id,listingId,status:"OPEN"});
}));

marketplaceRouter.get("/inquiries",asyncHandler(async(req,res)=>{
  const rows=await prisma.$queryRaw<InquiryRow[]>`
    SELECT mi.id,mi."listingId",ml.title AS "listingTitle",ml."companyId" AS "sellerCompanyId",seller.name AS "sellerCompanyName",mi."fromCompanyId",buyer.name AS "fromCompanyName",mi.message,mi.status,mi."createdAt",mi."updatedAt"
    FROM "MarketplaceInquiry" mi
    JOIN "MarketplaceListing" ml ON ml.id=mi."listingId"
    JOIN "Company" seller ON seller.id=ml."companyId"
    JOIN "Company" buyer ON buyer.id=mi."fromCompanyId"
    WHERE ml."companyId"=${req.user!.companyId} OR mi."fromCompanyId"=${req.user!.companyId}
    ORDER BY mi."createdAt" DESC LIMIT 250`;
  return res.json(rows.map(r=>({...r,direction:r.sellerCompanyId===req.user!.companyId?"INCOMING":"OUTGOING"})));
}));

marketplaceRouter.patch("/inquiries/:id/close",asyncHandler(async(req,res)=>{
  const id=listingIdSchema.parse(req.params.id);
  const rows=await prisma.$queryRaw<{id:string}[]>`
    UPDATE "MarketplaceInquiry" mi SET status='CLOSED',"updatedAt"=NOW()
    FROM "MarketplaceListing" ml
    WHERE mi.id=${id}::uuid AND ml.id=mi."listingId" AND (ml."companyId"=${req.user!.companyId} OR mi."fromCompanyId"=${req.user!.companyId})
    RETURNING mi.id`;
  if(!rows[0]) return res.status(404).json({error:"Inquiry not found"});
  return res.json({id,status:"CLOSED"});
}));
