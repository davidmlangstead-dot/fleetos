import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

type GuardianSeverity = "CRITICAL" | "OVERDUE" | "DUE_SOON" | "MISSING_DATA" | "ATTENTION";
type GuardianAlert = {
  id: string;
  severity: GuardianSeverity;
  kind: string;
  label: string;
  subjectType: "COMPANY" | "VEHICLE" | "DRIVER" | "COMPLIANCE" | "MAINTENANCE" | "DEFECT" | "TACHOGRAPH";
  subjectId?: string;
  subjectLabel?: string;
  dueDate?: string;
  daysUntilDue?: number;
  action: string;
  href: string;
};

type MaintenanceRow = {
  id: string;
  vehicleId: string;
  title: string;
  category: string;
  nextDueAt: Date;
  registration: string;
};

type TachoDownloadRow = {
  driverId: string;
  nextDueAt: Date;
};

const guardianReaders = requireRoles(
  "WORKSHOP_TECHNICIAN",
  "TRANSPORT_PLANNER",
  "TRANSPORT_MANAGER",
  "OFFICE_STAFF",
  "COMPANY_ADMIN",
  "PLATFORM_ADMIN",
);

const severityOrder: Record<GuardianSeverity, number> = {
  CRITICAL: 0,
  OVERDUE: 1,
  ATTENTION: 2,
  DUE_SOON: 3,
  MISSING_DATA: 4,
};

