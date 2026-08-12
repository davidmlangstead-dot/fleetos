import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const readers = requireRoles("WORKSHOP_TECHNICIAN","TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","FINANCE","COMPANY_ADMIN","PLATFORM_ADMIN");
const writers = requireRoles("WORKSHOP_TECHNICIAN","TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","COMPANY_ADMIN","PLATFORM_ADMIN");
const schema = z.object({
  name: z.string().trim().min(1).max(240),
  storagePath: z.string().trim().min(1).max(600),
  type: z.enum(["VEHICLE_DOCUMENT","DRIVER_DOCUMENT","POD","INVOICE","CERTIFICATE","SERVICE_RECORD","OTHER"]).default("OTHER"),
  fileSize: z.number().int().min(0).max(20 * 1024 * 1024).optional(),
  mimeType: z.string().trim().max(120).optional(),
  vehicleId: z.string().trim().optional(),
  driverId: z.string().trim().optional(),
  jobId: z.string().trim().optional(),
  defectId: z.string().trim().optional(),
  complianceId: z.string().trim().optional(),
});

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get("/", readers, asyncHandler(async (req,res)=>{
  const docs = await prisma.document.findMany({
    where:{companyId:req.user!.companyId},
    select:{id:true,name:true,type:true,fileUrl:true,fileSize:true,mimeType:true,vehicleId:true,driverId:true,jobId:true,defectId:true,complianceId:true,createdAt:true,updatedAt:true},
    orderBy:{createdAt:"desc"},take:250,
  });
  return res.json(docs.map(d=>({...d,storagePath:d.fileUrl})));
}));

async function belongsToCompany(companyId:string, input:z.infer<typeof schema>) {
  const checks: Promise<unknown>[] = [];
  if(input.vehicleId) checks.push(prisma.vehicle.findFirst({where:{id:input.vehicleId,companyId},select:{id:true}}));
  if(input.driverId) checks.push(prisma.driver.findFirst({where:{id:input.driverId,companyId},select:{id:true}}));
  if(input.jobId) checks.push(prisma.job.findFirst({where:{id:input.jobId,companyId},select:{id:true}}));
  if(input.defectId) checks.push(prisma.defect.findFirst({where:{id:input.defectId,companyId},select:{id:true}}));
  if(input.complianceId) checks.push(prisma.complianceItem.findFirst({where:{id:input.complianceId,companyId},select:{id:true}}));
  const results = await Promise.all(checks);
  return results.every(Boolean);
}

documentsRouter.post("/", writers, asyncHandler(async (req,res)=>{
  const input = schema.parse(req.body);
  if(!input.storagePath.startsWith(`${req.user!.companyId}/`)) return res.status(400).json({error:"Document path does not belong to the selected company"});
  if(!(await belongsToCompany(req.user!.companyId,input))) return res.status(400).json({error:"Linked FleetOS record does not belong to the selected company"});
  const doc = await prisma.document.create({data:{
    companyId:req.user!.companyId,name:input.name,fileUrl:input.storagePath,type:input.type,
    fileSize:input.fileSize,mimeType:input.mimeType,uploadedById:req.user!.id,
    vehicleId:input.vehicleId||null,driverId:input.driverId||null,jobId:input.jobId||null,defectId:input.defectId||null,complianceId:input.complianceId||null,
  }});
  await writeAuditEvent({companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"CREATE",entityType:"DOCUMENT",entityId:doc.id,summary:`Document added: ${doc.name}`,metadata:{type:doc.type}});
  return res.status(201).json({...doc,storagePath:doc.fileUrl});
}));

documentsRouter.delete("/:id", writers, asyncHandler(async (req,res)=>{
  const doc = await prisma.document.findFirst({where:{id:req.params.id,companyId:req.user!.companyId}});
  if(!doc) return res.status(404).json({error:"Document not found"});
  await prisma.document.delete({where:{id:doc.id}});
  await writeAuditEvent({companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"DELETE",entityType:"DOCUMENT",entityId:doc.id,summary:`Document removed: ${doc.name}`});
  return res.json({ok:true,storagePath:doc.fileUrl});
}));
