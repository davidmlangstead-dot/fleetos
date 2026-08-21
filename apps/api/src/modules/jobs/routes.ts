import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { config } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { createClient } from "@supabase/supabase-js";
import { createCustomerJobReportPdf, type CustomerJobReport, type ReportImage } from "./customerReportPdf.js";

type FormField = { key: string; label: string; type: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "CHECKBOX" | "SELECT"; required: boolean; options?: string[] };
type JobTypeRow = { id: string; name: string; trade: string; description: string | null; colour: string; defaultPriority: string; defaultDurationMinutes: number; workflow: string[]; formSchema: FormField[]; requiredSkills: string[]; riskAssessmentRequired: boolean; customerSignatureRequired: boolean; isSystem: boolean; isActive: boolean };

const officeRoles = new Set(["TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);
const jobReaders = requireRoles("DRIVER", "WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const jobRegisterReaders = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const jobWriters = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const jobStatuses = ["DRAFT", "PLANNED", "ASSIGNED", "SCHEDULED", "DISPATCHED", "TRAVELLING", "ON_SITE", "PAUSED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "COMPLETED_ISSUES", "CLOSED", "CANCELLED"] as const;
const fieldStatuses = new Set(["TRAVELLING", "ON_SITE", "IN_PROGRESS", "PAUSED"]);
const fieldTransitions: Record<string, readonly string[]> = {
  DISPATCHED: ["TRAVELLING", "ON_SITE"],
  TRAVELLING: ["ON_SITE"],
  ON_SITE: ["IN_PROGRESS"],
  IN_PROGRESS: ["PAUSED"],
  PAUSED: ["IN_PROGRESS"],
};
const terminalStatuses = new Set(["COMPLETED", "COMPLETED_ISSUES", "CLOSED", "CANCELLED"]);

const formField = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/), label: z.string().trim().min(1).max(120),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "DATE", "CHECKBOX", "SELECT"]), required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});
const jobTypeInput = z.object({
  name: z.string().trim().min(2).max(120), trade: z.string().trim().min(2).max(80), description: z.string().trim().max(1000).optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#197b58"), defaultPriority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "EMERGENCY"]).default("NORMAL"),
  defaultDurationMinutes: z.number().int().min(5).max(43200).default(60), workflow: z.array(z.enum(jobStatuses)).min(2).max(15),
  formSchema: z.array(formField).max(40).default([]), requiredSkills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  riskAssessmentRequired: z.boolean().default(false), customerSignatureRequired: z.boolean().default(false), isActive: z.boolean().default(true),
});
const createJobInput = z.object({
  jobTypeId: z.string().uuid(), reference: z.string().trim().max(80).optional(), title: z.string().trim().min(2).max(200), description: z.string().trim().max(8000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "EMERGENCY"]), source: z.enum(["OFFICE", "CUSTOMER", "PHONE", "EMAIL", "PORTAL", "PLANNED", "REACTIVE", "OTHER"]),
  customerId: z.string().uuid().optional(), customerName: z.string().trim().min(1).max(180).optional(), accountReference: z.string().trim().max(80).optional(),
  siteId: z.string().uuid().optional(), siteName: z.string().trim().max(160).optional(), siteAddress: z.string().trim().max(1200).optional(), sitePostcode: z.string().trim().max(20).optional(), assetId: z.string().uuid().optional(),
  contactName: z.string().trim().max(160).optional(), contactPhone: z.string().trim().max(80).optional(), contactEmail: z.string().trim().email().max(240).optional(), accessNotes: z.string().trim().max(2000).optional(),
  scheduledStart: z.coerce.date().optional(), scheduledEnd: z.coerce.date().optional(), dueAt: z.coerce.date().optional(), estimatedDurationMinutes: z.number().int().min(5).max(43200).optional(),
  personIds: z.array(z.string().trim().min(1)).max(30).default([]), vehicleId: z.string().trim().min(1).optional(), purchaseOrderNumber: z.string().trim().max(100).optional(),
  quotePence: z.number().int().min(0).max(2_000_000_000).optional(), estimatedCostPence: z.number().int().min(0).max(2_000_000_000).optional(), customFields: z.record(z.unknown()).default({}),
}).superRefine((input, ctx) => {
  if (!input.customerId && !input.customerName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerName"], message: "Choose or enter a customer" });
  if (!input.siteId && !input.siteAddress) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["siteAddress"], message: "Choose or enter a site address" });
  if (input.scheduledEnd && input.scheduledStart && input.scheduledEnd < input.scheduledStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledEnd"], message: "End time cannot be before start time" });
});
const statusInput = z.object({ status: z.enum(jobStatuses), note: z.string().trim().max(3000).optional() });
const scheduleInput = z.object({
  scheduledStart:z.union([z.coerce.date(),z.null()]).optional(), scheduledEnd:z.union([z.coerce.date(),z.null()]).optional(), dueAt:z.union([z.coerce.date(),z.null()]).optional(),
  personIds:z.array(z.string().trim().min(1)).max(30).optional(), vehicleId:z.union([z.string().trim().min(1),z.null()]).optional(), note:z.string().trim().max(1000).optional(),
}).superRefine((input,ctx)=>{if(input.scheduledStart&&input.scheduledEnd&&input.scheduledEnd<input.scheduledStart)ctx.addIssue({code:z.ZodIssueCode.custom,path:["scheduledEnd"],message:"End time cannot be before start time"});});
const worksheetInput = z.object({ responses: z.record(z.unknown()), riskAssessment: z.record(z.unknown()).optional(), customerSignature: z.object({ name: z.string().trim().min(2).max(160), signedAt: z.coerce.date().optional() }).optional() });
const costInput = z.object({ category: z.enum(["LABOUR", "PART", "MATERIAL", "EXPENSE", "SUBCONTRACT", "OTHER"]), description: z.string().trim().min(2).max(500), quantity: z.number().positive().max(1_000_000), unitCostPence: z.number().int().min(0).max(2_000_000_000), unitSellPence: z.number().int().min(0).max(2_000_000_000) });
const lifecycleNoteInput = z.object({ note: z.string().trim().max(3000).optional() });
const emailReportInput = z.object({
  to: z.string().trim().email().max(240).optional(),
  message: z.string().trim().max(3000).optional(),
});

type JobReportRow = {
  id: string;
  reference: string | null;
  title: string | null;
  description: string | null;
  status: string;
  priority: string;
  customerName: string;
  contactEmail: string | null;
  contactName: string | null;
  siteName: string | null;
  siteAddress: string | null;
  sitePostcode: string | null;
  scheduledStart: Date | null;
  completedAt: Date | null;
  issuedToDriverAt: Date | null;
  submittedByDriverAt: Date | null;
  officeApprovedAt: Date | null;
  reportGeneratedAt: Date | null;
  reportEmailedAt: Date | null;
  worksheetSchema: FormField[];
  worksheetResponses: Record<string, unknown>;
  riskAssessment: Record<string, unknown>;
  customerSignature: Record<string, unknown>;
  registration: string | null;
  accessNotes: string | null;
  assetName: string | null;
  assetReference: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseOrderNumber: string | null;
  scheduledEnd: Date | null;
  companyName: string;
  companyAddress: string | null;
  companyPostcode: string | null;
  companyPhone: string | null;
  companyVatNumber: string | null;
  companyOperatorLicenceNumber: string | null;
};

function valueText(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Not completed";
  if (value instanceof Date) return value.toLocaleString("en-GB");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-GB") : "Not recorded";
}

