import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { requireRoles } from "../../middleware/auth.js";

export const fieldServiceRouter = Router();
const office = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const writers = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

const moneyLine = z.object({ description:z.string().trim().min(1).max(500), quantity:z.number().positive().max(100000), unitPricePence:z.number().int().min(0).max(2_000_000_000), vatRate:z.number().min(0).max(100).default(20) });
const quoteInput = z.object({ customerId:z.string().uuid(), siteId:z.string().uuid().optional(), jobId:z.string().optional(), title:z.string().trim().min(2).max(200), description:z.string().trim().max(4000).optional(), validUntil:z.coerce.date().optional(), lines:z.array(moneyLine).min(1).max(100) });
const recurringInput = z.object({ customerId:z.string().uuid(), siteId:z.string().uuid().optional(), assetId:z.string().uuid().optional(), jobTypeId:z.string().uuid().optional(), title:z.string().trim().min(2).max(200), description:z.string().trim().max(4000).optional(), frequency:z.enum(["WEEKLY","FORTNIGHTLY","MONTHLY","QUARTERLY","SIX_MONTHLY","YEARLY","CUSTOM"]), intervalValue:z.number().int().min(1).max(365).default(1), nextDueAt:z.coerce.date(), defaultPersonIds:z.array(z.string()).max(30).default([]), defaultVehicleId:z.string().optional(), estimatedDurationMinutes:z.number().int().min(5).max(43200).optional() });
const quoteConversionInput = z.object({
  jobTypeId:z.string().uuid().optional(), scheduledStart:z.coerce.date().optional(), scheduledEnd:z.coerce.date().optional(), dueAt:z.coerce.date().optional(),
  personIds:z.array(z.string().trim().min(1)).max(30).default([]), vehicleId:z.string().trim().min(1).optional(), estimatedDurationMinutes:z.number().int().min(5).max(43200).optional(),
  purchaseOrderNumber:z.string().trim().max(100).optional(),
}).superRefine((input,ctx)=>{if(input.scheduledStart&&input.scheduledEnd&&input.scheduledEnd<input.scheduledStart)ctx.addIssue({code:z.ZodIssueCode.custom,path:["scheduledEnd"],message:"End time cannot be before start time"});});
const invoiceInput = z.object({ jobId:z.string(), customerId:z.string().uuid().optional(), dueDate:z.coerce.date().optional(), notes:z.string().trim().max(3000).optional() });
const contactInput = z.object({ customerId:z.string().uuid(), siteId:z.string().uuid().optional(), name:z.string().trim().min(2).max(160), role:z.string().trim().max(100).optional(), email:z.string().trim().email().max(240).optional(), phone:z.string().trim().max(80).optional(), isPrimary:z.boolean().default(false), notes:z.string().trim().max(1000).optional() });

function totals(lines:Array<{quantity:number;unitPricePence:number;vatRate:number}>){let subtotal=0,vat=0;for(const line of lines){const net=Math.round(line.quantity*line.unitPricePence);subtotal+=net;vat+=Math.round(net*line.vatRate/100);}return {subtotal,vat,total:subtotal+vat};}

fieldServiceRouter.get("/overview", office, asyncHandler(async (req,res)=>{
  const companyId=req.user!.companyId;
  const rows=await prisma.$queryRaw<Array<Record<string,bigint>>>`
    SELECT
      (SELECT count(*) FROM "Customer" WHERE "companyId"=${companyId} AND "isActive"=true) AS customers,
      (SELECT count(*) FROM "CustomerSite" WHERE "companyId"=${companyId} AND "isActive"=true) AS sites,
      (SELECT count(*) FROM "SiteAsset" WHERE "companyId"=${companyId} AND "isActive"=true) AS assets,
      (SELECT count(*) FROM "Quote" WHERE "companyId"=${companyId} AND status IN ('DRAFT','SENT','VIEWED')) AS "openQuotes",
      (SELECT count(*) FROM "RecurringJob" WHERE "companyId"=${companyId} AND "isActive"=true) AS recurring,
      (SELECT count(*) FROM "Invoice" WHERE "companyId"=${companyId} AND status IN ('ISSUED','PART_PAID','OVERDUE')) AS "unpaidInvoices"
  `;
  const row=rows[0]??{};res.json(Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)])));
}));

