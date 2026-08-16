import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

type PassportEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
  status?: string;
  href?: string;
};

type MaintenancePlanRow = {
  id: string;
  title: string;
  category: string;
  nextDueAt: Date;
  lastCompletedAt: Date | null;
};

type MaintenanceWorkOrderRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  costPence: number | null;
};

type TachographDownloadRow = {
  id: string;
  downloadedAt: Date;
  nextDueAt: Date;
  originalFilename: string;
  status: string;
};

const passportReaders = requireRoles(
  "WORKSHOP_TECHNICIAN",
  "TRANSPORT_PLANNER",
  "TRANSPORT_MANAGER",
  "OFFICE_STAFF",
  "COMPANY_ADMIN",
  "PLATFORM_ADMIN",
);

function event(input: Omit<PassportEvent, "at"> & { at: Date | null | undefined }): PassportEvent | null {
  if (!input.at) return null;
  return { ...input, at: input.at.toISOString() };
}

function sortEvents(events: Array<PassportEvent | null>) {
  return events.filter((item): item is PassportEvent => Boolean(item)).sort((a, b) => b.at.localeCompare(a.at));
}

function vehicleCompleteness(vehicle: {
  registration: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  motDue: Date | null;
  insuranceDue: Date | null;
  taxDue: Date | null;
}) {
  const checks = [vehicle.registration, vehicle.vin, vehicle.make, vehicle.model, vehicle.motDue, vehicle.insuranceDue, vehicle.taxDue];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function driverCompleteness(driver: {
  firstName: string;
  lastName: string;
  licenceNumber: string | null;
  licenceExpiry: Date | null;
  email: string | null;
  phone: string | null;
}) {
  const checks = [driver.firstName, driver.lastName, driver.licenceNumber, driver.licenceExpiry, driver.email, driver.phone];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export const passportsRouter = Router();
passportsRouter.use(requireAuth, passportReaders);

passportsRouter.get("/vehicle/:id", asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: req.params.id, companyId },
    select: {
      id: true,
      registration: true,
      fleetNumber: true,
      vin: true,
      make: true,
      model: true,
      year: true,
      type: true,
      status: true,
      firstRegisteredAt: true,
      acquiredAt: true,
      motDue: true,
      taxDue: true,
      insuranceDue: true,
      tachoCalibrationDue: true,
      mileage: true,
      fuelType: true,
      colour: true,
      depot: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found in the active company" });

  const [documents, defects, jobs, compliance, maintenancePlans, workOrders] = await Promise.all([
    prisma.document.findMany({
      where: { companyId, vehicleId: vehicle.id },
      select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.defect.findMany({
      where: { companyId, vehicleId: vehicle.id },
      select: { id: true, title: true, severity: true, status: true, createdAt: true, resolvedAt: true, resolutionNotes: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.job.findMany({
      where: { companyId, vehicleId: vehicle.id },
      select: { id: true, jobNumber: true, title: true, customerName: true, status: true, scheduledStart: true, collectionDateTime: true, completedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.complianceItem.findMany({
      where: { companyId, vehicleId: vehicle.id },
      select: { id: true, title: true, status: true, dueDate: true, completedDate: true, createdAt: true },
      orderBy: { dueDate: "desc" },
      take: 200,
    }),
    prisma.$queryRaw<MaintenancePlanRow[]>`
      SELECT id::text, title, category, "nextDueAt", "lastCompletedAt"
      FROM "MaintenancePlan"
      WHERE "companyId"=${companyId} AND "vehicleId"=${vehicle.id}
      ORDER BY "nextDueAt" DESC LIMIT 200
    `,
    prisma.$queryRaw<MaintenanceWorkOrderRow[]>`
      SELECT id::text, title, category, status, "createdAt", "completedAt", "costPence"
      FROM "MaintenanceWorkOrder"
      WHERE "companyId"=${companyId} AND "vehicleId"=${vehicle.id}
      ORDER BY "createdAt" DESC LIMIT 250
    `,
  ]);

  const timeline = sortEvents([
    event({ id: `vehicle-created-${vehicle.id}`, at: vehicle.createdAt, kind: "VEHICLE", title: "Vehicle added to FleetOS", detail: vehicle.registration, status: vehicle.status, href: "/vehicles" }),
    event({ id: `vehicle-acquired-${vehicle.id}`, at: vehicle.acquiredAt, kind: "VEHICLE", title: "Vehicle acquired", detail: vehicle.registration, href: "/vehicles" }),
    event({ id: `vehicle-first-registered-${vehicle.id}`, at: vehicle.firstRegisteredAt, kind: "VEHICLE", title: "First registration", detail: vehicle.registration, href: "/vehicles" }),
    ...documents.map((doc) => event({ id: `document-${doc.id}`, at: doc.createdAt, kind: "DOCUMENT", title: doc.name, detail: doc.type.replaceAll("_", " "), href: "/documents" })),
    ...defects.map((defect) => event({ id: `defect-${defect.id}`, at: defect.createdAt, kind: "DEFECT", title: defect.title, detail: defect.severity || undefined, status: defect.status, href: "/workshop" })),
    ...defects.map((defect) => event({ id: `defect-resolved-${defect.id}`, at: defect.resolvedAt, kind: "DEFECT_RESOLVED", title: `Resolved: ${defect.title}`, detail: defect.resolutionNotes || undefined, status: "RESOLVED", href: "/workshop" })),
    ...jobs.map((job) => event({ id: `job-${job.id}`, at: job.scheduledStart ?? job.collectionDateTime ?? job.createdAt, kind: "JOB", title: job.jobNumber ? `${job.jobNumber} · ${job.title || job.customerName}` : (job.title || job.customerName), detail: job.customerName, status: job.status, href: `/jobs/${job.id}` })),
    ...jobs.map((job) => event({ id: `job-completed-${job.id}`, at: job.completedAt, kind: "JOB_COMPLETED", title: `Completed job${job.jobNumber ? ` ${job.jobNumber}` : ""}`, detail: job.customerName, status: job.status, href: `/jobs/${job.id}` })),
    ...compliance.map((item) => event({ id: `compliance-${item.id}`, at: item.dueDate, kind: "COMPLIANCE", title: item.title, status: item.status, href: "/compliance" })),
    ...maintenancePlans.map((plan) => event({ id: `maintenance-plan-${plan.id}`, at: plan.nextDueAt, kind: "MAINTENANCE_DUE", title: plan.title, detail: plan.category, href: "/workshop" })),
    ...maintenancePlans.map((plan) => event({ id: `maintenance-completed-${plan.id}`, at: plan.lastCompletedAt, kind: "MAINTENANCE", title: `Completed: ${plan.title}`, detail: plan.category, href: "/workshop" })),
    ...workOrders.map((order) => event({ id: `work-order-${order.id}`, at: order.createdAt, kind: "WORK_ORDER", title: order.title, detail: order.category, status: order.status, href: "/workshop" })),
    ...workOrders.map((order) => event({ id: `work-order-completed-${order.id}`, at: order.completedAt, kind: "WORK_ORDER_COMPLETED", title: `Completed: ${order.title}`, detail: order.costPence === null ? order.category : `${order.category} · £${(order.costPence / 100).toFixed(2)}`, status: order.status, href: "/workshop" })),
  ]);

  res.json({
    vehicle,
    summary: {
      completeness: vehicleCompleteness(vehicle),
      documents: documents.length,
      defects: defects.length,
      openDefects: defects.filter((item) => item.status !== "RESOLVED").length,
      jobs: jobs.length,
      complianceItems: compliance.length,
      maintenancePlans: maintenancePlans.length,
      workOrders: workOrders.length,
    },
    current: {
      motDue: vehicle.motDue,
      taxDue: vehicle.taxDue,
      insuranceDue: vehicle.insuranceDue,
      tachoCalibrationDue: vehicle.tachoCalibrationDue,
    },
    timeline,
  });
}));

passportsRouter.get("/driver/:id", asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const driver = await prisma.driver.findFirst({
    where: { id: req.params.id, companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      licenceNumber: true,
      licenceExpiry: true,
      cpcExpiry: true,
      dcpcExpiry: true,
      tachoCardNumber: true,
      tachoCardExpiry: true,
      medicalDue: true,
      startDate: true,
      leftDate: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!driver) return res.status(404).json({ error: "Driver not found in the active company" });

  const [documents, jobs, compliance, tachoDownloads] = await Promise.all([
    prisma.document.findMany({
      where: { companyId, driverId: driver.id },
      select: { id: true, name: true, type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.job.findMany({
      where: { companyId, driverId: driver.id },
      select: { id: true, jobNumber: true, title: true, customerName: true, status: true, scheduledStart: true, collectionDateTime: true, completedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.complianceItem.findMany({
      where: { companyId, driverId: driver.id },
      select: { id: true, title: true, status: true, dueDate: true, completedDate: true, createdAt: true },
      orderBy: { dueDate: "desc" },
      take: 200,
    }),
    prisma.$queryRaw<TachographDownloadRow[]>`
      SELECT id::text, "downloadedAt", "nextDueAt", "originalFilename", status
      FROM "TachographDownload"
      WHERE "companyId"=${companyId} AND "driverId"=${driver.id}
      ORDER BY "downloadedAt" DESC LIMIT 250
    `,
  ]);

  const timeline = sortEvents([
    event({ id: `driver-created-${driver.id}`, at: driver.createdAt, kind: "DRIVER", title: "Driver added to FleetOS", detail: `${driver.firstName} ${driver.lastName}`, status: driver.isActive ? "ACTIVE" : "INACTIVE", href: "/drivers" }),
    event({ id: `driver-start-${driver.id}`, at: driver.startDate, kind: "EMPLOYMENT", title: "Start date", href: "/personal" }),
    event({ id: `driver-left-${driver.id}`, at: driver.leftDate, kind: "EMPLOYMENT", title: "Left / archived", href: "/personal" }),
    ...documents.map((doc) => event({ id: `document-${doc.id}`, at: doc.createdAt, kind: "DOCUMENT", title: doc.name, detail: doc.type.replaceAll("_", " "), href: "/documents" })),
    ...jobs.map((job) => event({ id: `job-${job.id}`, at: job.scheduledStart ?? job.collectionDateTime ?? job.createdAt, kind: "JOB", title: job.jobNumber ? `${job.jobNumber} · ${job.title || job.customerName}` : (job.title || job.customerName), detail: job.customerName, status: job.status, href: `/jobs/${job.id}` })),
    ...jobs.map((job) => event({ id: `job-completed-${job.id}`, at: job.completedAt, kind: "JOB_COMPLETED", title: `Completed job${job.jobNumber ? ` ${job.jobNumber}` : ""}`, detail: job.customerName, status: job.status, href: `/jobs/${job.id}` })),
    ...compliance.map((item) => event({ id: `compliance-${item.id}`, at: item.dueDate, kind: "COMPLIANCE", title: item.title, status: item.status, href: "/compliance" })),
    ...tachoDownloads.map((download) => event({ id: `tacho-${download.id}`, at: download.downloadedAt, kind: "TACHOGRAPH", title: "Driver-card download", detail: download.originalFilename, status: download.status, href: "/tachograph" })),
  ]);

  res.json({
    driver,
    summary: {
      completeness: driverCompleteness(driver),
      documents: documents.length,
      jobs: jobs.length,
      complianceItems: compliance.length,
      tachographDownloads: tachoDownloads.length,
    },
    current: {
      licenceExpiry: driver.licenceExpiry,
      cpcExpiry: driver.dcpcExpiry ?? driver.cpcExpiry,
      tachoCardExpiry: driver.tachoCardExpiry,
      medicalDue: driver.medicalDue,
      nextTachographDownload: tachoDownloads[0]?.nextDueAt ?? null,
    },
    timeline,
  });
}));
