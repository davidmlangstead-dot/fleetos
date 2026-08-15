import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { config } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const officeReaders = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const officeWriters = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const parserVersion = "tachograph-go@95ca68093ad6";

const uploadSchema = z.object({
  driverId: z.string().trim().min(1),
  storagePath: z.string().trim().min(1).max(600),
  originalFilename: z.string().trim().min(1).max(240),
  fileSize: z.number().int().min(1).max(20 * 1024 * 1024),
  downloadedAt: z.string().datetime().optional(),
});

const parserResponseSchema = z.object({
  ok: z.boolean(),
  fileType: z.string().optional(),
  authenticated: z.boolean().optional(),
  parsedAt: z.string().optional(),
  data: z.unknown().optional(),
  error: z.string().optional(),
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
  parseStatus: string;
  parsedFileType: string | null;
  parsedAt: Date | null;
  parserVersion: string | null;
  parseError: string | null;
  signatureStatus: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
};

type ParseSourceRow = { id: string; storagePath: string };

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
    parseStatus: row.parseStatus,
    parsedFileType: row.parsedFileType,
    parsedAt: row.parsedAt?.toISOString() ?? null,
    parserVersion: row.parserVersion,
    parseError: row.parseError,
    signatureStatus: row.signatureStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

const downloadSelect = `
  SELECT t.id::text,t."driverId",t."documentId",doc."fileUrl" AS "storagePath",t."originalFilename",t."fileSize",t."downloadedAt",t."nextDueAt",t.source,t.status,
    t."parseStatus",t."parsedFileType",t."parsedAt",t."parserVersion",t."parseError",t."signatureStatus",t."createdAt",d."firstName",d."lastName"
  FROM "TachographDownload" t
  JOIN "Driver" d ON d.id=t."driverId" AND d."companyId"=t."companyId"
  JOIN "Document" doc ON doc.id=t."documentId" AND doc."companyId"=t."companyId"
`;

async function getDownload(companyId: string, id: string) {
  const rows = await prisma.$queryRawUnsafe<DownloadRow[]>(`${downloadSelect} WHERE t."companyId"=$1 AND t.id=$2::uuid LIMIT 1`, companyId, id);
  return rows[0] ?? null;
}

async function parseStoredDownload(companyId: string, id: string) {
  const rows = await prisma.$queryRaw<ParseSourceRow[]>`
    SELECT t.id::text,doc."fileUrl" AS "storagePath"
    FROM "TachographDownload" t JOIN "Document" doc ON doc.id=t."documentId" AND doc."companyId"=t."companyId"
    WHERE t."companyId"=${companyId} AND t.id=${id}::uuid LIMIT 1
  `;
  const record = rows[0];
  if (!record) throw new Error("Tachograph download not found");

  await prisma.$executeRaw`UPDATE "TachographDownload" SET "parseStatus"='PENDING',"parseError"=NULL,"updatedAt"=NOW() WHERE id=${id}::uuid AND "companyId"=${companyId}`;

  try {
    if (!config.TACHO_PARSER_URL || !config.TACHO_PARSER_SECRET || !config.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Tachograph decoder is not fully configured");
    }

    const storage = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: file, error: storageError } = await storage.storage.from("fleet-documents").download(record.storagePath);
    if (storageError || !file) throw new Error("Original tachograph file could not be read from private storage");
    if (file.size > 20 * 1024 * 1024) throw new Error("Tachograph file exceeds the decoder limit");

    const response = await fetch(`${config.TACHO_PARSER_URL.replace(/\/$/, "")}/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-fleetos-parser-secret": config.TACHO_PARSER_SECRET,
      },
      body: Buffer.from(await file.arrayBuffer()),
      signal: AbortSignal.timeout(45_000),
    });
    const parsed = parserResponseSchema.parse(await response.json());
    if (!response.ok || !parsed.ok || !parsed.fileType || parsed.data == null) {
      throw new Error(parsed.error || "Tachograph decoder rejected the file");
    }

    const parsedData = JSON.stringify(parsed.data);
    await prisma.$executeRaw`
      UPDATE "TachographDownload"
      SET "parseStatus"='PARSED',"parsedFileType"=${parsed.fileType},"parsedAt"=NOW(),"parserVersion"=${parserVersion},
          "parsedData"=${parsedData}::jsonb,"parseError"=NULL,"signatureStatus"='NOT_VERIFIED',"updatedAt"=NOW()
      WHERE id=${id}::uuid AND "companyId"=${companyId}
    `;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Tachograph decoding failed";
    const safe = detail.includes("not fully configured") ? "Decoder unavailable" : detail.includes("private storage") ? "Original file unavailable" : detail.includes("limit") ? detail : "File could not be decoded yet";
    await prisma.$executeRaw`
      UPDATE "TachographDownload"
      SET "parseStatus"='FAILED',"parseError"=${safe},"parserVersion"=${parserVersion},"signatureStatus"='NOT_VERIFIED',"updatedAt"=NOW()
      WHERE id=${id}::uuid AND "companyId"=${companyId}
    `;
  }

  return getDownload(companyId, id);
}

export const tachographRouter = Router();
tachographRouter.use(requireAuth);

tachographRouter.get("/", officeReaders, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<DownloadRow[]>(`${downloadSelect} WHERE t."companyId"=$1 ORDER BY t."downloadedAt" DESC LIMIT 500`, req.user!.companyId);
  res.json(rows.map(asPayload));
}));

tachographRouter.get("/me", asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<DownloadRow[]>`
    SELECT t.id::text,t."driverId",t."documentId",doc."fileUrl" AS "storagePath",t."originalFilename",t."fileSize",t."downloadedAt",t."nextDueAt",t.source,t.status,
      t."parseStatus",t."parsedFileType",t."parsedAt",t."parserVersion",t."parseError",t."signatureStatus",t."createdAt",d."firstName",d."lastName"
    FROM "TachographDownload" t
    JOIN "Driver" d ON d.id=t."driverId" AND d."companyId"=t."companyId"
    JOIN "Person" p ON p.id=d."personId" AND p."companyId"=d."companyId"
    JOIN "Document" doc ON doc.id=t."documentId" AND doc."companyId"=t."companyId"
    WHERE t."companyId"=${req.user!.companyId} AND p."userId"=${req.user!.id}
    ORDER BY t."downloadedAt" DESC LIMIT 25
  `;
  res.json(rows.map(asPayload));
}));

tachographRouter.get("/:id/parsed", officeReaders, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<Array<{ parseStatus: string; parsedFileType: string | null; parsedAt: Date | null; parserVersion: string | null; signatureStatus: string; parsedData: unknown }>>`
    SELECT "parseStatus","parsedFileType","parsedAt","parserVersion","signatureStatus","parsedData"
    FROM "TachographDownload" WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId} LIMIT 1
  `;
  if (!rows[0]) return res.status(404).json({ error: "Tachograph download not found" });
  res.json({ ...rows[0], parsedAt: rows[0].parsedAt?.toISOString() ?? null });
}));

tachographRouter.post("/:id/reparse", officeWriters, asyncHandler(async (req, res) => {
  const parsed = await parseStoredDownload(req.user!.companyId, req.params.id);
  if (!parsed) return res.status(404).json({ error: "Tachograph download not found" });
  res.json(asPayload(parsed));
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

  const createdId = await prisma.$transaction(async (tx) => {
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
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "TachographDownload" ("companyId","driverId","documentId","originalFilename","fileSize","downloadedAt","nextDueAt","createdById")
      VALUES (${companyId},${driver.id},${document.id},${input.originalFilename},${input.fileSize},${downloadedAt},${nextDueAt},${req.user!.id})
      RETURNING id::text
    `;
    return rows[0].id;
  });

  await writeAuditEvent({
    companyId,
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: "CREATE",
    entityType: "TACHOGRAPH_DOWNLOAD",
    entityId: createdId,
    summary: `Driver card download recorded for ${driver.firstName} ${driver.lastName}`,
    metadata: { driverId: driver.id, downloadedAt: downloadedAt.toISOString(), nextDueAt: nextDueAt.toISOString() },
  });

  const result = await parseStoredDownload(companyId, createdId);
  if (!result) return res.status(500).json({ error: "Tachograph record could not be reloaded" });
  res.status(201).json(asPayload(result));
}));
