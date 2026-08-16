import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireIdentity, requirePlatformOwner, requireRoles } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const commercialRouter = Router();
commercialRouter.use(requireIdentity);

const viewers = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"] as const;
const patchSchema = z.object({
  betaEnabled: z.boolean().optional(),
  subscriptionPlan: z.enum(["EARLY_ACCESS", "STARTER", "GROWTH", "ENTERPRISE"]).optional(),
  subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  trialEndsAt: z.union([z.string().datetime(), z.null()]).optional(),
  vehicleLimit: z.number().int().min(1).max(100000).optional(),
  commitmentMonths: z.union([z.literal(12),z.literal(24),z.literal(36)]).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  resellerId: z.union([z.string().min(1),z.null()]).optional(),
  wholesaleMonthlyPence: z.number().int().min(0).nullable().optional(),
  retailMonthlyPence: z.number().int().min(0).nullable().optional(),
});

type PatchInput=z.infer<typeof patchSchema>;
type ControlRow = {
  companyId: string; subscriptionPlan: string; subscriptionStatus: string; betaEnabled: boolean;
  trialStartedAt: Date | null; trialEndsAt: Date | null; vehicleLimit: number; featureFlags: Record<string, boolean>;
  commitmentMonths: number; commitmentStartedAt: Date | null; commitmentEndsAt: Date | null;
  resellerId: string | null; wholesaleMonthlyPence: number | null; retailMonthlyPence: number | null;
};

function payload(row: ControlRow, vehicles = 0) {
  const now = Date.now();
  const ends = row.trialEndsAt?.getTime() ?? null;
  const remainingMs = ends === null ? null : Math.max(0, ends - now);
  const trialExpired = row.subscriptionStatus === "TRIAL" && ends !== null && ends < now;
  const readOnly = row.subscriptionStatus !== "ACTIVE" && !((row.subscriptionStatus === "TRIAL") && !trialExpired);
  return {
    companyId: row.companyId,
    subscriptionPlan: row.subscriptionPlan,
    subscriptionStatus: row.subscriptionStatus,
    betaEnabled: row.betaEnabled,
    trialStartedAt: row.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    trialExpired,
    trialDaysRemaining: remainingMs === null ? null : Math.ceil(remainingMs / 86_400_000),
    readOnly,
    vehicleLimit: row.vehicleLimit,
    vehicleUsage: vehicles,
    vehiclesAvailable: Math.max(0, row.vehicleLimit - vehicles),
    vehicleLimitReached: vehicles >= row.vehicleLimit,
    commitmentMonths: row.commitmentMonths,
    commitmentStartedAt: row.commitmentStartedAt?.toISOString() ?? null,
    commitmentEndsAt: row.commitmentEndsAt?.toISOString() ?? null,
    resellerId: row.resellerId,
    wholesaleMonthlyPence: row.wholesaleMonthlyPence,
    retailMonthlyPence: row.retailMonthlyPence,
    featureFlags: row.featureFlags ?? {},
  };
}

async function getControl(companyId: string) {
  const rows = await prisma.$queryRaw<ControlRow[]>`
    SELECT "companyId","subscriptionPlan","subscriptionStatus","betaEnabled","trialStartedAt","trialEndsAt","vehicleLimit","featureFlags",
      "commitmentMonths","commitmentStartedAt","commitmentEndsAt","resellerId","wholesaleMonthlyPence","retailMonthlyPence"
    FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
  `;
  return rows[0];
}