fieldServiceRouter.get("/customers", office, asyncHandler(async (req,res)=>{
  const companyId=req.user!.companyId;
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT c.id,c.name,c."accountReference",c.email,c.phone,c.notes,c."isActive",
      count(DISTINCT s.id)::int AS "siteCount",count(DISTINCT a.id)::int AS "assetCount",count(DISTINCT j.id)::int AS "jobCount",
      max(j."createdAt") AS "lastJobAt"
    FROM "Customer" c
    LEFT JOIN "CustomerSite" s ON s."companyId"=c."companyId" AND s."customerId"=c.id
    LEFT JOIN "SiteAsset" a ON a."companyId"=c."companyId" AND a."siteId"=s.id
    LEFT JOIN "Job" j ON j."companyId"=c."companyId" AND j."customerId"=c.id
    WHERE c."companyId"=${companyId}
    GROUP BY c.id ORDER BY c."isActive" DESC,c.name
  `;res.json(rows);
}));

fieldServiceRouter.get("/customers/:id", office, asyncHandler(async (req,res)=>{
  const companyId=req.user!.companyId,id=req.params.id;
  const customer=(await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT * FROM "Customer" WHERE "companyId"=${companyId} AND id=${id}::uuid LIMIT 1`)[0];
  if(!customer)return res.status(404).json({error:"Customer not found"});
  const [sites,contacts,jobs,quotes,invoices]=await Promise.all([
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT s.*,COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'assetType',a."assetType",'assetReference',a."assetReference",'manufacturer',a.manufacturer,'model',a.model,'serialNumber',a."serialNumber",'location',a.location)) FILTER (WHERE a.id IS NOT NULL),'[]'::jsonb) AS assets FROM "CustomerSite" s LEFT JOIN "SiteAsset" a ON a."companyId"=s."companyId" AND a."siteId"=s.id WHERE s."companyId"=${companyId} AND s."customerId"=${id}::uuid GROUP BY s.id ORDER BY s.name`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT * FROM "CustomerContact" WHERE "companyId"=${companyId} AND "customerId"=${id}::uuid AND "isActive"=true ORDER BY "isPrimary" DESC,name`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT id,"jobNumber" AS reference,title,status,"scheduledStart","completedAt","siteId" FROM "Job" WHERE "companyId"=${companyId} AND "customerId"=${id}::uuid ORDER BY "createdAt" DESC LIMIT 100`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT id,reference,title,status,"totalPence","validUntil","createdAt" FROM "Quote" WHERE "companyId"=${companyId} AND "customerId"=${id}::uuid ORDER BY "createdAt" DESC`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT id,reference,status,"totalPence","paidPence","issueDate","dueDate" FROM "Invoice" WHERE "companyId"=${companyId} AND "customerId"=${id}::uuid ORDER BY "issueDate" DESC`
  ]);res.json({customer,sites,contacts,jobs,quotes,invoices});
}));

fieldServiceRouter.post("/contacts", writers, asyncHandler(async (req,res)=>{
  const input=contactInput.parse(req.body),companyId=req.user!.companyId;
  if(input.isPrimary)await prisma.$executeRaw`UPDATE "CustomerContact" SET "isPrimary"=false WHERE "companyId"=${companyId} AND "customerId"=${input.customerId}::uuid`;
  const row=(await prisma.$queryRaw<Array<Record<string,unknown>>>`INSERT INTO "CustomerContact" ("companyId","customerId","siteId",name,role,email,phone,"isPrimary",notes) VALUES (${companyId},${input.customerId}::uuid,${input.siteId??null}::uuid,${input.name},${input.role??null},${input.email??null},${input.phone??null},${input.isPrimary},${input.notes??null}) RETURNING *`)[0];res.status(201).json(row);
}));

fieldServiceRouter.get("/quotes", office, asyncHandler(async (req,res)=>{
  const companyId=req.user!.companyId;const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT q.*,c.name AS "customerName",s.name AS "siteName" FROM "Quote" q JOIN "Customer" c ON c.id=q."customerId" LEFT JOIN "CustomerSite" s ON s.id=q."siteId" WHERE q."companyId"=${companyId} ORDER BY q."createdAt" DESC`;res.json(rows);
}));