function assertCompleteJobSheet(job: Pick<JobReportRow, "worksheetSchema" | "worksheetResponses" | "riskAssessment" | "customerSignature"> & { riskAssessmentRequired?: boolean; customerSignatureRequired?: boolean }) {
  const missing = job.worksheetSchema.filter(field => field.required).find(field => {
    const value = job.worksheetResponses[field.key];
    return value === undefined || value === null || value === "" || value === false;
  });
  if (missing) return `Complete the required job-sheet field before submitting: ${missing.label}`;
  const customerReportFields: Array<[string,string]> = [["report_summary","Outcome summary / what happened"],["report_work_completed","Work carried out"],["report_findings","Findings / condition"],["report_recommendations","Recommendations / further work"]];
  const missingReportField=customerReportFields.find(([key])=>!String(job.worksheetResponses[key]??"").trim());
  if(missingReportField)return `Complete the customer report field before submitting: ${missingReportField[1]}`;
  if (job.riskAssessmentRequired && job.riskAssessment.safeToProceed !== true) return "Complete the point-of-work risk assessment before submitting this job";
  if (job.customerSignatureRequired && !job.customerSignature.name) return "Capture the customer signature before submitting this job";
  return null;
}

async function loadReportJob(companyId: string, jobId: string) {
  return (await prisma.$queryRaw<JobReportRow[]>`
    SELECT j.id,j."jobNumber" AS reference,j.title,j.description,j.status::text,j.priority,COALESCE(c.name,j."customerName") AS "customerName",
      j."contactEmail",j."contactName",s.name AS "siteName",COALESCE(s.address,j."collectionAddress") AS "siteAddress",COALESCE(s.postcode,j."collectionPostcode") AS "sitePostcode",s."accessNotes",
      j."scheduledStart",j."scheduledEnd",j."completedAt",j."issuedToDriverAt",j."submittedByDriverAt",j."officeApprovedAt",j."reportGeneratedAt",j."reportEmailedAt",j."purchaseOrderNumber",
      j."worksheetSchema",j."worksheetResponses",j."riskAssessment",j."customerSignature",v.registration,a.name AS "assetName",a."assetReference",a.manufacturer,a.model,a."serialNumber",
      co.name AS "companyName",co.address AS "companyAddress",co.postcode AS "companyPostcode",co.phone AS "companyPhone",co."vatNumber" AS "companyVatNumber",co."operatorLicenceNumber" AS "companyOperatorLicenceNumber"
    FROM "Job" j
    LEFT JOIN "Customer" c ON c.id=j."customerId"
    LEFT JOIN "CustomerSite" s ON s.id=j."siteId"
    LEFT JOIN "Vehicle" v ON v.id=j."vehicleId"
    LEFT JOIN "SiteAsset" a ON a.id=j."assetId"
    JOIN "Company" co ON co.id=j."companyId"
    WHERE j.id=${jobId} AND j."companyId"=${companyId}
    LIMIT 1
  `)[0] ?? null;
}

async function loadCustomerReport(companyId: string, jobId: string, reportGeneratedAt: Date) {
  const job = await loadReportJob(companyId, jobId);
  if (!job) return null;
  const [assignments, visits, costs, attachments] = await Promise.all([
    prisma.$queryRaw<CustomerJobReport["assignments"]>`SELECT p."firstName",p."lastName",p."personType" FROM "JobAssignment" ja JOIN "Person" p ON p.id=ja."personId" WHERE ja."jobId"=${jobId} AND ja."companyId"=${companyId} ORDER BY p."lastName",p."firstName"`,
    prisma.$queryRaw<CustomerJobReport["visits"]>`SELECT title,status,"scheduledStart","scheduledEnd","actualStart","actualEnd",notes FROM "JobVisit" WHERE "jobId"=${jobId} AND "companyId"=${companyId} ORDER BY sequence`,
    prisma.$queryRaw<CustomerJobReport["costs"]>`SELECT category,description,quantity::float8 AS quantity FROM "JobCostLine" WHERE "jobId"=${jobId} AND "companyId"=${companyId} ORDER BY "createdAt"`,
    prisma.$queryRaw<Array<CustomerJobReport["attachments"][number] & {fileUrl:string}>>`SELECT name,"mimeType","createdAt","fileUrl" FROM "Document" WHERE "jobId"=${jobId} AND "companyId"=${companyId} ORDER BY "createdAt"`,
  ]);
  const imageFiles = attachments.filter(item => item.mimeType?.toLowerCase().startsWith("image/")).slice(0, 20);
  const images: ReportImage[] = [];
  let logo:ReportImage|null=null;
  if (config.SUPABASE_SERVICE_ROLE_KEY) {
    const storage = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from("fleet-documents");
    try {
      const {data,error}=await storage.download(`${companyId}/branding/document-logo.jpg`);
      if(!error&&data&&data.size<=4*1024*1024)logo={name:"Company logo",createdAt:new Date(),mimeType:"image/jpeg",data:Buffer.from(await data.arrayBuffer())};
    } catch { /* Company branding is optional. */ }
    for (const item of imageFiles) {
      try {
        const { data, error } = await storage.download(item.fileUrl);
        if (!error && data && data.size <= 12 * 1024 * 1024) images.push({ name: item.name, createdAt: item.createdAt, mimeType: item.mimeType, data: Buffer.from(await data.arrayBuffer()) });
      } catch { /* The attachment remains listed even if private storage is temporarily unavailable. */ }
    }
  }
  const report: CustomerJobReport = { ...job, reportGeneratedAt, assignments, visits, costs, attachments };
  return { report, images, logo };
}

function htmlEscape(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}

async function sendReportEmail(args: { to: string; subject: string; message: string; pdf: Buffer; filename: string; idempotencyKey:string; job:Pick<JobReportRow,"id"|"reference"|"title"|"customerName"|"completedAt"> }) {
  if (!config.RESEND_API_KEY || !config.JOB_REPORT_FROM_EMAIL) return { status: "NOT_CONFIGURED", providerId: null as string | null };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key":args.idempotencyKey },
    body: JSON.stringify({
      from: config.JOB_REPORT_FROM_EMAIL,
      to: [args.to],
      subject: args.subject,
      text: args.message,
      html:`<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55;max-width:640px"><h1 style="font-size:22px;margin-bottom:8px">Completed job report</h1><p>${htmlEscape(args.message)}</p><table style="border-collapse:collapse;width:100%;margin:20px 0"><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Reference</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(args.job.reference??args.job.id)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Job</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(args.job.title??"Job")}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Customer</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(args.job.customerName)}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Completed</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(dateText(args.job.completedAt))}</td></tr></table><p>The signed accountability record is attached as a PDF.</p><p style="font-size:12px;color:#6b7280">Sent securely by FleetOS.</p></div>`,
      attachments: [{ filename: args.filename, content: args.pdf.toString("base64") }],
    }),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || `Email provider rejected the report: ${response.status}`);
  return { status: "SENT", providerId: payload.id ?? null };
}

