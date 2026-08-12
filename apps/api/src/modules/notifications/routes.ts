import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

type Alert = {
  id: string;
  kind: "COMPLIANCE" | "DEFECT" | "MEDIC";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  detail: string | null;
  occurredAt: string;
  href: string;
};

type MedicRow = {
  id: string;
  severity: string;
  summary: string;
  detail: string | null;
  createdAt: Date;
};

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [compliance, defects, medic] = await Promise.all([
    prisma.complianceItem.findMany({
      where: { companyId, status: { not: "RESOLVED" }, dueDate: { lte: soon } },
      select: { id: true, title: true, dueDate: true, description: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    prisma.defect.findMany({
      where: { companyId, status: { not: "RESOLVED" } },
      select: { id: true, title: true, severity: true, createdAt: true, vehicle: { select: { registration: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.$queryRaw<MedicRow[]>`
      SELECT id::text, severity, summary, detail, "createdAt"
      FROM "MedicIncident"
      WHERE "companyId" = ${companyId} AND status <> 'RESOLVED'
      ORDER BY "createdAt" DESC
      LIMIT 20
    `,
  ]);

  const alerts: Alert[] = [];
  for (const item of compliance) {
    const overdue = item.dueDate < now;
    alerts.push({
      id: `compliance:${item.id}`,
      kind: "COMPLIANCE",
      severity: overdue ? "CRITICAL" : "WARNING",
      title: overdue ? `Overdue: ${item.title}` : `Due soon: ${item.title}`,
      detail: item.description,
      occurredAt: item.dueDate.toISOString(),
      href: "/compliance",
    });
  }

  for (const defect of defects) {
    const high = ["HIGH", "CRITICAL", "DANGEROUS"].includes((defect.severity ?? "").toUpperCase());
    alerts.push({
      id: `defect:${defect.id}`,
      kind: "DEFECT",
      severity: high ? "CRITICAL" : "WARNING",
      title: defect.vehicle?.registration ? `${defect.vehicle.registration}: ${defect.title}` : defect.title,
      detail: defect.severity ? `Open defect · ${defect.severity}` : "Open defect",
      occurredAt: defect.createdAt.toISOString(),
      href: "/workshop",
    });
  }

  for (const incident of medic) {
    alerts.push({
      id: `medic:${incident.id}`,
      kind: "MEDIC",
      severity: incident.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: incident.summary,
      detail: incident.detail,
      occurredAt: incident.createdAt.toISOString(),
      href: "/settings/medic",
    });
  }

  const severityRank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.occurredAt.localeCompare(a.occurredAt));
  const visible = alerts.slice(0, 30);
  res.json({
    total: alerts.length,
    critical: alerts.filter((item) => item.severity === "CRITICAL").length,
    items: visible,
  });
}));