fieldServiceRouter.post("/quotes", writers, asyncHandler(async (req,res)=>{
  const input=quoteInput.parse(req.body),companyId=req.user!.companyId,userId=req.user!.id,t=totals(input.lines);const ref=`Q-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const quote=await prisma.$transaction(async tx=>{const q=(await tx.$queryRaw<Array<{id:string}>>`INSERT INTO "Quote" ("companyId","customerId","siteId","jobId",reference,title,description,"validUntil","subtotalPence","vatPence","totalPence","createdById") VALUES (${companyId},${input.customerId}::uuid,${input.siteId??null}::uuid,${input.jobId??null},${ref},${input.title},${input.description??null},${input.validUntil??null},${t.subtotal},${t.vat},${t.total},${userId}) RETURNING id`)[0];for(let i=0;i<input.lines.length;i++){const l=input.lines[i];await tx.$executeRaw`INSERT INTO "QuoteLine" ("companyId","quoteId",description,quantity,"unitPricePence","vatRate","sortOrder") VALUES (${companyId},${q.id}::uuid,${l.description},${l.quantity},${l.unitPricePence},${l.vatRate},${i})`;}return q;});res.status(201).json({id:quote.id,reference:ref,...t});
}));

fieldServiceRouter.patch("/quotes/:id/status", writers, asyncHandler(async (req,res)=>{
  const status=z.enum(["DRAFT","SENT","VIEWED","ACCEPTED","DECLINED","EXPIRED","CANCELLED"]).parse(req.body?.status),companyId=req.user!.companyId,id=req.params.id;
  const count=await prisma.$executeRaw`UPDATE "Quote" SET status=${status},"acceptedAt"=CASE WHEN ${status}='ACCEPTED' THEN now() ELSE "acceptedAt" END,"acceptedBy"=CASE WHEN ${status}='ACCEPTED' THEN ${req.body?.acceptedBy??null} ELSE "acceptedBy" END,"updatedAt"=now() WHERE "companyId"=${companyId} AND id=${id}::uuid`;if(!count)return res.status(404).json({error:"Quote not found"});res.json({ok:true,status});
}));

fieldServiceRouter.post("/quotes/:id/convert-to-job", writers, asyncHandler(async (req,res)=>{
  const input=quoteConversionInput.parse(req.body??{}),companyId=req.user!.companyId,userId=req.user!.id,quoteId=req.params.id;
  const result=await prisma.$transaction(async tx=>{
    const quote=(await tx.$queryRaw<Array<{id:string;jobId:string|null;status:string;title:string;description:string|null;totalPence:number;customerId:string;siteId:string|null;customerName:string;siteName:string|null;siteAddress:string|null;sitePostcode:string|null;contactName:string|null;contactPhone:string|null;contactEmail:string|null}>>`
      SELECT q.id::text,q."jobId",q.status,q.title,q.description,q."totalPence",q."customerId"::text AS "customerId",q."siteId"::text AS "siteId",
        c.name AS "customerName",s.name AS "siteName",s.address AS "siteAddress",s.postcode AS "sitePostcode",s."contactName",s."contactPhone",s."contactEmail"
      FROM "Quote" q JOIN "Customer" c ON c.id=q."customerId" AND c."companyId"=q."companyId"
      LEFT JOIN "CustomerSite" s ON s.id=q."siteId" AND s."companyId"=q."companyId"
      WHERE q.id=${quoteId}::uuid AND q."companyId"=${companyId} FOR UPDATE OF q
    `)[0];
    if(!quote) return {error:"Quote not found",status:404} as const;
    if(quote.jobId){const existing=(await tx.$queryRaw<Array<{id:string;reference:string|null;status:string}>>`SELECT id,"jobNumber" AS reference,status::text FROM "Job" WHERE id=${quote.jobId} AND "companyId"=${companyId}`)[0];return {existing:true,job:existing??{id:quote.jobId,reference:null,status:"PLANNED"}} as const;}
    if(quote.status!=="ACCEPTED") return {error:"Accept the quote before creating a job",status:409} as const;
    const type=(await tx.$queryRaw<Array<{id:string;name:string;defaultPriority:string;defaultDurationMinutes:number;workflow:unknown;formSchema:unknown}>>`
      SELECT id::text,name,"defaultPriority","defaultDurationMinutes",workflow,"formSchema" FROM "JobType"
      WHERE "companyId"=${companyId} AND "isActive"=true AND (${input.jobTypeId??null}::uuid IS NULL OR id=${input.jobTypeId??null}::uuid)
      ORDER BY (id=${input.jobTypeId??null}::uuid) DESC,"isSystem" DESC,name LIMIT 1
    `)[0];
    if(!type)return {error:"Add an active job type before converting this quote",status:400} as const;
    const people=input.personIds.length?await tx.$queryRaw<Array<{id:string;email:string|null}>>`SELECT id,email FROM "Person" WHERE "companyId"=${companyId} AND id IN (${Prisma.join(input.personIds)}) AND "isActive"=true`:[];
    if(people.length!==new Set(input.personIds).size)return {error:"One or more assigned staff are not active in this company",status:400} as const;
    if(input.vehicleId&&!(await tx.vehicle.findFirst({where:{id:input.vehicleId,companyId,status:{not:"ARCHIVED"}},select:{id:true}})))return {error:"Vehicle is not active in this company",status:400} as const;
    let driverId:string|null=null;for(const person of people){if(!driverId&&person.email){driverId=(await tx.driver.findFirst({where:{companyId,email:{equals:person.email,mode:"insensitive"},isActive:true},select:{id:true}}))?.id??null;}}
    const jobId=randomUUID(),reference=`JOB-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${jobId.slice(0,4).toUpperCase()}`,status=input.scheduledStart?"SCHEDULED":people.length?"ASSIGNED":"PLANNED";
    const duration=input.estimatedDurationMinutes??type.defaultDurationMinutes;
    await tx.$executeRaw`INSERT INTO "Job" (id,"companyId","jobTypeId","jobNumber",title,description,priority,source,"customerId","siteId","customerName","collectionAddress","collectionPostcode","scheduledStart","scheduledEnd","dueAt","collectionDateTime","deliveryDateTime","estimatedDurationMinutes","contactName","contactPhone","contactEmail","purchaseOrderNumber","quotePence","customFields","workflowSnapshot","worksheetSchema","worksheetResponses","riskAssessment","customerSignature","vehicleId","driverId",instructions,status,"createdAt","updatedAt") VALUES (${jobId},${companyId},${type.id}::uuid,${reference},${quote.title},${quote.description},${type.defaultPriority},'CUSTOMER',${quote.customerId}::uuid,${quote.siteId}::uuid,${quote.customerName},${quote.siteAddress},${quote.sitePostcode},${input.scheduledStart??null},${input.scheduledEnd??null},${input.dueAt??input.scheduledStart??null},${input.scheduledStart??null},${input.scheduledEnd??null},${duration},${quote.contactName},${quote.contactPhone},${quote.contactEmail},${input.purchaseOrderNumber??null},${quote.totalPence},${JSON.stringify({quoteId})}::jsonb,${JSON.stringify(type.workflow)}::jsonb,${JSON.stringify(type.formSchema)}::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,${input.vehicleId??null},${driverId},${quote.description},${status}::"JobStatus",NOW(),NOW())`;
    await tx.$executeRaw`INSERT INTO "JobVisit" (id,"companyId","jobId",sequence,title,status,"scheduledStart","scheduledEnd","createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},1,'Initial visit',${status},${input.scheduledStart??null},${input.scheduledEnd??null},NOW(),NOW())`;
    for(const person of people)await tx.$executeRaw`INSERT INTO "JobAssignment" (id,"companyId","jobId","personId",role,status,"assignedAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},${person.id},'ASSIGNEE','ASSIGNED',NOW())`;
    await tx.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},'CREATED','Job created from accepted quote',${quote.description},${JSON.stringify({quoteId,quoteReference:quoteId})}::jsonb,${userId},NOW())`;
    await tx.$executeRaw`UPDATE "Quote" SET "jobId"=${jobId},"updatedAt"=NOW() WHERE id=${quoteId}::uuid AND "companyId"=${companyId}`;
    return {existing:false,job:{id:jobId,reference,status}} as const;
  });
  if("error" in result&&result.error)return res.status(result.status??400).json({error:result.error});
  if(!result.existing)await writeAuditEvent({companyId,actorUserId:userId,actorEmail:req.user!.email,action:"CREATE",entityType:"JOB",entityId:result.job.id,summary:`Created ${result.job.reference} from accepted quote`,metadata:{quoteId}});
  res.status(result.existing?200:201).json({...result.job,existing:result.existing});
}));

fieldServiceRouter.get("/recurring", office, asyncHandler(async (req,res)=>{const companyId=req.user!.companyId;const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT r.*,c.name AS "customerName",s.name AS "siteName",a.name AS "assetName",jt.name AS "jobTypeName" FROM "RecurringJob" r JOIN "Customer" c ON c.id=r."customerId" LEFT JOIN "CustomerSite" s ON s.id=r."siteId" LEFT JOIN "SiteAsset" a ON a.id=r."assetId" LEFT JOIN "JobType" jt ON jt.id=r."jobTypeId" WHERE r."companyId"=${companyId} ORDER BY r."isActive" DESC,r."nextDueAt"`;res.json(rows);}));
fieldServiceRouter.post("/recurring", writers, asyncHandler(async (req,res)=>{const i=recurringInput.parse(req.body),c=req.user!.companyId,u=req.user!.id;const row=(await prisma.$queryRaw<Array<Record<string,unknown>>>`INSERT INTO "RecurringJob" ("companyId","customerId","siteId","assetId","jobTypeId",title,description,frequency,"intervalValue","nextDueAt","defaultPersonIds","defaultVehicleId","estimatedDurationMinutes","createdById") VALUES (${c},${i.customerId}::uuid,${i.siteId??null}::uuid,${i.assetId??null}::uuid,${i.jobTypeId??null}::uuid,${i.title},${i.description??null},${i.frequency},${i.intervalValue},${i.nextDueAt},${JSON.stringify(i.defaultPersonIds)}::jsonb,${i.defaultVehicleId??null},${i.estimatedDurationMinutes??null},${u}) RETURNING *`)[0];res.status(201).json(row);}));
fieldServiceRouter.post("/recurring/generate-due", writers, asyncHandler(async(req,res)=>{const companyId=req.user!.companyId;const rows=await prisma.$queryRaw<Array<{recurringJobId:string;jobId:string;dueAt:Date}>>`SELECT * FROM fleet_private.generate_due_recurring_jobs(NOW(),${companyId})`;await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"GENERATE",entityType:"RECURRING_JOB",summary:`Generated ${rows.length} due recurring job${rows.length===1?"":"s"}`});res.json({ok:true,generated:rows.length,jobs:rows});}));
fieldServiceRouter.patch("/recurring/:id", writers, asyncHandler(async(req,res)=>{const input=z.object({isActive:z.boolean()}).parse(req.body),companyId=req.user!.companyId;const count=await prisma.$executeRaw`UPDATE "RecurringJob" SET "isActive"=${input.isActive},"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Recurring job not found"});res.json({ok:true,isActive:input.isActive});}));

fieldServiceRouter.get("/invoices", office, asyncHandler(async (req,res)=>{const companyId=req.user!.companyId;const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT i.*,c.name AS "customerName",j."jobNumber" AS "jobReference" FROM "Invoice" i JOIN "Customer" c ON c.id=i."customerId" LEFT JOIN "Job" j ON j.id=i."jobId" WHERE i."companyId"=${companyId} ORDER BY i."issueDate" DESC,i."createdAt" DESC`;res.json(rows);}));
fieldServiceRouter.post("/invoices/from-job", writers, asyncHandler(async (req,res)=>{const i=invoiceInput.parse(req.body),c=req.user!.companyId,u=req.user!.id;const job=(await prisma.$queryRaw<Array<{customerId:string;officeApprovedAt:Date|null;invoiceId:string|null}>>`SELECT j."customerId"::text AS "customerId",j."officeApprovedAt",inv.id::text AS "invoiceId" FROM "Job" j LEFT JOIN "Invoice" inv ON inv."companyId"=j."companyId" AND inv."jobId"=j.id WHERE j."companyId"=${c} AND j.id=${i.jobId} LIMIT 1`)[0];if(!job)return res.status(404).json({error:"Job not found"});if(!job.officeApprovedAt)return res.status(409).json({error:"Approve the field report before creating an invoice"});if(job.invoiceId)return res.status(409).json({error:"This job already has an invoice"});const lines=await prisma.$queryRaw<Array<{description:string;quantity:number;unitSellPence:number}>>`SELECT description,quantity::float8 AS quantity,"unitSellPence" FROM "JobCostLine" WHERE "companyId"=${c} AND "jobId"=${i.jobId} AND "unitSellPence">0 ORDER BY "createdAt"`;if(!lines.length)return res.status(400).json({error:"Add billable labour or materials to the job before creating an invoice"});const mapped=lines.map(l=>({description:l.description,quantity:Number(l.quantity),unitPricePence:l.unitSellPence,vatRate:20}));const t=totals(mapped),ref=`INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;const invoice=await prisma.$transaction(async tx=>{const inv=(await tx.$queryRaw<Array<{id:string}>>`INSERT INTO "Invoice" ("companyId","customerId","jobId",reference,"dueDate","subtotalPence","vatPence","totalPence",notes,"createdById") VALUES (${c},${job.customerId}::uuid,${i.jobId},${ref},${i.dueDate??null},${t.subtotal},${t.vat},${t.total},${i.notes??null},${u}) RETURNING id`)[0];for(let x=0;x<mapped.length;x++){const l=mapped[x];await tx.$executeRaw`INSERT INTO "InvoiceLine" ("companyId","invoiceId",description,quantity,"unitPricePence","vatRate","sortOrder") VALUES (${c},${inv.id}::uuid,${l.description},${l.quantity},${l.unitPricePence},${l.vatRate},${x})`;}return inv;});res.status(201).json({id:invoice.id,reference:ref,...t});}));