const presets = [
  { name: "Reactive callout", trade: "MULTI-TRADE", description: "Urgent or same-day fault, repair or attendance.", colour: "#dc593a", defaultPriority: "URGENT", defaultDurationMinutes: 120, workflow: ["DISPATCHED", "TRAVELLING", "ON_SITE", "COMPLETED"], requiredSkills: [], riskAssessmentRequired: true, customerSignatureRequired: true, formSchema: [{ key: "fault_found", label: "Fault found", type: "TEXTAREA", required: true }, { key: "work_completed", label: "Work completed", type: "TEXTAREA", required: true }, { key: "follow_up", label: "Further work required", type: "CHECKBOX", required: false }] },
  { name: "Planned maintenance", trade: "MAINTENANCE", description: "Routine servicing and preventative maintenance.", colour: "#2c78c4", defaultPriority: "NORMAL", defaultDurationMinutes: 180, workflow: ["SCHEDULED", "ON_SITE", "COMPLETED"], requiredSkills: [], riskAssessmentRequired: true, customerSignatureRequired: true, formSchema: [{ key: "condition_before", label: "Condition before work", type: "TEXTAREA", required: true }, { key: "work_completed", label: "Work completed", type: "TEXTAREA", required: true }, { key: "next_due", label: "Next due date", type: "DATE", required: false }] },
  { name: "Installation / project", trade: "PROJECT", description: "Installations and multi-visit project work.", colour: "#7756c5", defaultPriority: "NORMAL", defaultDurationMinutes: 480, workflow: ["SCHEDULED", "ON_SITE", "PAUSED", "COMPLETED"], requiredSkills: [], riskAssessmentRequired: true, customerSignatureRequired: true, formSchema: [{ key: "scope_completed", label: "Scope completed", type: "TEXTAREA", required: true }, { key: "commissioned", label: "Tested and commissioned", type: "CHECKBOX", required: true }] },
  { name: "Inspection / compliance", trade: "COMPLIANCE", description: "Inspection, survey, test or certification visit.", colour: "#16866a", defaultPriority: "NORMAL", defaultDurationMinutes: 90, workflow: ["SCHEDULED", "ON_SITE", "COMPLETED"], requiredSkills: [], riskAssessmentRequired: true, customerSignatureRequired: false, formSchema: [{ key: "inspection_result", label: "Inspection result", type: "SELECT", required: true, options: ["Pass", "Advisory", "Fail"] }, { key: "findings", label: "Findings", type: "TEXTAREA", required: true }] },
  { name: "General field service", trade: "GENERAL", description: "Flexible multi-trade site work.", colour: "#197b58", defaultPriority: "NORMAL", defaultDurationMinutes: 120, workflow: ["SCHEDULED", "ON_SITE", "COMPLETED"], requiredSkills: [], riskAssessmentRequired: false, customerSignatureRequired: false, formSchema: [{ key: "work_completed", label: "Work completed", type: "TEXTAREA", required: true }] },
  { name: "Transport / delivery", trade: "TRANSPORT", description: "Collection, delivery or vehicle-based work.", colour: "#687386", defaultPriority: "NORMAL", defaultDurationMinutes: 120, workflow: ["SCHEDULED", "TRAVELLING", "ON_SITE", "COMPLETED"], requiredSkills: ["Driving"], riskAssessmentRequired: false, customerSignatureRequired: true, formSchema: [{ key: "delivery_result", label: "Delivery result", type: "SELECT", required: true, options: ["Delivered", "Part delivered", "Unable to deliver"] }, { key: "pod_notes", label: "Proof of delivery notes", type: "TEXTAREA", required: false }] },
] satisfies Array<Omit<z.infer<typeof jobTypeInput>, "isActive">>;

async function ensureJobTypes(companyId: string, userId: string) {
  const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "JobType" WHERE "companyId"=${companyId}`;
  if (Number(existing[0]?.count ?? 0) > 0) return;
  for (const preset of presets) await prisma.$executeRaw`INSERT INTO "JobType" (id,"companyId",name,trade,description,colour,"defaultPriority","defaultDurationMinutes",workflow,"formSchema","requiredSkills","riskAssessmentRequired","customerSignatureRequired","isSystem","isActive","createdById","createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${companyId},${preset.name},${preset.trade},${preset.description},${preset.colour},${preset.defaultPriority},${preset.defaultDurationMinutes},${JSON.stringify(preset.workflow)}::jsonb,${JSON.stringify(preset.formSchema)}::jsonb,${JSON.stringify(preset.requiredSkills)}::jsonb,${preset.riskAssessmentRequired},${preset.customerSignatureRequired},true,true,${userId},NOW(),NOW()) ON CONFLICT ("companyId",name) DO NOTHING`;
}

async function jobType(companyId: string, id: string) {
  return (await prisma.$queryRaw<JobTypeRow[]>`SELECT id::text,name,trade,description,colour,"defaultPriority","defaultDurationMinutes",workflow,"formSchema","requiredSkills","riskAssessmentRequired","customerSignatureRequired","isSystem","isActive" FROM "JobType" WHERE id=${id}::uuid AND "companyId"=${companyId} AND "isActive"=true LIMIT 1`)[0] ?? null;
}

async function canAccessJob(user: NonNullable<Express.Request["user"]>, jobId: string) {
  if (officeRoles.has(user.role) || user.role === "FINANCE") return true;
  const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM "Job" j WHERE j.id=${jobId} AND j."companyId"=${user.companyId} AND (
        EXISTS (SELECT 1 FROM "JobAssignment" a JOIN "Person" p ON p.id=a."personId" AND p."companyId"=a."companyId" WHERE a."jobId"=j.id AND a."companyId"=j."companyId" AND (p."userId"=${user.id} OR lower(p.email)=lower(${user.email})))
        OR EXISTS (SELECT 1 FROM "Driver" d WHERE d.id=j."driverId" AND d."companyId"=j."companyId" AND lower(d.email)=lower(${user.email}))
      )
    ) AS ok`;
  return rows[0]?.ok ?? false;
}

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

jobsRouter.get("/config", jobRegisterReaders, asyncHandler(async (req, res) => {
  await ensureJobTypes(req.user!.companyId, req.user!.id);
  const companyId = req.user!.companyId;
  const [types, people, vehicles, customers, sites, assets] = await Promise.all([
    prisma.$queryRaw<JobTypeRow[]>`SELECT id::text,name,trade,description,colour,"defaultPriority","defaultDurationMinutes",workflow,"formSchema","requiredSkills","riskAssessmentRequired","customerSignatureRequired","isSystem","isActive" FROM "JobType" WHERE "companyId"=${companyId} AND "isActive"=true ORDER BY "isSystem" DESC,name`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT id,"firstName","lastName",email,"personType","accessRole",skills FROM "Person" WHERE "companyId"=${companyId} AND "isActive"=true ORDER BY "lastName","firstName"`,
    prisma.vehicle.findMany({ where: { companyId, status: { not: "ARCHIVED" } }, select: { id: true, registration: true, type: true, status: true }, orderBy: { registration: "asc" } }),
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT id::text,name,"accountReference",email,phone FROM "Customer" WHERE "companyId"=${companyId} AND "isActive"=true ORDER BY name`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT id::text,"customerId"::text,name,address,postcode,"contactName","contactPhone","contactEmail","accessNotes" FROM "CustomerSite" WHERE "companyId"=${companyId} AND "isActive"=true ORDER BY name`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT id::text,"siteId"::text,name,"assetType","assetReference",manufacturer,model,"serialNumber",location FROM "SiteAsset" WHERE "companyId"=${companyId} AND "isActive"=true ORDER BY name`,
  ]);
  res.json({ jobTypes: types, people, vehicles, customers, sites, assets });
}));

jobsRouter.post("/job-types", jobWriters, asyncHandler(async (req, res) => {
  const input = jobTypeInput.parse(req.body); const id = randomUUID(); const companyId = req.user!.companyId;
  if (new Set(input.formSchema.map((field) => field.key)).size !== input.formSchema.length) return res.status(400).json({ error: "Every worksheet field needs a unique name" });
  await prisma.$executeRaw`INSERT INTO "JobType" (id,"companyId",name,trade,description,colour,"defaultPriority","defaultDurationMinutes",workflow,"formSchema","requiredSkills","riskAssessmentRequired","customerSignatureRequired","isSystem","isActive","createdById","createdAt","updatedAt") VALUES (${id}::uuid,${companyId},${input.name},${input.trade},${input.description||null},${input.colour},${input.defaultPriority},${input.defaultDurationMinutes},${JSON.stringify(input.workflow)}::jsonb,${JSON.stringify(input.formSchema)}::jsonb,${JSON.stringify(input.requiredSkills)}::jsonb,${input.riskAssessmentRequired},${input.customerSignatureRequired},false,${input.isActive},${req.user!.id},NOW(),NOW())`;
  await writeAuditEvent({ companyId, actorUserId:req.user!.id, actorEmail:req.user!.email, action:"CREATE", entityType:"JOB_TYPE", entityId:id, summary:`Created custom job type ${input.name}` });
  res.status(201).json({ id, ...input, isSystem:false });
}));

jobsRouter.patch("/job-types/:id", jobWriters, asyncHandler(async (req, res) => {
  const input = jobTypeInput.partial().parse(req.body); const companyId=req.user!.companyId;
  if (input.formSchema && new Set(input.formSchema.map((field) => field.key)).size !== input.formSchema.length) return res.status(400).json({ error: "Every worksheet field needs a unique name" });
  const current=await jobType(companyId,req.params.id); if(!current) return res.status(404).json({error:"Job type not found"});
  await prisma.$executeRaw`UPDATE "JobType" SET name=COALESCE(${input.name??null},name),trade=COALESCE(${input.trade??null},trade),description=COALESCE(${input.description??null},description),colour=COALESCE(${input.colour??null},colour),"defaultPriority"=COALESCE(${input.defaultPriority??null},"defaultPriority"),"defaultDurationMinutes"=COALESCE(${input.defaultDurationMinutes??null},"defaultDurationMinutes"),workflow=COALESCE(${input.workflow?JSON.stringify(input.workflow):null}::jsonb,workflow),"formSchema"=COALESCE(${input.formSchema?JSON.stringify(input.formSchema):null}::jsonb,"formSchema"),"requiredSkills"=COALESCE(${input.requiredSkills?JSON.stringify(input.requiredSkills):null}::jsonb,"requiredSkills"),"riskAssessmentRequired"=COALESCE(${input.riskAssessmentRequired??null},"riskAssessmentRequired"),"customerSignatureRequired"=COALESCE(${input.customerSignatureRequired??null},"customerSignatureRequired"),"isActive"=COALESCE(${input.isActive??null},"isActive"),"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${companyId}`;
  await writeAuditEvent({ companyId, actorUserId:req.user!.id, actorEmail:req.user!.email, action:"UPDATE", entityType:"JOB_TYPE", entityId:req.params.id, summary:`Updated job type ${input.name??current.name}` });
  res.json({ok:true});
}));

