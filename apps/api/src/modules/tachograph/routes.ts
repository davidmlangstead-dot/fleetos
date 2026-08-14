import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const officeReaders = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const officeWriters = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

const uploadSchema = z.object({
  driverId: z.string().trim().min(1),
  storagePath: z.string().trim().min(1).max(600),
  originalFilename: z.string().trim().min(1).max(240),
  fileSize: z.number().int().min(1).max(20 * 1024 * 1024),
  downloadedAt: z.string().datetime().optional(),
});

type DownloadRow = {
  id: string;
  driverId: string;
  documentId: string;
  storagePath: string;
  originalFilename: string;
  fileSize: number | null;
  downloadedAt: Date;
  nextDueAt: Date;
  source: string;
  status: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
};

function asPayload(row: DownloadRow) {
  const now = Date.now();
  const next = row.nextDueAt.getTime();
  const daysRemaining = Math.ceil((next - now) / 86_400_000);
  return {
    id: row.id,
    driverId: row.driverId,
    driverName: `${row.firstName} ${row.lastName}`,
    documentId: row.documentId,
    storagePath: row.storagePath,
    originalFilename: row.originalFilename,
    fileSize: row.fileSize,
    downloadedAt: row.downloadedAt.toISOString(),
    nextDueAt: row.nextDueAt.toISOString(),
    daysRemaining,
    dueState: daysRemaining < 0 ? "OVERDUE" : daysRemaining <= 7 ? "DUE_SOON" : "CURRENT",
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export const tachographRouter = Router();
tachographRouter.use(requireAuth);

tachographRouter.get("/", officeReaders, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<DownloadRow[]>`
    SELECT t.id::text,t."driverId",t."documentId",doc."fileUrl" AS "storagePath",t."originalFilename",t."fileSize",t."downloadedAt",t."nextDueAt",t.source,t.status,t."createdAt",
      d."firstName",d."lastName"
    FROM "TachographDownload" t
    JOIN "Driver" d ON d.id=t."driverId" AND d."companyId"=t."companyId"
    JOIN "Document" doc ON doc.id=t."documentId" AND doc."companyId"=t."companyId"
    WHERE t."companyId"=${req.user!.companyId}
    ORDER BY t."downloadedAt" DESC
    LIMIT 500
  `;
  res.json(rows.map(asPayload));
}));

tachographRouter.get("/me", asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<DownloadRow[]>`
    SELECT t.id::text,t."driverId",t."documentId",doc."fileUrl" AS "storagePath",t."originalFilename",t."fileSize",t."downloadedAt",t."nextDueAt",t.source,t.status,t."createdAt",
      d."firstName",d."lastName"
    FROM "TachographDownload" t
    JOIN "Driver" d ON d.id=t."driverId" AND d."companyId"=t."companyId"
    JOIN "Person" p ON p.id=d."personId" AND p."companyId"=d."companyId"
    JOIN "Document" doc ON doc.id=t."documentId" AND doc."companyId"=t."companyId"
    WHERE t."companyId"=${req.user!.companyId} AND p."userId"=${req.user!.id}
    ORDER BY t."downloadedAt" DESC
    LIMIT 25
  `;
  res.json(rows.map(asPayload));
}));

tachographRouter.post("/", officeWriters, asyncHandler(async (req, res) => {
  const input = uploadSchema.parse(req.body);
  const companyId = req.user!.companyId;
  if (!input.storagePath.startsWith(`${companyId}/`)) return res.status(400).json({ error: "Tachograph file path does not belong to the selected company" });
  if (!/\.ddd$/i.test(input.originalFilename)) return res.status(400).json({ error: "Choose an original .ddd tachograph download file" });

  const driver = await prisma.driver.findFirst({ where: { id: input.driverId, companyId }, select: { id: true, firstName: true, lastName: true } });
  if (!driver) return res.status(404).json({ error: "Driver not found in this company" });

  const downloadedAt = input.downloadedAt ? new Date(input.downloadedAt) : new Date();
  if (Number.isNaN(downloadedAt.getTime()) || downloadedAt.getTime() > Date.now() + 5 * 60_000) return res.status(400).json({ error: "Download time is invalid" });
  const nextDueAt = new Date(downloadedAt.getTime() + 28 * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const document = await tx.document.create({ data: {
      companyId,
      name: `Tachograph card download - ${driver.firstName} ${driver.lastName} - ${downloadedAt.toISOString().slice(0, 10)}`,
      fileUrl: input.storagePath,
      type: "DRIVER_DOCUMENT",
      fileSize: input.fileSize,
      mimeType: "application/octet-stream",
      uploadedById: req.user!.id,
      driverId: driver.id,
    } });
    const rows = await tx.$queryRaw<DownloadRow[]>`
      INSERT INTO "TachographDownload" ("companyId","driverId","documentId","originalFilename","fileSize","downloadedAt","nextDueAt","createdById")
      VALUES (${companyId},${driver.id},${document.id},${input.originalFilename},${input.fileSize},${downloadedAt},${nextDueAt},${req.user!.id})
      RETURNING id::text,"driverId","documentId",${input.storagePath}::text AS "storagePath","originalFilename","fileSize","downloadedAt","nextDueAt",source,status,"createdAt",${driver.firstName}::text AS "firstName",${driver.lastName}::text AS "lastName"
    `;
    return rows[0];
  });

  await writeAuditEvent({
    companyId,
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: "CREATE",
    entityType: "TACHOGRAPH_DOWNLOAD",
    entityId: result.id,
    summary: `Driver card download recorded for ${driver.firstName} ${driver.lastName}`,
    metadata: { driverId: driver.id, downloadedAt: downloadedAt.toISOString(), nextDueAt: nextDueAt.toISOString() },
  });

  res.status(201).json(asPayload(result));
}));
