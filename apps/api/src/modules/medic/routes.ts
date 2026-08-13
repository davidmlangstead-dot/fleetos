import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

const medicRoles = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"] as const;
const eventSchema = z.object({
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("WARNING"),
  code: z.string().trim().min(2).max(80),
  source: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(2).max(240),
  detail: z.string().trim().max(3000).optional(),
  recovery: z.string().trim().max(1000).optional(),
  recovered: z.boolean().optional(),
});

export const medicRouter = Router();

/** Public liveness check. It deliberately reveals no tenant or secret data. */
medicRouter.get("/", async (_req, res) => {
  const checks: Record<string, { status: "PASS" | "WARN" | "FAIL"; detail: string; latencyMs?: number }> = {};
  checks.api = { status: "PASS", detail: "FleetOS API is responding." };
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    checks.database = latencyMs < 750
      ? { status: "PASS", detail: "Database connection and query succeeded.", latencyMs }
      : { status: "WARN", detail: "Database responded, but more slowly than expected.", latencyMs };
  } catch {
    checks.database = { status: "FAIL", detail: "Database health check failed." };
  }
  const failed = Object.values(checks).filter((check) => check.status === "FAIL").length;
  const warnings = Object.values(checks).filter((check) => check.status === "WARN").length;
  res.status(failed ? 503 : 200).json({
    service: "FleetOS Medic",
    status: failed ? "FAIL" : warnings ? "WARN" : "PASS",
    checkedAt: new Date().toISOString(),
    checks,
  });
});

medicRouter.get("/status", requireAuth, requireRoles(...medicRoles), asyncHandler(async (req, res) => {
  let database: { status: "HEALTHY" | "DEGRADED"; latencyMs: number; detail: string };
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    database = {
      status: latencyMs < 750 ? "HEALTHY" : "DEGRADED",
      latencyMs,
      detail: latencyMs < 750 ? "Database responded normally." : "Database responded, but more slowly than expected.",
    };
  } catch {
    database = { status: "DEGRADED", latencyMs: 0, detail: "Database health check failed." };
  }

  const [membershipCount, recentIncidents, openCount, securityRows, stuckRows] = await Promise.all([
    prisma.companyMembership.count({ where: { companyId: req.user!.companyId } }),
    prisma.$queryRaw<Array<{ id: string; severity: string; status: string; code: string; source: string; summary: string; detail: string | null; recovery: string | null; createdAt: Date; resolvedAt: Date | null }>>`
      SELECT id::text, severity, status, code, source, summary, detail, recovery, "createdAt", "resolvedAt"
      FROM "MedicIncident"
      WHERE "companyId" = ${req.user!.companyId}
      ORDER BY "createdAt" DESC
      LIMIT 30
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM "MedicIncident"
      WHERE "companyId" = ${req.user!.companyId} AND status = 'OPEN'
    `,
    prisma.$queryRaw<Array<{ total: bigint; protected: bigint; exposed: bigint }>>`
      SELECT COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE c.relrowsecurity)::bigint AS protected,
        COUNT(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))::bigint AS exposed
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations'
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "IdempotencyRequest"
      WHERE "companyId"=${req.user!.companyId} AND state='PROCESSING' AND "updatedAt" < NOW()-INTERVAL '5 minutes'
    `,
  ]);

  const security = securityRows[0];
  const totalTables = Number(security?.total ?? 0n);
  const protectedTables = Number(security?.protected ?? 0n);
  const exposedTables = Number(security?.exposed ?? 0n);
  const stuckChanges = Number(stuckRows[0]?.count ?? 0n);
  const securityHealthy = totalTables > 0 && protectedTables === totalTables && exposedTables === 0;
  const checks = [
    { key: "api", label: "FleetOS API", status: "HEALTHY", detail: "Medic reached the authenticated API." },
    { key: "database", label: "Database", status: database.status, detail: database.detail, latencyMs: database.latencyMs },
    { key: "auth", label: "Authentication", status: "HEALTHY", detail: "Supabase validated this session." },
    { key: "tenant", label: "Tenant access", status: membershipCount > 0 ? "HEALTHY" : "DEGRADED", detail: membershipCount > 0 ? `${membershipCount} company membership${membershipCount === 1 ? "" : "s"} found.` : "No company memberships were found." },
    { key: "database-security", label: "Database tenant safeguards", status: securityHealthy ? "HEALTHY" : "DEGRADED", detail: securityHealthy ? `${protectedTables}/${totalTables} customer tables have row-level protection; no direct browser table access is exposed.` : `${protectedTables}/${totalTables} tables protected; ${exposedTables} direct-access exposure${exposedTables === 1 ? "" : "s"} detected.` },
    { key: "offline-replay", label: "Offline duplicate protection", status: stuckChanges === 0 ? "HEALTHY" : "DEGRADED", detail: stuckChanges === 0 ? "No offline changes are stuck in the replay ledger." : `${stuckChanges} offline change${stuckChanges === 1 ? " is" : "s are"} stuck and need review.` },
  ];
  const openIncidents = Number(openCount[0]?.count ?? 0n);
  const overall = checks.some((check) => check.status === "DEGRADED") ? "DEGRADED" : openIncidents > 0 ? "ATTENTION" : "HEALTHY";

  res.json({
    overall,
    checkedAt: new Date().toISOString(),
    authority: {
      observe: true,
      safeRecovery: true,
      destructiveRecovery: false,
      automaticDeployments: false,
      automaticSecurityChanges: false,
    },
    checks,
    openIncidents,
    recentIncidents,
  });
}));

medicRouter.post("/events", requireAuth, asyncHandler(async (req, res) => {
  const input = eventSchema.parse(req.body);
  const status = input.recovered ? "RECOVERED" : "OPEN";
  const rows = await prisma.$queryRaw<Array<{ id: string; createdAt: Date }>>`
    INSERT INTO "MedicIncident" ("companyId", "actorUserId", severity, status, code, source, summary, detail, recovery, "resolvedAt")
    VALUES (${req.user!.companyId}, ${req.user!.id}, ${input.severity}, ${status}, ${input.code}, ${input.source}, ${input.summary}, ${input.detail ?? null}, ${input.recovery ?? null}, ${input.recovered ? new Date() : null})
    RETURNING id::text, "createdAt"
  `;
  res.status(201).json(rows[0]);
}));

medicRouter.patch("/incidents/:id/resolve", requireAuth, requireRoles(...medicRoles), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; resolvedAt: Date | null }>>`
    UPDATE "MedicIncident"
    SET status = 'RESOLVED', "resolvedAt" = now(), "updatedAt" = now()
    WHERE id = ${req.params.id}::uuid AND "companyId" = ${req.user!.companyId}
    RETURNING id::text, status, "resolvedAt"
  `;
  if (!rows[0]) return res.status(404).json({ error: "Medic incident not found" });
  res.json(rows[0]);
}));