jobsRouter.get("/my-work", asyncHandler(async (req,res)=>{
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT j.id,j."jobNumber" AS reference,COALESCE(j.title,j."jobNumber",'Job') AS title,j.description,j.status::text,j.priority,j.source,j."scheduledStart",j."scheduledEnd",j."dueAt",j."customFields",j."worksheetSchema",j."worksheetResponses",j."riskAssessment",j."customerSignature",j.instructions,j."contactName",j."contactPhone",j."contactEmail",j."purchaseOrderNumber",jt.name AS "jobTypeName",jt.trade,jt.colour,jt."riskAssessmentRequired",jt."customerSignatureRequired",c.name AS "customerName",s.name AS "siteName",s.address AS "siteAddress",s.postcode AS "sitePostcode",s."accessNotes",a.name AS "assetName",v.registration,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p."firstName"||' '||p."lastName")) FROM "JobAssignment" ja JOIN "Person" p ON p.id=ja."personId" WHERE ja."jobId"=j.id AND ja."companyId"=j."companyId"),'[]'::jsonb) AS assignments
    FROM "Job" j LEFT JOIN "JobType" jt ON jt.id=j."jobTypeId" LEFT JOIN "Customer" c ON c.id=j."customerId" LEFT JOIN "CustomerSite" s ON s.id=j."siteId" LEFT JOIN "SiteAsset" a ON a.id=j."assetId" LEFT JOIN "Vehicle" v ON v.id=j."vehicleId"
    WHERE j."companyId"=${req.user!.companyId} AND j.status NOT IN ('CANCELLED','CLOSED') AND (
      EXISTS (SELECT 1 FROM "JobAssignment" ja JOIN "Person" p ON p.id=ja."personId" AND p."companyId"=ja."companyId" WHERE ja."jobId"=j.id AND ja."companyId"=j."companyId" AND (p."userId"=${req.user!.id} OR lower(p.email)=lower(${req.user!.email})))
      OR EXISTS (SELECT 1 FROM "Driver" d WHERE d.id=j."driverId" AND d."companyId"=j."companyId" AND lower(d.email)=lower(${req.user!.email}))
    ) ORDER BY j."scheduledStart" NULLS LAST,j."createdAt" DESC LIMIT 100`;
  res.json(rows);
}));

jobsRouter.get("/", jobRegisterReaders, asyncHandler(async (req,res)=>{
  await ensureJobTypes(req.user!.companyId,req.user!.id); const companyId=req.user!.companyId;
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`
    SELECT j.id,j."jobNumber" AS reference,COALESCE(j.title,j."jobNumber",'Job') AS title,j.status::text,j.priority,j.source,j."scheduledStart",j."scheduledEnd",j."dueAt",j."createdAt",j."purchaseOrderNumber",j."quotePence",jt.name AS "jobTypeName",jt.trade,jt.colour,COALESCE(c.name,j."customerName") AS "customerName",s.name AS "siteName",COALESCE(s.address,j."collectionAddress") AS "siteAddress",s.postcode AS "sitePostcode",a.name AS "assetName",v.registration,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p."firstName"||' '||p."lastName",'type',p."personType")) FROM "JobAssignment" ja JOIN "Person" p ON p.id=ja."personId" WHERE ja."jobId"=j.id AND ja."companyId"=j."companyId"),'[]'::jsonb) AS assignments,
      COALESCE((SELECT sum(cl.quantity*cl."unitCostPence") FROM "JobCostLine" cl WHERE cl."jobId"=j.id),0) AS "actualCostPence",COALESCE((SELECT sum(cl.quantity*cl."unitSellPence") FROM "JobCostLine" cl WHERE cl."jobId"=j.id),0) AS "sellPence"
    FROM "Job" j LEFT JOIN "JobType" jt ON jt.id=j."jobTypeId" LEFT JOIN "Customer" c ON c.id=j."customerId" LEFT JOIN "CustomerSite" s ON s.id=j."siteId" LEFT JOIN "SiteAsset" a ON a.id=j."assetId" LEFT JOIN "Vehicle" v ON v.id=j."vehicleId"
    WHERE j."companyId"=${companyId} ORDER BY COALESCE(j."scheduledStart",j."createdAt") DESC LIMIT 300`;
  res.json(rows.map(row=>({...row,actualCostPence:Number(row.actualCostPence??0),sellPence:Number(row.sellPence??0),scheduledAt:row.scheduledStart??row.createdAt})));
}));

jobsRouter.post("/", jobWriters, asyncHandler(async (req,res)=>{
  const input=createJobInput.parse(req.body); const companyId=req.user!.companyId; const type=await jobType(companyId,input.jobTypeId);
  if(!type) return res.status(400).json({error:"Choose an active job type"});
  const people=input.personIds.length?await prisma.$queryRaw<Array<{id:string;email:string|null}>>`SELECT id,email FROM "Person" WHERE "companyId"=${companyId} AND id IN (${Prisma.join(input.personIds)}) AND "isActive"=true`:[];
  if(people.length!==new Set(input.personIds).size) return res.status(400).json({error:"One or more assigned staff are not active in this company"});
  if(input.vehicleId && !(await prisma.vehicle.findFirst({where:{id:input.vehicleId,companyId},select:{id:true}}))) return res.status(400).json({error:"Vehicle is not in this company"});
  const jobId=randomUUID(); const visitId=randomUUID(); const reference=input.reference||`JOB-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${jobId.slice(0,4).toUpperCase()}`;
  let customerId=input.customerId??null; let customerName=input.customerName??""; let siteId=input.siteId??null; let siteName=input.siteName??"Main site"; let siteAddress=input.siteAddress??""; let sitePostcode=input.sitePostcode??"";
  await prisma.$transaction(async tx=>{
    if(customerId){const rows=await tx.$queryRaw<Array<{id:string;name:string}>>`SELECT id::text,name FROM "Customer" WHERE id=${customerId}::uuid AND "companyId"=${companyId}`; if(!rows[0]) throw new Error("Customer is not in this company"); customerName=rows[0].name;}
    else {const found=await tx.$queryRaw<Array<{id:string}>>`SELECT id::text FROM "Customer" WHERE "companyId"=${companyId} AND lower(name)=lower(${customerName}) LIMIT 1`; customerId=found[0]?.id??randomUUID(); if(!found[0]) await tx.$executeRaw`INSERT INTO "Customer" (id,"companyId",name,"accountReference","createdAt","updatedAt") VALUES (${customerId}::uuid,${companyId},${customerName},${input.accountReference||null},NOW(),NOW())`;}
    if(siteId){const rows=await tx.$queryRaw<Array<{id:string;name:string;address:string;postcode:string|null}>>`SELECT id::text,name,address,postcode FROM "CustomerSite" WHERE id=${siteId}::uuid AND "companyId"=${companyId} AND "customerId"=${customerId}::uuid`; if(!rows[0]) throw new Error("Site is not linked to this customer"); siteName=rows[0].name;siteAddress=rows[0].address;sitePostcode=rows[0].postcode??"";}
    else {siteId=randomUUID();await tx.$executeRaw`INSERT INTO "CustomerSite" (id,"companyId","customerId",name,address,postcode,"contactName","contactPhone","contactEmail","accessNotes","createdAt","updatedAt") VALUES (${siteId}::uuid,${companyId},${customerId}::uuid,${siteName||"Main site"},${siteAddress},${sitePostcode||null},${input.contactName||null},${input.contactPhone||null},${input.contactEmail||null},${input.accessNotes||null},NOW(),NOW())`;}
    if(input.assetId && !(await tx.$queryRaw<Array<{id:string}>>`SELECT id::text FROM "SiteAsset" WHERE id=${input.assetId}::uuid AND "companyId"=${companyId} AND "siteId"=${siteId}::uuid`)[0]) throw new Error("Asset is not linked to this site");
    let driverId:string|null=null; for(const person of people){if(!driverId&&person.email){const d=await tx.driver.findFirst({where:{companyId,email:{equals:person.email,mode:"insensitive"},isActive:true},select:{id:true}});driverId=d?.id??null;}}
    const status=input.scheduledStart?"SCHEDULED":people.length?"ASSIGNED":"PLANNED";
    await tx.$executeRaw`INSERT INTO "Job" (id,"companyId","jobTypeId","jobNumber",title,description,priority,source,"customerId","siteId","assetId","customerName","collectionAddress","collectionPostcode","scheduledStart","scheduledEnd","dueAt","collectionDateTime","deliveryDateTime","estimatedDurationMinutes","contactName","contactPhone","contactEmail","purchaseOrderNumber","quotePence","estimatedCostPence","customFields","workflowSnapshot","worksheetSchema","worksheetResponses","riskAssessment","customerSignature","vehicleId","driverId",instructions,status,"createdAt","updatedAt") VALUES (${jobId},${companyId},${type.id}::uuid,${reference},${input.title},${input.description||null},${input.priority},${input.source},${customerId}::uuid,${siteId}::uuid,${input.assetId||null}::uuid,${customerName},${siteAddress},${sitePostcode||null},${input.scheduledStart||null},${input.scheduledEnd||null},${input.dueAt||null},${input.scheduledStart||null},${input.scheduledEnd||null},${input.estimatedDurationMinutes||type.defaultDurationMinutes},${input.contactName||null},${input.contactPhone||null},${input.contactEmail||null},${input.purchaseOrderNumber||null},${input.quotePence||null},${input.estimatedCostPence||null},${JSON.stringify(input.customFields)}::jsonb,${JSON.stringify(type.workflow)}::jsonb,${JSON.stringify(type.formSchema)}::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,${input.vehicleId||null},${driverId},${input.description||null},${status}::"JobStatus",NOW(),NOW())`;
    await tx.$executeRaw`INSERT INTO "JobVisit" (id,"companyId","jobId",sequence,title,status,"scheduledStart","scheduledEnd","createdAt","updatedAt") VALUES (${visitId}::uuid,${companyId},${jobId},1,'Initial visit',${status},${input.scheduledStart||null},${input.scheduledEnd||null},NOW(),NOW())`;
    for(const person of people) await tx.$executeRaw`INSERT INTO "JobAssignment" (id,"companyId","jobId","personId",role,status,"assignedAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},${person.id},'ASSIGNEE','ASSIGNED',NOW())`;
    await tx.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},'CREATED',${`Job ${reference} created`},${input.description||null},${JSON.stringify({jobType:type.name,assigned:people.length})}::jsonb,${req.user!.id},NOW())`;
  });
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"CREATE",entityType:"JOB",entityId:jobId,summary:`Created ${type.name} job ${reference}`,metadata:{jobTypeId:type.id,customerId,siteId,personIds:input.personIds}});
  res.status(201).json({id:jobId,reference,title:input.title,status:input.scheduledStart?"SCHEDULED":people.length?"ASSIGNED":"PLANNED"});
}));

jobsRouter.get("/:id", jobReaders, asyncHandler(async(req,res)=>{
  if(!(await canAccessJob(req.user!,req.params.id))) return res.status(403).json({error:"You do not have access to this job"}); const companyId=req.user!.companyId;
  const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT j.*,j.status::text,j."jobNumber" AS reference,COALESCE(j.title,j."jobNumber",'Job') AS title,jt.name AS "jobTypeName",jt.trade,jt.colour,jt."riskAssessmentRequired",jt."customerSignatureRequired",c.name AS "customerName",s.name AS "siteName",s.address AS "siteAddress",s.postcode AS "sitePostcode",s."accessNotes",a.name AS "assetName",a."assetReference",a.manufacturer,a.model,a."serialNumber",v.registration FROM "Job" j LEFT JOIN "JobType" jt ON jt.id=j."jobTypeId" LEFT JOIN "Customer" c ON c.id=j."customerId" LEFT JOIN "CustomerSite" s ON s.id=j."siteId" LEFT JOIN "SiteAsset" a ON a.id=j."assetId" LEFT JOIN "Vehicle" v ON v.id=j."vehicleId" WHERE j.id=${req.params.id} AND j."companyId"=${companyId} LIMIT 1`;
  if(!rows[0]) return res.status(404).json({error:"Job not found"});
  const [assignments,visits,timeline,costs,documents]=await Promise.all([
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT ja.id::text,ja.role,ja.status,ja."assignedAt",p.id AS "personId",p."firstName",p."lastName",p."personType",p.email,p.phone FROM "JobAssignment" ja JOIN "Person" p ON p.id=ja."personId" WHERE ja."jobId"=${req.params.id} AND ja."companyId"=${companyId}`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT id::text,sequence,title,status,"scheduledStart","scheduledEnd","actualStart","actualEnd",notes FROM "JobVisit" WHERE "jobId"=${req.params.id} AND "companyId"=${companyId} ORDER BY sequence`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT id::text,type,summary,detail,metadata,"createdAt" FROM "JobTimelineEntry" WHERE "jobId"=${req.params.id} AND "companyId"=${companyId} ORDER BY "createdAt" DESC LIMIT 200`,
    prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT id::text,category,description,quantity::float,"unitCostPence","unitSellPence","createdAt" FROM "JobCostLine" WHERE "jobId"=${req.params.id} AND "companyId"=${companyId} ORDER BY "createdAt" DESC`,
    prisma.document.findMany({where:{companyId,jobId:req.params.id},select:{id:true,name:true,type:true,fileUrl:true,createdAt:true},orderBy:{createdAt:"desc"}}),
  ]);
  const financialAccess=officeRoles.has(req.user!.role)||req.user!.role==="FINANCE";
  const visibleJob=financialAccess?rows[0]:{...rows[0],quotePence:null,estimatedCostPence:null,rate:null};
  const visibleCosts=financialAccess?costs:costs.map(line=>({...line,unitCostPence:0,unitSellPence:0}));
  res.json({...visibleJob,assignments,visits,timeline,costs:visibleCosts,documents,canManage:officeRoles.has(req.user!.role),financialAccess});
}));

