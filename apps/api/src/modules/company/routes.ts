import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireIdentity, requireRoles } from "../../middleware/auth.js";

export const companyRouter = Router();

const allowedIndustries = new Set(["HAULAGE", "LOGISTICS", "DRAINAGE", "CONSTRUCTION", "UTILITIES", "PLANT", "SERVICE", "OTHER"]);
const allowedSchemes = new Set(["FORS", "CLOCS", "DVSA_EARNED_RECOGNITION", "ISO_9001", "ISO_14001", "ISO_45001"]);
const allowedLicenceTypes = new Set(["RESTRICTED", "STANDARD_NATIONAL", "STANDARD_INTERNATIONAL"]);
const managerRoles = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"] as const;
const backupTables = [
  "Depot", "Person", "Vehicle", "Driver", "Job", "Defect", "ComplianceItem", "RegisterItem",
  "MaintenancePlan", "MaintenanceWorkOrder", "Document", "DriverActivity", "Conversation",
  "ConversationMember", "Message", "MarketplaceListing", "MarketplaceInquiry",
  "DriverWalkaroundCheck", "DriverBreakdown", "StaffAbsenceRequest", "DriverTrainingRecord",
] as const;

type Snapshot = { format: "fleetos-backup-v1"; generatedAt: string; companyId: string; tables: Record<string, unknown[]> };
type ControlRow = {
  subscriptionPlan: string; subscriptionStatus: string; billingEmail: string | null; seatLimit: number;
  retentionDays: number; privacyContactEmail: string | null; customDomain: string | null;
  customDomainVerified: boolean; emailSenderDomain: string | null; emailDomainVerified: boolean;
};

const controlUpdate = z.object({
  billingEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  privacyContactEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  retentionDays: z.number().int().min(365).max(3650).optional(),
  customDomain: z.string().trim().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i).or(z.literal("")).optional(),
  emailSenderDomain: z.string().trim().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i).or(z.literal("")).optional(),
  subscriptionPlan: z.enum(["EARLY_ACCESS", "STARTER", "GROWTH", "ENTERPRISE"]).optional(),
  subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  seatLimit: z.number().int().min(1).max(10000).optional(),
  customDomainVerified: z.boolean().optional(),
  emailDomainVerified: z.boolean().optional(),
});
const governanceCreate = z.object({
  type: z.enum(["ACCESS", "ERASURE", "RECTIFICATION", "RESTRICTION"]),
  subjectName: z.string().trim().min(2).max(160),
  subjectEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  notes: z.string().trim().max(3000).optional(),
});
const governanceUpdate = z.object({ status: z.enum(["OPEN", "IN_REVIEW", "COMPLETED", "CANCELLED"]) });
const backupCreate = z.object({ label: z.string().trim().min(2).max(120).optional(), keepDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90) });

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "fleet";
}
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cleanList(value: unknown, allowed: Set<string>) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))] : [];
}
function profileFromBody(body: Record<string, unknown> | undefined) {
  const operatorLicenceType = clean(body?.operatorLicenceType, 40);
  return {
    address: clean(body?.address, 240) || null,
    postcode: clean(body?.postcode, 20) || null,
    phone: clean(body?.phone, 40) || null,
    industries: cleanList(body?.industries, allowedIndustries),
    teamSize: clean(body?.teamSize, 40) || null,
    operatorLicenceNumber: clean(body?.operatorLicenceNumber, 60) || null,
    operatorLicenceType: allowedLicenceTypes.has(operatorLicenceType) ? operatorLicenceType : null,
    complianceSchemes: cleanList(body?.complianceSchemes, allowedSchemes),
    homeDepotName: clean(body?.homeDepotName, 120) || null,
    countryCode: clean(body?.countryCode, 2).toUpperCase() || "GB",
    usesHgv: body?.usesHgv === true,
  };
}

async function ensureControl(companyId: string, email: string) {
  await prisma.$executeRaw`
    INSERT INTO "CompanyControl" ("companyId","billingEmail","privacyContactEmail","createdAt","updatedAt")
    VALUES (${companyId},${email},${email},NOW(),NOW()) ON CONFLICT ("companyId") DO NOTHING
  `;
  const rows = await prisma.$queryRaw<ControlRow[]>`
    SELECT "subscriptionPlan","subscriptionStatus","billingEmail","seatLimit","retentionDays","privacyContactEmail",
      "customDomain","customDomainVerified","emailSenderDomain","emailDomainVerified"
    FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
  `;
  return rows[0];
}