async function updateControl(companyId:string,input:PatchInput,actor:{id:string;email:string}){
  const current=await getControl(companyId);
  if(!current)return null;
  if(input.resellerId){const reseller=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "Reseller" WHERE id=${input.resellerId} LIMIT 1`;if(!reseller[0])throw Object.assign(new Error("Reseller not found"),{status:400});}
  const betaEnabled=input.betaEnabled??current.betaEnabled;
  const subscriptionPlan=input.subscriptionPlan??current.subscriptionPlan;
  const subscriptionStatus=input.subscriptionStatus??current.subscriptionStatus;
  const featureFlags=input.featureFlags??current.featureFlags??{};
  const vehicleLimit=input.vehicleLimit??current.vehicleLimit;
  const commitmentMonths=input.commitmentMonths??current.commitmentMonths??12;
  const startingTrial=subscriptionStatus==="TRIAL"&&current.subscriptionStatus!=="TRIAL";
  const trialStartedAt=startingTrial?new Date():current.trialStartedAt;
  const defaultTrialEnd=startingTrial?new Date(Date.now()+90*86_400_000):current.trialEndsAt;
  const trialEndsAt=input.trialEndsAt===undefined?defaultTrialEnd:input.trialEndsAt===null?null:new Date(input.trialEndsAt);
  const activatingPaid=subscriptionStatus==="ACTIVE"&&current.subscriptionStatus!=="ACTIVE"&&!current.commitmentStartedAt;
  const commitmentStartedAt=activatingPaid?new Date():current.commitmentStartedAt;
  let commitmentEndsAt=current.commitmentEndsAt;
  if(activatingPaid&&commitmentStartedAt){commitmentEndsAt=new Date(commitmentStartedAt);commitmentEndsAt.setUTCMonth(commitmentEndsAt.getUTCMonth()+commitmentMonths);}
  const resellerId=input.resellerId===undefined?current.resellerId:input.resellerId;
  const wholesale=input.wholesaleMonthlyPence===undefined?current.wholesaleMonthlyPence:input.wholesaleMonthlyPence;
  const retail=input.retailMonthlyPence===undefined?current.retailMonthlyPence:input.retailMonthlyPence;
  const rows=await prisma.$queryRaw<ControlRow[]>`
    UPDATE "CompanyControl" SET
      "betaEnabled"=${betaEnabled},"subscriptionPlan"=${subscriptionPlan},"subscriptionStatus"=${subscriptionStatus},
      "trialStartedAt"=${trialStartedAt},"trialEndsAt"=${trialEndsAt},"vehicleLimit"=${vehicleLimit},
      "commitmentMonths"=${commitmentMonths},"commitmentStartedAt"=${commitmentStartedAt},"commitmentEndsAt"=${commitmentEndsAt},
      "featureFlags"=${JSON.stringify(featureFlags)}::jsonb,"resellerId"=${resellerId},
      "wholesaleMonthlyPence"=${wholesale},"retailMonthlyPence"=${retail},"updatedAt"=NOW()
    WHERE "companyId"=${companyId}
    RETURNING "companyId","subscriptionPlan","subscriptionStatus","betaEnabled","trialStartedAt","trialEndsAt","vehicleLimit","featureFlags",
      "commitmentMonths","commitmentStartedAt","commitmentEndsAt","resellerId","wholesaleMonthlyPence","retailMonthlyPence"
  `;
  const vehicles=await prisma.vehicle.count({where:{companyId}});
  await writeAuditEvent({companyId,actorUserId:actor.id,actorEmail:actor.email,action:"UPDATE",entityType:"COMMERCIAL_CONTROL",entityId:companyId,summary:`Manager updated commercial controls to ${subscriptionStatus}; vehicle limit ${vehicleLimit}; reseller ${resellerId??"direct"}`});
  return payload(rows[0],vehicles);
}

commercialRouter.get("/portfolio", requirePlatformOwner, asyncHandler(async (_req, res) => {
  const rows = await prisma.$queryRaw<Array<ControlRow & { companyName: string; slug: string; members: bigint; vehicles: bigint }>>`
    SELECT cc."companyId",c.name AS "companyName",c.slug,cc."subscriptionPlan",cc."subscriptionStatus",cc."betaEnabled",
      cc."trialStartedAt",cc."trialEndsAt",cc."vehicleLimit",cc."featureFlags",cc."commitmentMonths",cc."commitmentStartedAt",cc."commitmentEndsAt",
      cc."resellerId",cc."wholesaleMonthlyPence",cc."retailMonthlyPence",COUNT(DISTINCT cm.id)::bigint AS members,COUNT(DISTINCT v.id)::bigint AS vehicles
    FROM "CompanyControl" cc JOIN "Company" c ON c.id=cc."companyId"
    LEFT JOIN "CompanyMembership" cm ON cm."companyId"=c.id LEFT JOIN "Vehicle" v ON v."companyId"=c.id
    GROUP BY cc."companyId",c.name,c.slug,c."createdAt",cc."subscriptionPlan",cc."subscriptionStatus",cc."betaEnabled",cc."trialStartedAt",cc."trialEndsAt",cc."vehicleLimit",cc."featureFlags",
      cc."commitmentMonths",cc."commitmentStartedAt",cc."commitmentEndsAt",cc."resellerId",cc."wholesaleMonthlyPence",cc."retailMonthlyPence"
    ORDER BY c."createdAt" DESC
  `;
  res.json(rows.map(row=>({...payload(row,Number(row.vehicles)),companyName:row.companyName,slug:row.slug,members:Number(row.members)})));
}));

commercialRouter.patch("/portfolio/:companyId",requirePlatformOwner,asyncHandler(async(req,res)=>{
  const input=patchSchema.parse(req.body);const result=await updateControl(req.params.companyId,input,{id:res.locals.identity.id,email:res.locals.identity.email});
  if(!result)return res.status(404).json({error:"Company controls not found."});res.json(result);
}));

commercialRouter.get("/", requireAuth, requireRoles(...viewers), asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const [row, vehicles] = await Promise.all([getControl(companyId), prisma.vehicle.count({ where: { companyId } })]);
  if (!row) return res.status(404).json({ error: "Company controls not found." });
  res.json(payload(row, vehicles));
}));

commercialRouter.patch("/", requireAuth, requirePlatformOwner, asyncHandler(async (req, res) => {
  const input=patchSchema.parse(req.body);const result=await updateControl(req.user!.companyId,input,{id:req.user!.id,email:req.user!.email});
  if(!result)return res.status(404).json({error:"Company controls not found."});res.json(result);
}));