jobsRouter.patch("/:id/schedule", jobWriters, asyncHandler(async(req,res)=>{
  const input=scheduleInput.parse(req.body),companyId=req.user!.companyId,jobId=req.params.id;
  const current=(await prisma.$queryRaw<Array<{id:string;reference:string|null;status:string}>>`SELECT id,"jobNumber" AS reference,status::text FROM "Job" WHERE id=${jobId} AND "companyId"=${companyId}`)[0];
  if(!current)return res.status(404).json({error:"Job not found"});
  if(terminalStatuses.has(current.status))return res.status(409).json({error:"Closed, completed or cancelled jobs cannot be rescheduled"});
  const selectedIds=input.personIds??(await prisma.$queryRaw<Array<{personId:string}>>`SELECT "personId" FROM "JobAssignment" WHERE "jobId"=${jobId} AND "companyId"=${companyId}`).map(row=>row.personId);
  const people=selectedIds.length?await prisma.$queryRaw<Array<{id:string;email:string|null}>>`SELECT id,email FROM "Person" WHERE "companyId"=${companyId} AND id IN (${Prisma.join(selectedIds)}) AND "isActive"=true`:[];
  if(people.length!==new Set(selectedIds).size)return res.status(400).json({error:"One or more assigned staff are not active in this company"});
  if(input.vehicleId&&!(await prisma.vehicle.findFirst({where:{id:input.vehicleId,companyId,status:{not:"ARCHIVED"}},select:{id:true}})))return res.status(400).json({error:"Vehicle is not active in this company"});
  let driverId:string|null=null;for(const person of people){if(!driverId&&person.email)driverId=(await prisma.driver.findFirst({where:{companyId,email:{equals:person.email,mode:"insensitive"},isActive:true},select:{id:true}}))?.id??null;}
  const scheduledStart=input.scheduledStart!==undefined?input.scheduledStart:(await prisma.$queryRaw<Array<{scheduledStart:Date|null}>>`SELECT "scheduledStart" FROM "Job" WHERE id=${jobId} AND "companyId"=${companyId}`)[0]?.scheduledStart??null;
  const nextStatus=["DRAFT","PLANNED","ASSIGNED","SCHEDULED"].includes(current.status)?scheduledStart?"SCHEDULED":people.length?"ASSIGNED":"PLANNED":current.status;
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`UPDATE "Job" SET "scheduledStart"=CASE WHEN ${input.scheduledStart!==undefined} THEN ${input.scheduledStart??null} ELSE "scheduledStart" END,"scheduledEnd"=CASE WHEN ${input.scheduledEnd!==undefined} THEN ${input.scheduledEnd??null} ELSE "scheduledEnd" END,"dueAt"=CASE WHEN ${input.dueAt!==undefined} THEN ${input.dueAt??null} ELSE "dueAt" END,"collectionDateTime"=CASE WHEN ${input.scheduledStart!==undefined} THEN ${input.scheduledStart??null} ELSE "collectionDateTime" END,"deliveryDateTime"=CASE WHEN ${input.scheduledEnd!==undefined} THEN ${input.scheduledEnd??null} ELSE "deliveryDateTime" END,"vehicleId"=CASE WHEN ${input.vehicleId!==undefined} THEN ${input.vehicleId??null} ELSE "vehicleId" END,"driverId"=${driverId},status=${nextStatus}::"JobStatus","updatedAt"=NOW() WHERE id=${jobId} AND "companyId"=${companyId}`;
    await tx.$executeRaw`UPDATE "JobVisit" SET "scheduledStart"=CASE WHEN ${input.scheduledStart!==undefined} THEN ${input.scheduledStart??null} ELSE "scheduledStart" END,"scheduledEnd"=CASE WHEN ${input.scheduledEnd!==undefined} THEN ${input.scheduledEnd??null} ELSE "scheduledEnd" END,status=${nextStatus},"updatedAt"=NOW() WHERE "jobId"=${jobId} AND "companyId"=${companyId} AND sequence=(SELECT max(sequence) FROM "JobVisit" WHERE "jobId"=${jobId} AND "companyId"=${companyId})`;
    if(input.personIds){await tx.$executeRaw`DELETE FROM "JobAssignment" WHERE "jobId"=${jobId} AND "companyId"=${companyId}`;for(const person of people)await tx.$executeRaw`INSERT INTO "JobAssignment" (id,"companyId","jobId","personId",role,status,"assignedAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},${person.id},'ASSIGNEE','ASSIGNED',NOW())`;}
    await tx.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},'SCHEDULE','Job schedule or assignment updated',${input.note??null},${JSON.stringify({scheduledStart:input.scheduledStart,scheduledEnd:input.scheduledEnd,dueAt:input.dueAt,personIds:selectedIds,vehicleId:input.vehicleId})}::jsonb,${req.user!.id},NOW())`;
  });
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"UPDATE",entityType:"JOB",entityId:jobId,summary:`Rescheduled or reassigned ${current.reference??jobId}`,metadata:{personIds:selectedIds,vehicleId:input.vehicleId}});
  res.json({ok:true,status:nextStatus,scheduledStart,assignedPeople:people.length});
}));

jobsRouter.post("/:id/issue", jobWriters, asyncHandler(async(req,res)=>{
  const input=lifecycleNoteInput.parse(req.body); const companyId=req.user!.companyId;
  const current=(await prisma.$queryRaw<Array<{id:string;reference:string|null;status:string;assignmentCount:number}>>`
    SELECT j.id,j."jobNumber" AS reference,j.status::text,count(ja.id)::int AS "assignmentCount"
    FROM "Job" j LEFT JOIN "JobAssignment" ja ON ja."jobId"=j.id AND ja."companyId"=j."companyId"
    WHERE j.id=${req.params.id} AND j."companyId"=${companyId}
    GROUP BY j.id,j."jobNumber",j.status
  `)[0];
  if(!current) return res.status(404).json({error:"Job not found"});
  if(current.status==="DISPATCHED") return res.json({ok:true,status:current.status});
  if(!["DRAFT","PLANNED","ASSIGNED","SCHEDULED"].includes(current.status)) return res.status(409).json({error:`This job cannot be issued while it is ${current.status.toLowerCase().replaceAll("_"," ")}`});
  if(current.assignmentCount<1) return res.status(409).json({error:"Assign at least one active staff member before issuing the job"});
  const rows=await prisma.$queryRaw<Array<{id:string;reference:string|null;title:string|null;status:string;issuedToDriverAt:Date|null}>>`
    UPDATE "Job"
    SET status='DISPATCHED'::"JobStatus","issuedToDriverAt"=COALESCE("issuedToDriverAt",NOW()),"updatedAt"=NOW()
    WHERE id=${req.params.id} AND "companyId"=${companyId}
    RETURNING id,"jobNumber" AS reference,title,status::text,"issuedToDriverAt"
  `;
  if(!rows[0]) return res.status(404).json({error:"Job not found"});
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "JobVisit" SET status='DISPATCHED',"updatedAt"=NOW() WHERE "jobId"=${req.params.id} AND "companyId"=${companyId} AND sequence=(SELECT max(sequence) FROM "JobVisit" WHERE "jobId"=${req.params.id} AND "companyId"=${companyId})`,
    prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'ISSUED','Job sheet issued to field staff',${input.note||null},${JSON.stringify({stage:"OFFICE_TO_FIELD"})}::jsonb,${req.user!.id},NOW())`,
  ]);
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"ISSUE",entityType:"JOB",entityId:req.params.id,summary:`Issued job sheet ${rows[0].reference??rows[0].id} to field staff`,metadata:{stage:"OFFICE_TO_FIELD"}});
  res.json({ok:true,status:rows[0].status,issuedToDriverAt:rows[0].issuedToDriverAt});
}));

jobsRouter.post("/:id/submit", asyncHandler(async(req,res)=>{
  const input=lifecycleNoteInput.parse(req.body); const companyId=req.user!.companyId;
  if(req.user!.role==="FINANCE") return res.status(403).json({error:"Finance access is read only"});
  if(!(await canAccessJob(req.user!,req.params.id))) return res.status(403).json({error:"You do not have access to submit this job sheet"});
  const current=(await prisma.$queryRaw<Array<{status:string;worksheetSchema:FormField[];worksheetResponses:Record<string,unknown>;riskAssessment:Record<string,unknown>;customerSignature:Record<string,unknown>;riskAssessmentRequired:boolean;customerSignatureRequired:boolean;reference:string|null}>>`
    SELECT j.status::text,j."worksheetSchema",j."worksheetResponses",j."riskAssessment",j."customerSignature",j."jobNumber" AS reference,
      COALESCE(jt."riskAssessmentRequired",false) AS "riskAssessmentRequired",COALESCE(jt."customerSignatureRequired",false) AS "customerSignatureRequired"
    FROM "Job" j LEFT JOIN "JobType" jt ON jt.id=j."jobTypeId"
    WHERE j.id=${req.params.id} AND j."companyId"=${companyId} LIMIT 1
  `)[0];
  if(!current) return res.status(404).json({error:"Job not found"});
  if(!["IN_PROGRESS","PAUSED"].includes(current.status)) return res.status(409).json({error:"Start the job before completing and sending its report"});
  const missing=assertCompleteJobSheet(current);
  if(missing) return res.status(409).json({error:missing});
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Job" SET status='COMPLETED'::"JobStatus","submittedByDriverAt"=COALESCE("submittedByDriverAt",NOW()),"completedAt"=COALESCE("completedAt",NOW()),"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId}`,
    prisma.$executeRaw`UPDATE "JobVisit" SET status='COMPLETED',"actualEnd"=COALESCE("actualEnd",NOW()),"updatedAt"=NOW() WHERE "jobId"=${req.params.id} AND "companyId"=${companyId} AND sequence=(SELECT max(sequence) FROM "JobVisit" WHERE "jobId"=${req.params.id} AND "companyId"=${companyId})`,
    prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'SUBMITTED','Field staff submitted completed job sheet to office',${input.note||null},${JSON.stringify({stage:"FIELD_TO_OFFICE"})}::jsonb,${req.user!.id},NOW())`,
  ]);
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"SUBMIT",entityType:"JOB",entityId:req.params.id,summary:`Field staff submitted job sheet ${current.reference??req.params.id} to office`,metadata:{stage:"FIELD_TO_OFFICE"}});
  res.json({ok:true,status:"COMPLETED",submittedByDriverAt:new Date().toISOString()});
}));

jobsRouter.post("/:id/approve", jobWriters, asyncHandler(async(req,res)=>{
  const input=lifecycleNoteInput.parse(req.body); const companyId=req.user!.companyId;
  const rows=await prisma.$queryRaw<Array<{id:string;reference:string|null;submittedByDriverAt:Date|null}>>`SELECT id,"jobNumber" AS reference,"submittedByDriverAt" FROM "Job" WHERE id=${req.params.id} AND "companyId"=${companyId} LIMIT 1`;
  if(!rows[0]) return res.status(404).json({error:"Job not found"});
  if(!rows[0].submittedByDriverAt) return res.status(409).json({error:"Field staff must submit the completed job sheet before office approval"});
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Job" SET status='CLOSED'::"JobStatus","officeApprovedAt"=COALESCE("officeApprovedAt",NOW()),"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId}`,
    prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'APPROVED','Office checked and approved the job sheet',${input.note||null},${JSON.stringify({stage:"OFFICE_APPROVED"})}::jsonb,${req.user!.id},NOW())`,
  ]);
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"APPROVE",entityType:"JOB",entityId:req.params.id,summary:`Office approved job sheet ${rows[0].reference??rows[0].id}`,metadata:{stage:"OFFICE_APPROVED"}});
  res.json({ok:true,status:"CLOSED",officeApprovedAt:new Date().toISOString()});
}));

jobsRouter.get("/:id/report.pdf", jobRegisterReaders, asyncHandler(async(req,res)=>{
  const companyId=req.user!.companyId; const generatedAt=new Date(); const bundle=await loadCustomerReport(companyId,req.params.id,generatedAt);
  if(!bundle) return res.status(404).json({error:"Job not found"});
  const {report:job,images,logo}=bundle;
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Job" SET "reportGeneratedAt"=NOW(),"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId}`,
    prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'REPORT','Office generated job PDF report',${JSON.stringify({stage:"REPORT_GENERATED"})}::jsonb,${req.user!.id},NOW())`,
  ]);
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"EXPORT",entityType:"JOB_REPORT",entityId:req.params.id,summary:`Generated PDF report for ${job.reference??job.id}`});
  const pdf=createCustomerJobReportPdf(job,images,logo);
  res.setHeader("content-type","application/pdf");
  res.setHeader("content-disposition",`attachment; filename="${(job.reference??job.id).replace(/[^a-z0-9_-]/gi,"-")}-job-report.pdf"`);
  res.send(pdf);
}));

jobsRouter.post("/:id/email-report", jobWriters, asyncHandler(async(req,res)=>{
  const input=emailReportInput.parse(req.body); const companyId=req.user!.companyId; const bundle=await loadCustomerReport(companyId,req.params.id,new Date());
  if(!bundle) return res.status(404).json({error:"Job not found"});
  const {report:job,images,logo}=bundle;
  if(!job.officeApprovedAt) return res.status(409).json({error:"Office must approve the completed job before emailing the report"});
  const to=input.to||job.contactEmail;
  if(!to) return res.status(400).json({error:"Add a customer email address before sending the report"});
  const pdf=createCustomerJobReportPdf(job,images,logo);
  let providerId:string|null=null; let reportStatus="NOT_CONFIGURED";
  try {
    const sent=await sendReportEmail({to,subject:`Job report ${job.reference??job.id}`,message:input.message||`Please find attached the completed job report for ${job.reference??job.title??job.id}.`,pdf,filename:`${(job.reference??job.id).replace(/[^a-z0-9_-]/gi,"-")}-job-report.pdf`,idempotencyKey:`job-report-${job.id}-${job.reportEmailedAt?.getTime()??"first"}`,job});
    providerId=sent.providerId; reportStatus=sent.status;
  } catch (error) {
    reportStatus="FAILED";
    await prisma.$executeRaw`UPDATE "Job" SET "reportEmailStatus"=${reportStatus},"reportEmailTo"=${to},"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId}`;
    await prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'EMAIL','Job report email failed',${error instanceof Error?error.message:"Email failed"},${JSON.stringify({stage:"EMAIL_FAILED",to})}::jsonb,${req.user!.id},NOW())`;
    throw error;
  }
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Job" SET "reportGeneratedAt"=COALESCE("reportGeneratedAt",NOW()),"reportEmailedAt"=CASE WHEN ${reportStatus}='SENT' THEN NOW() ELSE "reportEmailedAt" END,"reportEmailTo"=${to},"reportEmailStatus"=${reportStatus},"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId}`,
    prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,metadata,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'EMAIL',${reportStatus==="SENT"?"Job PDF report emailed":"Job PDF report prepared but email provider is not configured"},${to},${JSON.stringify({stage:"REPORT_EMAIL",to,status:reportStatus,providerId})}::jsonb,${req.user!.id},NOW())`,
  ]);
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"SEND",entityType:"JOB_REPORT",entityId:req.params.id,summary:`Job report ${reportStatus==="SENT"?"emailed":"prepared"} for ${job.reference??job.id}`,metadata:{to,status:reportStatus,providerId}});
  res.json({ok:true,status:reportStatus,to,providerId});
}));

jobsRouter.patch("/:id/status", asyncHandler(async(req,res)=>{
  const input=statusInput.parse(req.body); const companyId=req.user!.companyId; const office=officeRoles.has(req.user!.role);
  if(req.user!.role==="FINANCE") return res.status(403).json({error:"Finance access is read only"});
  if(!office&&!(await canAccessJob(req.user!,req.params.id))) return res.status(403).json({error:"You are not assigned to this job"});
  const current=(await prisma.$queryRaw<Array<{status:string;riskAssessment:Record<string,unknown>;riskAssessmentRequired:boolean}>>`SELECT j.status::text,j."riskAssessment",COALESCE(jt."riskAssessmentRequired",false) AS "riskAssessmentRequired" FROM "Job" j LEFT JOIN "JobType" jt ON jt.id=j."jobTypeId" WHERE j.id=${req.params.id} AND j."companyId"=${companyId} LIMIT 1`)[0];
  if(!current) return res.status(404).json({error:"Job not found"});
  if(input.status===current.status) return res.json({ok:true,status:input.status});
  if(office){
    if(input.status!=="CANCELLED"||terminalStatuses.has(current.status)) return res.status(409).json({error:"Use the job lifecycle actions instead of skipping stages"});
  }else{
    if(!fieldStatuses.has(input.status)) return res.status(403).json({error:"This status can only be set by the office"});
    if(!(fieldTransitions[current.status]??[]).includes(input.status)) return res.status(409).json({error:`Move this job from ${current.status.toLowerCase().replaceAll("_"," ")} using the next available action`});
    if(input.status==="IN_PROGRESS"&&current.riskAssessmentRequired&&current.riskAssessment.safeToProceed!==true) return res.status(409).json({error:"Complete and save the point-of-work risk assessment before starting work"});
  }
  const rows=await prisma.$queryRaw<Array<{id:string}>>`UPDATE "Job" SET status=${input.status}::"JobStatus","completedAt"=CASE WHEN ${input.status} IN ('COMPLETED','COMPLETED_ISSUES','CLOSED') THEN COALESCE("completedAt",NOW()) ELSE "completedAt" END,"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId} RETURNING id`;
  if(!rows[0]) return res.status(404).json({error:"Job not found"});
  await prisma.$transaction([prisma.$executeRaw`UPDATE "JobVisit" SET status=${input.status},"actualStart"=CASE WHEN ${input.status}='IN_PROGRESS' THEN COALESCE("actualStart",NOW()) ELSE "actualStart" END,"updatedAt"=NOW() WHERE "jobId"=${req.params.id} AND "companyId"=${companyId} AND sequence=(SELECT max(sequence) FROM "JobVisit" WHERE "jobId"=${req.params.id} AND "companyId"=${companyId})`,prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'STATUS',${`Status changed to ${input.status}`},${input.note||null},${req.user!.id},NOW())`]);
  await writeAuditEvent({companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"UPDATE",entityType:"JOB",entityId:req.params.id,summary:`Job moved to ${input.status}`}); res.json({ok:true,status:input.status});
}));

jobsRouter.post("/:id/worksheet", asyncHandler(async(req,res)=>{
  if(req.user!.role==="FINANCE") return res.status(403).json({error:"Finance access is read only"});
  const input=worksheetInput.parse(req.body); const companyId=req.user!.companyId;
  if(!(await canAccessJob(req.user!,req.params.id))) return res.status(403).json({error:"You do not have access to this job"});
  const jobs=await prisma.$queryRaw<Array<{worksheetSchema:FormField[]}>>`SELECT "worksheetSchema" FROM "Job" WHERE id=${req.params.id} AND "companyId"=${companyId}`; if(!jobs[0]) return res.status(404).json({error:"Job not found"});
  const signature=input.customerSignature?{...input.customerSignature,signedAt:(input.customerSignature.signedAt??new Date()).toISOString()}:undefined;
  await prisma.$transaction([prisma.$executeRaw`UPDATE "Job" SET "worksheetResponses"=${JSON.stringify(input.responses)}::jsonb,"riskAssessment"=COALESCE(${input.riskAssessment?JSON.stringify(input.riskAssessment):null}::jsonb,"riskAssessment"),"customerSignature"=COALESCE(${signature?JSON.stringify(signature):null}::jsonb,"customerSignature"),"updatedAt"=NOW() WHERE id=${req.params.id} AND "companyId"=${companyId}`,prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${req.params.id},'WORKSHEET','Job worksheet updated',${req.user!.id},NOW())`]);
  res.json({ok:true});
}));