async function buildSnapshot(companyId: string): Promise<Snapshot> {
  const entries = await Promise.all(backupTables.map(async (table) => {
    const rows = table === "ConversationMember"
      ? await prisma.$queryRawUnsafe<unknown[]>(`SELECT cm.* FROM "ConversationMember" cm JOIN "Conversation" c ON c.id=cm."conversationId" WHERE c."companyId"=$1`, companyId)
      : table === "MarketplaceInquiry"
        ? await prisma.$queryRawUnsafe<unknown[]>(`SELECT inquiry.* FROM "MarketplaceInquiry" inquiry JOIN "MarketplaceListing" listing ON listing.id=inquiry."listingId" WHERE inquiry."fromCompanyId"=$1 OR listing."companyId"=$1`, companyId)
      : await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table}" WHERE "companyId"=$1`, companyId);
    return [table, rows] as const;
  }));
  return { format: "fleetos-backup-v1", generatedAt: new Date().toISOString(), companyId, tables: Object.fromEntries(entries) };
}

function recordCounts(snapshot: Snapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
}

companyRouter.get("/workspaces", requireIdentity, asyncHandler(async (_req, res) => {
  const memberships = await prisma.companyMembership.findMany({
    where: { userId: res.locals.identity.id }, orderBy: { createdAt: "asc" },
    select: { role: true, company: { select: { id: true, name: true, slug: true } } },
  });
  return res.json(memberships.map((m) => ({ ...m.company, role: m.role })));
}));

companyRouter.post("/workspaces", requireIdentity, asyncHandler(async (req, res) => {
  const name = clean(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: "Company name is required" });
  const ownerId = res.locals.identity.id;
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await prisma.company.findUnique({ where: { slug } }); i += 1) slug = `${base}-${i}`.slice(0, 50);
  const profile = profileFromBody(req.body);
  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({ data: { name, slug, ownerId, ...profile } });
    await tx.companyMembership.create({ data: { userId: ownerId, companyId: created.id, role: "COMPANY_ADMIN" } });
    await tx.$executeRaw`INSERT INTO "CompanyControl" ("companyId","billingEmail","privacyContactEmail") VALUES (${created.id},${res.locals.identity.email},${res.locals.identity.email})`;
    return created;
  });
  await writeAuditEvent({ companyId: company.id, actorUserId: ownerId, actorEmail: res.locals.identity.email, action: "CREATE", entityType: "COMPANY", entityId: company.id, summary: `Created company workspace ${company.name}` });
  return res.status(201).json({ id: company.id, name: company.name, slug: company.slug, role: "COMPANY_ADMIN" });
}));

companyRouter.get("/admin", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const [control, memberCount, vehicles, activeDrivers, documents, backups, governance] = await Promise.all([
    ensureControl(companyId, req.user!.email),
    prisma.companyMembership.count({ where: { companyId } }),
    prisma.vehicle.count({ where: { companyId } }),
    prisma.driver.count({ where: { companyId, isActive: true } }),
    prisma.document.count({ where: { companyId } }),
    prisma.$queryRaw<Array<{ id: string; label: string; recordCounts: unknown; createdAt: Date; expiresAt: Date }>>`
      SELECT id::text,label,"recordCounts","createdAt","expiresAt" FROM "CompanyBackup"
      WHERE "companyId"=${companyId} AND "expiresAt">NOW() ORDER BY "createdAt" DESC LIMIT 25
    `,
    prisma.$queryRaw<Array<{ id: string; type: string; status: string; subjectName: string; subjectEmail: string | null; notes: string | null; dueAt: Date; completedAt: Date | null; createdAt: Date }>>`
      SELECT id::text,type,status,"subjectName","subjectEmail",notes,"dueAt","completedAt","createdAt"
      FROM "DataGovernanceRequest" WHERE "companyId"=${companyId} ORDER BY "createdAt" DESC LIMIT 100
    `,
  ]);
  res.json({
    control,
    usage: { members: memberCount, seatsAvailable: Math.max(0, control.seatLimit - memberCount), vehicles, activeDrivers, documents },
    readiness: {
      productionUrl: "https://fleetos-orpin-one.vercel.app",
      authenticationRedirect: "READY",
      databaseRegion: "London, UK (eu-west-2)",
      portableBackup: "READY",
      customDomain: control.customDomainVerified ? "READY" : control.customDomain ? "VERIFY_DNS" : "NOT_CONFIGURED",
      emailSender: control.emailDomainVerified ? "READY" : control.emailSenderDomain ? "VERIFY_DNS" : "NOT_CONFIGURED",
    },
    backups,
    governance,
  });
}));

