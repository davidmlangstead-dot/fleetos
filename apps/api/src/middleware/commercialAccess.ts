import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";

const SAFE_METHODS = new Set(["GET","HEAD","OPTIONS"]);
const SAFETY_WRITE_PATHS = [
  /^\/operations\/defects(?:\/|$)/,
  /^\/driver-operations\/checks(?:\/|$)/,
  /^\/driver-operations\/breakdowns(?:\/|$)/,
];

export const requireCommercialWriteAccess: RequestHandler = async (req,res,next)=>{
  if (SAFE_METHODS.has(req.method.toUpperCase())) return next();
  if (!req.user) return res.status(401).json({error:"Unauthenticated"});
  if (req.user.role === "PLATFORM_ADMIN") return next();
  if (SAFETY_WRITE_PATHS.some(pattern=>pattern.test(req.path))) return next();

  const rows=await prisma.$queryRaw<Array<{subscriptionStatus:string;trialEndsAt:Date|null}>>`
    SELECT "subscriptionStatus","trialEndsAt" FROM "CompanyControl" WHERE "companyId"=${req.user.companyId} LIMIT 1
  `;
  const control=rows[0];
  if(!control) return res.status(402).json({error:"Commercial access has not been configured for this company",code:"SUBSCRIPTION_READ_ONLY",readOnly:true});
  const trialActive=control.subscriptionStatus==="TRIAL" && (!control.trialEndsAt || new Date(control.trialEndsAt).getTime()>=Date.now());
  if(control.subscriptionStatus==="ACTIVE" || trialActive) return next();
  return res.status(402).json({error:"This workspace is read-only until the subscription is active. Viewing and safety reporting remain available.",code:"SUBSCRIPTION_READ_ONLY",readOnly:true,subscriptionStatus:control.subscriptionStatus});
};
