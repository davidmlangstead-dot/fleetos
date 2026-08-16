import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const readers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const writers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const jobWriters = requireRoles("DRIVER", "WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const optionalId = z.union([z.string().trim().min(1), z.literal("")]).optional();
const schema = z.object({
  name: z.string().trim().min(1).max(240), storagePath: z.string().trim().min(1).max(600),
  type: z.enum(["VEHICLE_DOCUMENT", "DRIVER_DOCUMENT", "POD", "INVOICE", "CERTIFICATE", "RAMS", "FIELD_PAPERWORK", "SERVICE_RECORD", "OTHER"]).default("OTHER"),
  fileSize: z.number().int().min(0).max(20 * 1024 * 1024).optional(), mimeType: z.string().trim().max(120).optional(),
  vehicleId: optionalId, driverId: optionalId, jobId: optionalId, defectId: optionalId, complianceId: optionalId,
  maintenanceWorkOrderId: z.union([z.string().uuid(), z.literal("")]).optional(),
});
const jobDocumentSchema = schema.pick({ name:true, storagePath:true, type:true, fileSize:true, mimeType:true });

type DocumentRow = {
  id: string; name: string; type: string; fileUrl: string; fileSize: number | null; mimeType: string | null;
  vehicleId: string | null; driverId: string | null; jobId: string | null; defectId: string | null;
  complianceId: string | null; maintenanceWorkOrderId: string | null; createdAt: Date; updatedAt: Date;
};

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

async function canAccessAssignedJob(user: NonNullable<Express.Request["user"]>, jobId: string) {
  if (user.role !== "DRIVER") {
    const rows = await prisma.$queryRaw<Array<{ ok:boolean }>>`SELECT EXISTS(SELECT 1 FROM "Job" WHERE id=${jobId} AND "companyId"=${user.companyId}) AS ok`;
    return rows[0]?.ok ?? false;
  }
  const rows = await prisma.$queryRaw<Array<{ ok:boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM "Job" j
      WHERE j.id=${jobId} AND j."companyId"=${user.companyId} AND (
        EXISTS (
          SELECT 1 FROM "JobAssignment" ja
          JOIN "Person" p ON p.id=ja."personId" AND p."companyId"=ja."companyId"
          WHERE ja."jobId"=j.id AND ja."companyId"=j."companyId"
            AND (p."userId"=${user.id} OR lower(p.email)=lower(${user.email}))
        )
        OR EXISTS (
          SELECT 1 FROM "Driver" d
          WHERE d.id=j."driverId" AND d."companyId"=j."companyId" AND lower(d.email)=lower(${user.email})
        )
      )
    ) AS ok`;
  return rows[0]?.ok ?? false;
}

documentsRouter.get("/link-options", readers, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const [vehicles, drivers, jobs, defects, compliance, workOrders] = await Promise.all([
    prisma.vehicle.findMany({ where: { companyId }, select: { id: true, registration: true }, orderBy: { registration: "asc" }, take: 250 }),
    prisma.driver.findMany({ where: { companyId }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 250 }),
    prisma.job.findMany({ where: { companyId }, select: { id: true, jobNumber: true, customerName: true }, orderBy: { createdAt: "desc" }, take: 250 }),
    prisma.defect.findMany({ where: { companyId }, select: { id: true, title: true, vehicle: { select: { registration: true } } }, orderBy: { createdAt: "desc" }, take: 250 }),
    prisma.complianceItem.findMany({ where: { companyId }, select: { id: true, title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 250 }),
    prisma.$queryRaw<Array<{ id: string; title: string; registration: string }>>`
      SELECT w.id::text, w.title, v.registration FROM "MaintenanceWorkOrder" w
      JOIN "Vehicle" v ON v.id=w."vehicleId" AND v."companyId"=w."companyId"
      WHERE w."companyId"=${companyId} ORDER BY w."createdAt" DESC LIMIT 250
    `,
  ]);
  res.json({
    vehicles: vehicles.map(v => ({ id: v.id, label: v.registration })),
    drivers: drivers.map(d => ({ id: d.id, label: `${d.firstName} ${d.lastName}` })),
    jobs: jobs.map(j => ({ id: j.id, label: `${j.jobNumber || "Job"} · ${j.customerName}` })),
    defects: defects.map(d => ({ id: d.id, label: `${d.vehicle?.registration || "No vehicle"} · ${d.title}` })),
    compliance: compliance.map(c => ({ id: c.id, label: `${c.title} · ${c.dueDate.toISOString().slice(0, 10)}` })),
    workOrders: workOrders.map(w => ({ id: w.id, label: `${w.registration} · ${w.title}` })),
  });
}));

documentsRouter.get("/", readers, asyncHandler(async (req, res) => {
  const docs = await prisma.$queryRaw<DocumentRow[]>`
    SELECT id, name, type::text, "fileUrl", "fileSize", "mimeType", "vehicleId", "driverId", "jobId", "defectId", "complianceId",
      "maintenanceWorkOrderId"::text AS "maintenanceWorkOrderId", "createdAt", "updatedAt"
    FROM "Document" WHERE "companyId"=${req.user!.companyId} ORDER BY "createdAt" DESC LIMIT 250
  `;
  res.json(docs.map(d => ({ ...d, storagePath: d.fileUrl })));
}));

async function belongsToCompany(companyId: string, input: z.infer<typeof schema>) {
  const checks: Promise<unknown>[] = [];
  if (input.vehicleId) checks.push(prisma.vehicle.findFirst({ where: { id: input.vehicleId, companyId }, select: { id: true } }));
  if (input.driverId) checks.push(prisma.driver.findFirst({ where: { id: input.driverId, companyId }, select: { id: true } }));
  if (input.jobId) checks.push(prisma.job.findFirst({ where: { id: input.jobId, companyId }, select: { id: true } }));
  if (input.defectId) checks.push(prisma.defect.findFirst({ where: { id: input.defectId, companyId }, select: { id: true } }));
  if (input.complianceId) checks.push(prisma.complianceItem.findFirst({ where: { id: input.complianceId, companyId }, select: { id: true } }));
  if (input.maintenanceWorkOrderId) checks.push(prisma.$queryRaw<{ id: string }[]>`SELECT id::text FROM "MaintenanceWorkOrder" WHERE id=${input.maintenanceWorkOrderId}::uuid AND "companyId"=${companyId} LIMIT 1`.then(rows => rows[0]));
  return (await Promise.all(checks)).every(Boolean);
}

documentsRouter.post("/job/:jobId", jobWriters, asyncHandler(async (req, res) => {
  const input = jobDocumentSchema.parse(req.body);
  const companyId = req.user!.companyId;
  const jobId = req.params.jobId;
  if (!(await canAccessAssignedJob(req.user!, jobId))) return res.status(403).json({ error: "You do not have access to add paperwork to this job" });
  if (req.user!.role === "DRIVER" && !["POD", "FIELD_PAPERWORK"].includes(input.type)) return res.status(403).json({ error: "Drivers may only add proof of delivery or field-generated paperwork" });
  if (req.user!.role === "DRIVER" && !input.storagePath.startsWith(`${companyId}/jobs/${jobId}/field/`)) return res.status(400).json({ error: "Driver paperwork must use the assigned job field-paperwork path" });
  if (!input.storagePath.startsWith(`${companyId}/jobs/${jobId}/`)) return res.status(400).json({ error: "Job paperwork path does not match this work order" });
  const doc = await prisma.document.create({ data: {
    companyId, name: input.name, fileUrl: input.storagePath, type: input.type, fileSize: input.fileSize,
    mimeType: input.mimeType, uploadedById: req.user!.id, jobId,
  } });
  await prisma.$executeRaw`INSERT INTO "JobTimelineEntry" (id,"companyId","jobId",type,summary,detail,"createdById","createdAt") VALUES (${randomUUID()}::uuid,${companyId},${jobId},'DOCUMENT',${`Paperwork added: ${doc.name}`},${doc.type},${req.user!.id},NOW())`;
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DOCUMENT", entityId: doc.id, summary: `Job paperwork added: ${doc.name}`, metadata: { type: doc.type, jobId } });
  res.status(201).json({ ...doc, storagePath: doc.fileUrl });
}));

documentsRouter.post("/", writers, asyncHandler(async (req, res) => {
  const input = schema.parse(req.body);
  const companyId = req.user!.companyId;
  if (!input.storagePath.startsWith(`${companyId}/`)) return res.status(400).json({ error: "Document path does not belong to the selected company" });
  if (!(await belongsToCompany(companyId, input))) return res.status(400).json({ error: "Linked FleetOS record does not belong to the selected company" });
  const doc = await prisma.$transaction(async tx => {
    const created = await tx.document.create({ data: {
      companyId, name: input.name, fileUrl: input.storagePath, type: input.type, fileSize: input.fileSize,
      mimeType: input.mimeType, uploadedById: req.user!.id, vehicleId: input.vehicleId || null,
      driverId: input.driverId || null, jobId: input.jobId || null, defectId: input.defectId || null, complianceId: input.complianceId || null,
    } });
    if (input.maintenanceWorkOrderId) await tx.$executeRaw`UPDATE "Document" SET "maintenanceWorkOrderId"=${input.maintenanceWorkOrderId}::uuid WHERE id=${created.id} AND "companyId"=${companyId}`;
    return created;
  });
  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DOCUMENT", entityId: doc.id, summary: `Document added: ${doc.name}`, metadata: { type: doc.type } });
  res.status(201).json({ ...doc, storagePath: doc.fileUrl, maintenanceWorkOrderId: input.maintenanceWorkOrderId || null });
}));

documentsRouter.delete("/:id", writers, asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  await prisma.document.delete({ where: { id: doc.id } });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "DELETE", entityType: "DOCUMENT", entityId: doc.id, summary: `Document removed: ${doc.name}` });
  res.json({ ok: true, storagePath: doc.fileUrl });
}));