companyRouter.patch("/admin", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const input = controlUpdate.parse(req.body);
  const platformFields: {
    subscriptionPlan?: "EARLY_ACCESS" | "STARTER" | "GROWTH" | "ENTERPRISE";
    subscriptionStatus?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
    seatLimit?: number; customDomainVerified?: boolean; emailDomainVerified?: boolean;
  } = req.user!.role === "PLATFORM_ADMIN" ? {
    ...(input.subscriptionPlan ? { subscriptionPlan: input.subscriptionPlan } : {}),
    ...(input.subscriptionStatus ? { subscriptionStatus: input.subscriptionStatus } : {}),
    ...(input.seatLimit !== undefined ? { seatLimit: input.seatLimit } : {}),
    ...(input.customDomainVerified !== undefined ? { customDomainVerified: input.customDomainVerified } : {}),
    ...(input.emailDomainVerified !== undefined ? { emailDomainVerified: input.emailDomainVerified } : {}),
  } : {};
  await ensureControl(req.user!.companyId, req.user!.email);
  const updateBillingEmail = input.billingEmail !== undefined;
  const updatePrivacyEmail = input.privacyContactEmail !== undefined;
  const updateCustomDomain = input.customDomain !== undefined;
  const updateSenderDomain = input.emailSenderDomain !== undefined;
  const rows = await prisma.$queryRaw<ControlRow[]>`
    UPDATE "CompanyControl" SET
      "billingEmail"=CASE WHEN ${updateBillingEmail} THEN ${input.billingEmail || null} ELSE "billingEmail" END,
      "privacyContactEmail"=CASE WHEN ${updatePrivacyEmail} THEN ${input.privacyContactEmail || null} ELSE "privacyContactEmail" END,
      "retentionDays"=COALESCE(${input.retentionDays ?? null},"retentionDays"),
      "customDomain"=CASE WHEN ${updateCustomDomain} THEN ${input.customDomain || null} ELSE "customDomain" END,
      "emailSenderDomain"=CASE WHEN ${updateSenderDomain} THEN ${input.emailSenderDomain || null} ELSE "emailSenderDomain" END,
      "subscriptionPlan"=COALESCE(${platformFields.subscriptionPlan ?? null},"subscriptionPlan"),
      "subscriptionStatus"=COALESCE(${platformFields.subscriptionStatus ?? null},"subscriptionStatus"),
      "seatLimit"=COALESCE(${platformFields.seatLimit ?? null},"seatLimit"),
      "customDomainVerified"=COALESCE(${platformFields.customDomainVerified ?? null},"customDomainVerified"),
      "emailDomainVerified"=COALESCE(${platformFields.emailDomainVerified ?? null},"emailDomainVerified"),
      "updatedAt"=NOW()
    WHERE "companyId"=${req.user!.companyId}
    RETURNING "subscriptionPlan","subscriptionStatus","billingEmail","seatLimit","retentionDays","privacyContactEmail",
      "customDomain","customDomainVerified","emailSenderDomain","emailDomainVerified"
  `;
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "BUSINESS_CONTROLS", entityId: req.user!.companyId, summary: "Updated company billing, privacy or readiness controls" });
  res.json(rows[0]);
}));