jobsRouter.post("/:id/timeline", asyncHandler(async(req,res)=>{
  if(req.user!.role==="FINANCE") return res.status(403).json({error:"Finance access is read only"});
  const detail=z.string().trim().min(1).max(5000).parse(req.body?.detail); if(!(await canAccessJob(req.user!,req.params.id))) return res.status(403).json({error:"You do not have access to this job"});
  const id=randomUUID();await prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,"createdById","createdAt") SELECT ${id}::uuid,${req.user!.companyId},id,'NOTE','Note added',${detail},${req.user!.id},NOW() FROM "Job" WHERE id=${req.params.id} AND "companyId"=${req.user!.companyId}`;res.status(201).json({id,detail});
}));

jobsRouter.post("/:id/costs", asyncHandler(async(req,res)=>{
  if(req.user!.role==="FINANCE") return res.status(403).json({error:"Finance access is read only"});
  const input=costInput.parse(req.body);if(!(await canAccessJob(req.user!,req.params.id))) return res.status(403).json({error:"You do not have access to this job"});const id=randomUUID();
  const financialAccess=officeRoles.has(req.user!.role);const unitCostPence=financialAccess?input.unitCostPence:0;const unitSellPence=financialAccess?input.unitSellPence:0;
  const rows=await prisma.$queryRaw<Array<{id:string}>>`INSERT INTO "JobCostLine" (id,"companyId","jobId",category,description,quantity,"unitCostPence","unitSellPence","createdById","createdAt") SELECT ${id}::uuid,${req.user!.companyId},id,${input.category},${input.description},${input.quantity},${unitCostPence},${unitSellPence},${req.user!.id},NOW() FROM "Job" WHERE id=${req.params.id} AND "companyId"=${req.user!.companyId} RETURNING id::text`;if(!rows[0]) return res.status(404).json({error:"Job not found"});res.status(201).json({id,...input,unitCostPence,unitSellPence});
}));

