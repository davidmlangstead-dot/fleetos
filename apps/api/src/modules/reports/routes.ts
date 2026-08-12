import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const reportRoles = requireRoles("TRANSPORT_PLANNER","TRANSPORT_MANAGER","OFFICE_STAFF","FINANCE","COMPANY_ADMIN","PLATFORM_ADMIN");
const spendModules = ["COST","FUEL","TYRE","EQUIPMENT","PCN","INSURANCE_CLAIM","SERVICE_HISTORY","PARTS_STOCK"];

export const reportsRouter = Router();
reportsRouter.use(requireAuth, reportRoles);

reportsRouter.get("/summary", asyncHandler(async (req,res)=>{
  const companyId = req.user!.companyId;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const [vehicles,activeDrivers,jobsByStatus,openDefects,overdueCompliance,documents,registers,monthSpend] = await Promise.all([
    prisma.vehicle.groupBy({by:["status"],where:{companyId},_count:{_all:true}}),
    prisma.driver.count({where:{companyId,isActive:true}}),
    prisma.job.groupBy({by:["status"],where:{companyId},_count:{_all:true}}),
    prisma.defect.count({where:{companyId,status:{not:"RESOLVED"}}}),
    prisma.complianceItem.count({where:{companyId,completedDate:null,dueDate:{lt:now}}}),
    prisma.document.count({where:{companyId}}),
    prisma.registerItem.groupBy({by:["module"],where:{companyId,archivedAt:null},_count:{_all:true}}),
    prisma.registerItem.aggregate({where:{companyId,archivedAt:null,module:{in:spendModules},createdAt:{gte:monthStart}},_sum:{amountPence:true}}),
  ]);
  const totalVehicles = vehicles.reduce((sum,row)=>sum+row._count._all,0);
  const activeVehicles = vehicles.find(row=>row.status==="ACTIVE")?._count._all ?? 0;
  const offRoadVehicles = vehicles.find(row=>row.status==="OFF_ROAD")?._count._all ?? 0;
  return res.json({
    generatedAt:now.toISOString(),
    fleet:{total:totalVehicles,active:activeVehicles,offRoad:offRoadVehicles},
    people:{activeDrivers},
    jobs:Object.fromEntries(jobsByStatus.map(row=>[row.status,row._count._all])),
    exceptions:{openDefects,overdueCompliance},
    documents,
    registers:Object.fromEntries(registers.map(row=>[row.module,row._count._all])),
    spend:{monthPence:monthSpend._sum.amountPence ?? 0},
  });
}));