companyRouter.get("/export", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const [company, memberships, snapshot] = await Promise.all([
    prisma.company.findUnique({ where: { id: req.user!.companyId } }),
    prisma.companyMembership.findMany({ where: { companyId: req.user!.companyId }, select: { role: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } } } }),
    buildSnapshot(req.user!.companyId),
  ]);
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "EXPORT", entityType: "COMPANY_DATA", entityId: req.user!.companyId, summary: "Downloaded a portable company data export" });
  res.setHeader("Content-Disposition", `attachment; filename="fleetos-${company?.slug ?? "company"}-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ format: "fleetos-portable-export-v1", generatedAt: new Date().toISOString(), companyId: snapshot.companyId, company, memberships, tables: snapshot.tables, recordCounts: recordCounts(snapshot) });
}));

companyRouter.post("/backups", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const input = backupCreate.parse(req.body ?? {});
  const snapshot = await buildSnapshot(req.user!.companyId);
  const counts = recordCounts(snapshot);
  const snapshotJson = JSON.stringify(snapshot);
  const countsJson = JSON.stringify(counts);
  const expiresAt = new Date(Date.now() + input.keepDays * 86400000);
  const label = input.label || `Manual backup ${new Date().toLocaleDateString("en-GB")}`;
  const rows = await prisma.$queryRaw<Array<{ id: string; label: string; recordCounts: unknown; createdAt: Date; expiresAt: Date }>>`
    INSERT INTO "CompanyBackup" ("companyId",label,"createdById","recordCounts",snapshot,"expiresAt")
    VALUES (${req.user!.companyId},${label},${req.user!.id},${countsJson}::jsonb,${snapshotJson}::jsonb,${expiresAt})
    RETURNING id::text,label,"recordCounts","createdAt","expiresAt"
  `;
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "COMPANY_BACKUP", entityId: rows[0].id, summary: `Created company backup: ${label}`, metadata: counts });
  res.status(201).json(rows[0]);
}));

companyRouter.get("/backups/:id", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<Array<{ label: string; snapshot: Snapshot }>>`
    SELECT label,snapshot FROM "CompanyBackup" WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId} AND "expiresAt">NOW() LIMIT 1
  `;
  if (!rows[0]) return res.status(404).json({ error: "Backup not found or expired" });
  res.setHeader("Content-Disposition", `attachment; filename="fleetos-backup-${req.params.id}.json"`);
  res.json(rows[0].snapshot);
}));

companyRouter.post("/backups/:id/restore", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  if (req.body?.confirmation !== "RESTORE MISSING RECORDS") return res.status(400).json({ error: "Type RESTORE MISSING RECORDS to confirm" });
  const rows = await prisma.$queryRaw<Array<{ label: string; snapshot: Snapshot }>>`
    SELECT label,snapshot FROM "CompanyBackup" WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId} AND "expiresAt">NOW() LIMIT 1
  `;
  const backup = rows[0];
  if (!backup || backup.snapshot.companyId !== req.user!.companyId || backup.snapshot.format !== "fleetos-backup-v1") return res.status(404).json({ error: "Valid company backup not found" });

  const restored: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    for (const table of backupTables) {
      const data = backup.snapshot.tables[table] ?? [];
      if (!data.length) { restored[table] = 0; continue; }
      const query = table === "ConversationMember"
        ? `INSERT INTO "ConversationMember" SELECT source.* FROM jsonb_populate_recordset(NULL::"ConversationMember", $1::jsonb) AS source WHERE source."conversationId" IN (SELECT id FROM "Conversation" WHERE "companyId"=$2) ON CONFLICT DO NOTHING`
        : table === "MarketplaceInquiry"
          ? `INSERT INTO "MarketplaceInquiry" SELECT source.* FROM jsonb_populate_recordset(NULL::"MarketplaceInquiry", $1::jsonb) AS source WHERE source."fromCompanyId"=$2 OR source."listingId" IN (SELECT id FROM "MarketplaceListing" WHERE "companyId"=$2) ON CONFLICT DO NOTHING`
        : `INSERT INTO "${table}" SELECT source.* FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb) AS source WHERE source."companyId"=$2 ON CONFLICT DO NOTHING`;
      restored[table] = await tx.$executeRawUnsafe(query, JSON.stringify(data), req.user!.companyId);
    }
  }, { timeout: 60_000 });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "RESTORE", entityType: "COMPANY_BACKUP", entityId: req.params.id, summary: `Restored missing records from backup: ${backup.label}`, metadata: restored });
  res.json({ ok: true, restored, note: "Only missing records were restored. Newer live records were not overwritten." });
}));

companyRouter.delete("/backups/:id", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const count = await prisma.$executeRaw`DELETE FROM "CompanyBackup" WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId}`;
  if (!count) return res.status(404).json({ error: "Backup not found" });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "DELETE", entityType: "COMPANY_BACKUP", entityId: req.params.id, summary: "Deleted a company backup" });
  res.status(204).end();
}));

companyRouter.post("/governance-requests", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const input = governanceCreate.parse(req.body);
  const rows = await prisma.$queryRaw<Array<{ id: string; type: string; status: string; subjectName: string; subjectEmail: string | null; notes: string | null; dueAt: Date; createdAt: Date }>>`
    INSERT INTO "DataGovernanceRequest" ("companyId",type,"subjectName","subjectEmail",notes,"requestedById","dueAt","createdAt","updatedAt")
    VALUES (${req.user!.companyId},${input.type},${input.subjectName},${input.subjectEmail || null},${input.notes || null},${req.user!.id},NOW()+INTERVAL '30 days',NOW(),NOW())
    RETURNING id::text,type,status,"subjectName","subjectEmail",notes,"dueAt","createdAt"
  `;
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "DATA_GOVERNANCE_REQUEST", entityId: rows[0].id, summary: `Opened ${input.type.toLowerCase()} request for ${input.subjectName}` });
  res.status(201).json(rows[0]);
}));

companyRouter.patch("/governance-requests/:id", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const input = governanceUpdate.parse(req.body);
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; completedAt: Date | null }>>`
    UPDATE "DataGovernanceRequest" SET status=${input.status},"assignedToId"=${req.user!.id},
      "completedAt"=${input.status === "COMPLETED" ? new Date() : null},"updatedAt"=NOW()
    WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId}
    RETURNING id::text,status,"completedAt"
  `;
  if (!rows[0]) return res.status(404).json({ error: "Data governance request not found" });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "DATA_GOVERNANCE_REQUEST", entityId: req.params.id, summary: `Data governance request marked ${input.status.replaceAll("_", " ").toLowerCase()}` });
  res.json(rows[0]);
}));

companyRouter.get("/retention-preview", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const control = await ensureControl(req.user!.companyId, req.user!.email);
  const rows = await prisma.$queryRaw<Array<{ auditEvents: bigint; medicIncidents: bigint; expiredBackups: bigint; governanceRequests: bigint }>>`
    SELECT
      (SELECT COUNT(*) FROM "AuditEvent" WHERE "companyId"=${req.user!.companyId} AND "createdAt"<NOW()-(${control.retentionDays}*INTERVAL '1 day'))::bigint AS "auditEvents",
      (SELECT COUNT(*) FROM "MedicIncident" WHERE "companyId"=${req.user!.companyId} AND status IN ('RESOLVED','RECOVERED') AND "createdAt"<NOW()-(${control.retentionDays}*INTERVAL '1 day'))::bigint AS "medicIncidents",
      (SELECT COUNT(*) FROM "CompanyBackup" WHERE "companyId"=${req.user!.companyId} AND "expiresAt"<NOW())::bigint AS "expiredBackups",
      (SELECT COUNT(*) FROM "DataGovernanceRequest" WHERE "companyId"=${req.user!.companyId} AND status IN ('COMPLETED','CANCELLED') AND "updatedAt"<NOW()-(${control.retentionDays}*INTERVAL '1 day'))::bigint AS "governanceRequests"
  `;
  const row = rows[0];
  res.json({ retentionDays: control.retentionDays, records: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) });
}));

companyRouter.post("/retention-run", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  if (req.body?.confirmation !== "APPLY RETENTION") return res.status(400).json({ error: "Type APPLY RETENTION to confirm" });
  const control = await ensureControl(req.user!.companyId, req.user!.email);
  const [auditEvents, medicIncidents, expiredBackups, governanceRequests] = await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "AuditEvent" WHERE "companyId"=${req.user!.companyId} AND "createdAt"<NOW()-(${control.retentionDays}*INTERVAL '1 day')`,
    prisma.$executeRaw`DELETE FROM "MedicIncident" WHERE "companyId"=${req.user!.companyId} AND status IN ('RESOLVED','RECOVERED') AND "createdAt"<NOW()-(${control.retentionDays}*INTERVAL '1 day')`,
    prisma.$executeRaw`DELETE FROM "CompanyBackup" WHERE "companyId"=${req.user!.companyId} AND "expiresAt"<NOW()`,
    prisma.$executeRaw`DELETE FROM "DataGovernanceRequest" WHERE "companyId"=${req.user!.companyId} AND status IN ('COMPLETED','CANCELLED') AND "updatedAt"<NOW()-(${control.retentionDays}*INTERVAL '1 day')`,
  ]);
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "DELETE", entityType: "DATA_RETENTION", entityId: req.user!.companyId, summary: "Applied the company retention policy", metadata: { retentionDays: control.retentionDays, auditEvents, medicIncidents, expiredBackups, governanceRequests } });
  res.json({ auditEvents, medicIncidents, expiredBackups, governanceRequests });
}));

companyRouter.get("/", requireAuth, asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.user!.companyId },
    select: { id: true, name: true, slug: true, address: true, postcode: true, phone: true, industries: true, teamSize: true, operatorLicenceNumber: true, operatorLicenceType: true, complianceSchemes: true, homeDepotName: true, countryCode: true, usesHgv: true },
  });
  if (!company) return res.status(404).json({ error: "Company not found" });
  return res.json(company);
}));

companyRouter.patch("/", requireAuth, requireRoles(...managerRoles), asyncHandler(async (req, res) => {
  const name = clean(req.body?.name, 120);
  const company = await prisma.company.update({
    where: { id: req.user!.companyId }, data: { ...(name ? { name } : {}), ...profileFromBody(req.body) },
    select: { id: true, name: true, slug: true, address: true, postcode: true, phone: true, industries: true, teamSize: true, operatorLicenceNumber: true, operatorLicenceType: true, complianceSchemes: true, homeDepotName: true, countryCode: true, usesHgv: true },
  });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "UPDATE", entityType: "COMPANY", entityId: company.id, summary: `Updated company settings for ${company.name}` });
  return res.json(company);
}));