function dayDifference(date: Date, now: Date) {
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

export const complianceRouter = Router();
complianceRouter.use(requireAuth);

complianceRouter.get("/guardian", guardianReaders, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86_400_000);

  const [company, vehicles, drivers, complianceItems, defects, maintenance, tachoDownloads] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        usesHgv: true,
        operatorLicenceNumber: true,
        operatorLicenceType: true,
        complianceSchemes: true,
      },
    }),
    prisma.vehicle.findMany({
      where: { companyId, status: "ACTIVE" },
      select: {
        id: true,
        registration: true,
        type: true,
        motDue: true,
        taxDue: true,
        insuranceDue: true,
        tachoCalibrationDue: true,
      },
      orderBy: { registration: "asc" },
      take: 500,
    }),
    prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenceExpiry: true,
        cpcExpiry: true,
        dcpcExpiry: true,
        tachoCardNumber: true,
        tachoCardExpiry: true,
        medicalDue: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    }),
    prisma.complianceItem.findMany({
      where: { companyId, status: { not: "RESOLVED" } },
      select: { id: true, title: true, dueDate: true, vehicleId: true, driverId: true },
      orderBy: { dueDate: "asc" },
      take: 300,
    }),
    prisma.defect.findMany({
      where: { companyId, status: { not: "RESOLVED" } },
      select: {
        id: true,
        title: true,
        severity: true,
        createdAt: true,
        vehicleId: true,
        vehicle: { select: { registration: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.$queryRaw<MaintenanceRow[]>`
      SELECT p.id::text, p."vehicleId", p.title, p.category, p."nextDueAt", v.registration
      FROM "MaintenancePlan" p
      JOIN "Vehicle" v ON v.id = p."vehicleId" AND v."companyId" = p."companyId"
      WHERE p."companyId" = ${companyId} AND p."isActive" = true
      ORDER BY p."nextDueAt" ASC
      LIMIT 600
    `,
    prisma.$queryRaw<TachoDownloadRow[]>`
      SELECT DISTINCT ON ("driverId") "driverId", "nextDueAt"
      FROM "TachographDownload"
      WHERE "companyId" = ${companyId} AND status <> 'REJECTED'
      ORDER BY "driverId", "downloadedAt" DESC
    `,
  ]);

  if (!company) return res.status(404).json({ error: "Company not found" });

  const alerts: GuardianAlert[] = [];
  const pushAlert = (alert: GuardianAlert) => alerts.push(alert);
  const addDue = (input: {
    id: string;
    kind: string;
    label: string;
    date: Date | null;
    subjectType: GuardianAlert["subjectType"];
    subjectId?: string;
    subjectLabel?: string;
    action: string;
    href: string;
  }) => {
    if (!input.date || input.date > soon) return;
    pushAlert({
      id: input.id,
      severity: input.date < now ? "OVERDUE" : "DUE_SOON",
      kind: input.kind,
      label: input.label,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectLabel: input.subjectLabel,
      dueDate: input.date.toISOString(),
      daysUntilDue: dayDifference(input.date, now),
      action: input.action,
      href: input.href,
    });
  };
  const addMissing = (input: Omit<GuardianAlert, "severity">) => pushAlert({ ...input, severity: "MISSING_DATA" });

  if (company.usesHgv && !company.operatorLicenceNumber) {
    addMissing({
      id: "company-operator-licence",
      kind: "OPERATOR_LICENCE",
      label: "Operator licence number is not recorded in FleetOS",
      subjectType: "COMPANY",
      subjectId: company.id,
      subjectLabel: company.name,
      action: "Record the operator licence details so the compliance record is complete.",
      href: "/settings/company",
    });
  }

  const pmiVehicleIds = new Set(maintenance.filter((plan) => plan.category === "PMI").map((plan) => plan.vehicleId));
  for (const vehicle of vehicles) {
    const vehicleHref = "/vehicles";
    const roadVehicle = vehicle.type === "TRUCK" || vehicle.type === "VAN" || vehicle.type === "CAR";
    if (roadVehicle) {
      addDue({ id: `mot-${vehicle.id}`, kind: "MOT", label: `${vehicle.registration} MOT / annual test`, date: vehicle.motDue, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Review the test date and arrange the next test if required.", href: vehicleHref });
      addDue({ id: `tax-${vehicle.id}`, kind: "TAX", label: `${vehicle.registration} tax`, date: vehicle.taxDue, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Review the recorded tax date.", href: vehicleHref });
      if (!vehicle.motDue) addMissing({ id: `mot-missing-${vehicle.id}`, kind: "MOT", label: `${vehicle.registration} has no MOT / annual test date recorded`, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Add the current test expiry date or record why it is not applicable.", href: vehicleHref });
      if (!vehicle.taxDue) addMissing({ id: `tax-missing-${vehicle.id}`, kind: "TAX", label: `${vehicle.registration} has no tax date recorded`, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Add the current tax date or record why it is not applicable.", href: vehicleHref });
    }
    addDue({ id: `insurance-${vehicle.id}`, kind: "INSURANCE", label: `${vehicle.registration} insurance`, date: vehicle.insuranceDue, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Review the recorded insurance renewal date and supporting document.", href: vehicleHref });
    if (!vehicle.insuranceDue) addMissing({ id: `insurance-missing-${vehicle.id}`, kind: "INSURANCE", label: `${vehicle.registration} has no insurance renewal date recorded`, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Add the insurance renewal date or record why it is covered elsewhere.", href: vehicleHref });

    if (vehicle.type === "TRUCK") {
      addDue({ id: `tacho-cal-${vehicle.id}`, kind: "TACHO_CAL", label: `${vehicle.registration} tachograph calibration`, date: vehicle.tachoCalibrationDue, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Review the tachograph calibration due date and certificate.", href: "/tachograph" });
      if (!vehicle.tachoCalibrationDue) addMissing({ id: `tacho-cal-missing-${vehicle.id}`, kind: "TACHO_CAL", label: `${vehicle.registration} has no tachograph calibration date recorded`, subjectType: "VEHICLE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Record the calibration date or why tachograph calibration is not applicable.", href: "/tachograph" });
      if (!pmiVehicleIds.has(vehicle.id)) addMissing({ id: `pmi-missing-${vehicle.id}`, kind: "PMI", label: `${vehicle.registration} has no active PMI plan recorded`, subjectType: "MAINTENANCE", subjectId: vehicle.id, subjectLabel: vehicle.registration, action: "Create or link a planned maintenance inspection schedule.", href: "/workshop" });
    }
  }

  const latestTachoByDriver = new Map(tachoDownloads.map((row) => [row.driverId, row.nextDueAt]));
  for (const driver of drivers) {
    const name = `${driver.firstName} ${driver.lastName}`.trim();
    addDue({ id: `licence-${driver.id}`, kind: "LICENCE", label: `${name} driving licence`, date: driver.licenceExpiry, subjectType: "DRIVER", subjectId: driver.id, subjectLabel: name, action: "Review the driver's licence record and renewal/check evidence.", href: "/drivers" });
    if (!driver.licenceExpiry) addMissing({ id: `licence-missing-${driver.id}`, kind: "LICENCE", label: `${name} has no driving licence expiry date recorded`, subjectType: "DRIVER", subjectId: driver.id, subjectLabel: name, action: "Complete the driver's licence record.", href: "/drivers" });

    const cpcDate = driver.dcpcExpiry ?? driver.cpcExpiry;
    if (company.usesHgv) {
      addDue({ id: `cpc-${driver.id}`, kind: "CPC", label: `${name} Driver CPC`, date: cpcDate, subjectType: "DRIVER", subjectId: driver.id, subjectLabel: name, action: "Review Driver CPC evidence and expiry details.", href: "/drivers" });
      if (!cpcDate) addMissing({ id: `cpc-missing-${driver.id}`, kind: "CPC", label: `${name} has no Driver CPC expiry date recorded`, subjectType: "DRIVER", subjectId: driver.id, subjectLabel: name, action: "Record the CPC expiry date or why CPC is not applicable to this driver.", href: "/drivers" });
    }

    addDue({ id: `tacho-card-${driver.id}`, kind: "TACHO_CARD", label: `${name} tachograph card`, date: driver.tachoCardExpiry, subjectType: "DRIVER", subjectId: driver.id, subjectLabel: name, action: "Review the driver card expiry date and renewal status.", href: "/tachograph" });
    addDue({ id: `medical-${driver.id}`, kind: "MEDICAL", label: `${name} medical`, date: driver.medicalDue, subjectType: "DRIVER", subjectId: driver.id, subjectLabel: name, action: "Review the medical due date recorded for this driver.", href: "/drivers" });

    if (driver.tachoCardNumber) {
      const nextDownload = latestTachoByDriver.get(driver.id);
      if (nextDownload) {
        addDue({ id: `tacho-download-${driver.id}`, kind: "TACHO_DOWNLOAD", label: `${name} driver-card download`, date: nextDownload, subjectType: "TACHOGRAPH", subjectId: driver.id, subjectLabel: name, action: "Upload or import the next driver-card download and retain the source evidence.", href: "/tachograph" });
      } else {
        addMissing({ id: `tacho-download-missing-${driver.id}`, kind: "TACHO_DOWNLOAD", label: `${name} has no driver-card download schedule recorded`, subjectType: "TACHOGRAPH", subjectId: driver.id, subjectLabel: name, action: "Add the first tachograph download record so FleetOS can track the next due date.", href: "/tachograph" });
      }
    }
  }

  for (const item of complianceItems) {
    addDue({ id: `compliance-${item.id}`, kind: "COMPLIANCE", label: item.title, date: item.dueDate, subjectType: "COMPLIANCE", subjectId: item.id, action: "Review and close the compliance action when evidence is complete.", href: "/registers" });
  }

  for (const plan of maintenance) {
    addDue({ id: `maintenance-${plan.id}`, kind: plan.category, label: `${plan.registration} ${plan.title}`, date: plan.nextDueAt, subjectType: "MAINTENANCE", subjectId: plan.id, subjectLabel: plan.registration, action: "Review the maintenance plan and create or complete the associated work order.", href: "/workshop" });
  }

  for (const defect of defects) {
    const severity = (defect.severity ?? "").trim().toUpperCase();
    const critical = severity === "CRITICAL" || severity === "DANGEROUS" || severity === "HIGH";
    pushAlert({
      id: `defect-${defect.id}`,
      severity: critical ? "CRITICAL" : "ATTENTION",
      kind: "DEFECT",
      label: `${defect.vehicle?.registration ? `${defect.vehicle.registration}: ` : ""}${defect.title}`,
      subjectType: "DEFECT",
      subjectId: defect.id,
      subjectLabel: defect.vehicle?.registration ?? undefined,
      action: critical ? "Treat this unresolved high-severity defect as a priority and record the rectification decision." : "Review the unresolved defect and update its repair status.",
      href: "/workshop",
    });
  }

  alerts.sort((a, b) => {
    const severityDelta = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDelta !== 0) return severityDelta;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.label.localeCompare(b.label);
  });

  const counts = {
    critical: alerts.filter((alert) => alert.severity === "CRITICAL").length,
    overdue: alerts.filter((alert) => alert.severity === "OVERDUE").length,
    dueSoon: alerts.filter((alert) => alert.severity === "DUE_SOON").length,
    missingData: alerts.filter((alert) => alert.severity === "MISSING_DATA").length,
    attention: alerts.filter((alert) => alert.severity === "ATTENTION").length,
    openDefects: defects.length,
  };

  const deductions = Math.min(
    100,
    counts.critical * 18 + counts.overdue * 8 + counts.dueSoon * 2 + counts.missingData * 2 + counts.attention * 3,
  );
  const score = Math.max(0, 100 - deductions);
  const status = counts.critical > 0 || score < 60 ? "RED" : counts.overdue > 0 || score < 85 ? "AMBER" : "GREEN";

  res.json({
    generatedAt: now.toISOString(),
    company: {
      name: company.name,
      usesHgv: company.usesHgv,
      operatorLicenceNumber: company.operatorLicenceNumber,
      operatorLicenceType: company.operatorLicenceType,
      complianceSchemes: company.complianceSchemes,
    },
    health: { score, status },
    summary: counts,
    alerts,
  });
}));
