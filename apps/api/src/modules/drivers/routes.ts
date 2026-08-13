import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const createDriver = z.object({ firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80),email:z.string().email().optional(),phone:z.string().trim().max(40).optional(),depotId:z.union([z.string().uuid(),z.literal("")]).optional() });
const driverManagers = requireRoles("TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","COMPANY_ADMIN","PLATFORM_ADMIN");
export const driversRouter = Router();
driversRouter.use(requireAuth);

driversRouter.get("/", driverManagers, asyncHandler(async (req,res)=>{
  const rows = await prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT dr.*,dr."depotId"::text AS "depotId",d.name AS "depotName" FROM "Driver" dr
    LEFT JOIN "Depot" d ON d.id=dr."depotId" AND d."companyId"=dr."companyId"
    WHERE dr."companyId"=${req.user!.companyId} ORDER BY dr."lastName",dr."firstName" LIMIT 250
  `;
  res.json(rows);
}));

driversRouter.post("/", driverManagers, asyncHandler(async (req,res)=>{
  const input=createDriver.parse(req.body); const companyId=req.user!.companyId; const depotId=input.depotId||null;
  if(depotId){const depot=await prisma.$queryRaw<{id:string}[]>`SELECT id::text FROM "Depot" WHERE id=${depotId}::uuid AND "companyId"=${companyId} AND "isActive"=true LIMIT 1`;if(!depot.length)return res.status(400).json({error:"Depot is not active in the selected company"});}
  const driver=await prisma.$transaction(async tx=>{const created=await tx.driver.create({data:{companyId,firstName:input.firstName,lastName:input.lastName,email:input.email||null,phone:input.phone||null,isActive:true}});if(depotId)await tx.$executeRaw`UPDATE "Driver" SET "depotId"=${depotId}::uuid WHERE id=${created.id} AND "companyId"=${companyId}`;return created;});
  res.status(201).json({...driver,depotId});
}));

driversRouter.delete("/:id", requireRoles("TRANSPORT_MANAGER","COMPANY_ADMIN","PLATFORM_ADMIN"), asyncHandler(async (req,res)=>{const driver=await prisma.driver.findFirst({where:{id:req.params.id,companyId:req.user!.companyId},select:{id:true}});if(!driver)return res.status(404).json({error:"Driver not found"});await prisma.driver.update({where:{id:driver.id},data:{isActive:false,leftDate:new Date()}});res.status(204).end();}));
