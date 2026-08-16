import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

type CheckStatus = "PASS" | "WARN" | "BLOCK" | "INFO";
type PreflightCheck = {
  id: string;
  area: "JOB" | "VEHICLE" | "DRIVER" | "MAINTENANCE" | "DEFECT" | "SCHEDULE" | "SKILLS" | "HOURS";
  status: CheckStatus;
  title: string;
  detail: string;
  href?: string;
};

type JobRow = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  status: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  estimatedDurationMinutes: number | null;
  vehicleId: string | null;
  driverId: string | null;
  jobTypeId: string | null;
  registration: string | null;
  vehicleType: string | null;
  vehicleStatus: string | null;
  motDue: Date | null;
  taxDue: Date | null;
  insuranceDue: Date | null;
  tachoCalibrationDue: Date | null;
  jobTypeName: string | null;
  trade: string | null;
  requiredSkills: unknown;
};

type AssignedPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  skills: unknown;
};

type ClashRow = { id: string; jobNumber: string | null; title: string | null; scheduledStart: Date | null; scheduledEnd: Date | null };
type ActivityRow = { activity: string; startedAt: Date; endedAt: Date | null };
type MaintenanceRow = { id: string; title: string; category: string; nextDueAt: Date };

const preflightReaders = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const closedStatuses = ["COMPLETED", "COMPLETED_ISSUES", "CLOSED", "CANCELLED"];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function isExpired(date: Date | null, now: Date) {
  return Boolean(date && date.getTime() < now.getTime());
}

export const eligibilityRouter = Router();
eligibilityRouter.use(requireAuth, preflightReaders);

eligibilityRouter.get("/job/:id", asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const now = new Date();
  const jobs = await prisma.$queryRaw<JobRow[]>`
    SELECT
      j.id, j."jobNumber", j.title, j.status::text, j."scheduledStart", j."scheduledEnd", j."estimatedDurationMinutes",
      j."vehicleId", j."driverId", j."jobTypeId"::text,
      v.registration, v.type::text AS "vehicleType", v.status::text AS "vehicleStatus",
      v."motDue", v."taxDue", v."insuranceDue", v."tachoCalibrationDue",
      jt.name AS "jobTypeName", jt.trade, jt."requiredSkills"
    FROM "Job" j
    LEFT JOIN "Vehicle" v ON v.id=j."vehicleId" AND v."companyId"=j."companyId"
    LEFT JOIN "JobType" jt ON jt.id=j."jobTypeId" AND jt."companyId"=j."companyId"
    WHERE j.id=${req.params.id} AND j."companyId"=${companyId}
    LIMIT 1
  `;
  const job = jobs[0];
  if (!job) return res.status(404).json({ error: "Job not found in the active company" });

  const assignedPeople = await prisma.$queryRaw<AssignedPerson[]>`
    SELECT p.id, p."firstName", p."lastName", p.email, p.skills
    FROM "JobAssignment" a
    JOIN "Person" p ON p.id=a."personId" AND p."companyId"=a."companyId"
    WHERE a."companyId"=${companyId} AND a."jobId"=${job.id} AND p."isActive"=true
    ORDER BY p."lastName", p."firstName"
  `;

  const driver = job.driverId ? await prisma.driver.findFirst({
    where: { id: job.driverId, companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      licenceNumber: true,
      licenceExpiry: true,
      cpcExpiry: true,
      dcpcExpiry: true,
      tachoCardNumber: true,
      tachoCardExpiry: true,
      medicalDue: true,
    },
  }) : null;

  const [openDefects, maintenance] = job.vehicleId ? await Promise.all([
    prisma.defect.findMany({
      where: { companyId, vehicleId: job.vehicleId, status: { not: "RESOLVED" } },
      select: { id: true, title: true, severity: true, status: true },
      take: 100,
    }),
    prisma.$queryRaw<MaintenanceRow[]>`
      SELECT id::text, title, category, "nextDueAt"
      FROM "MaintenancePlan"
      WHERE "companyId"=${companyId} AND "vehicleId"=${job.vehicleId} AND "isActive"=true
      ORDER BY "nextDueAt" ASC LIMIT 100
    `,
  ]) : [[], []] as [Array<{ id: string; title: string; severity: string | null; status: string }>, MaintenanceRow[]];

  const scheduledStart = job.scheduledStart;
  const scheduledEnd = job.scheduledEnd ?? (scheduledStart ? new Date(scheduledStart.getTime() + (job.estimatedDurationMinutes ?? 120) * 60_000) : null);

  let vehicleClashes: ClashRow[] = [];
  let driverClashes: ClashRow[] = [];
  if (scheduledStart && scheduledEnd && job.vehicleId) {
    vehicleClashes = await prisma.$queryRaw<ClashRow[]>`
      SELECT id, "jobNumber", title, "scheduledStart", "scheduledEnd"
      FROM "Job"
      WHERE "companyId"=${companyId} AND id<>${job.id} AND "vehicleId"=${job.vehicleId}
        AND status::text NOT IN ('COMPLETED','COMPLETED_ISSUES','CLOSED','CANCELLED')
        AND "scheduledStart" IS NOT NULL
        AND COALESCE("scheduledEnd", "scheduledStart" + (COALESCE("estimatedDurationMinutes",120) || ' minutes')::interval) > ${scheduledStart}
        AND "scheduledStart" < ${scheduledEnd}
      ORDER BY "scheduledStart" ASC LIMIT 20
    `;
  }
  if (scheduledStart && scheduledEnd && driver?.id) {
    driverClashes = await prisma.$queryRaw<ClashRow[]>`
      SELECT id, "jobNumber", title, "scheduledStart", "scheduledEnd"
      FROM "Job"
      WHERE "companyId"=${companyId} AND id<>${job.id} AND "driverId"=${driver.id}
        AND status::text NOT IN ('COMPLETED','COMPLETED_ISSUES','CLOSED','CANCELLED')
        AND "scheduledStart" IS NOT NULL
        AND COALESCE("scheduledEnd", "scheduledStart" + (COALESCE("estimatedDurationMinutes",120) || ' minutes')::interval) > ${scheduledStart}
        AND "scheduledStart" < ${scheduledEnd}
      ORDER BY "scheduledStart" ASC LIMIT 20
    `;
  }

  let activities: ActivityRow[] = [];
  if (driver?.id) {
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    activities = await prisma.$queryRaw<ActivityRow[]>`
      SELECT activity, "startedAt", "endedAt"
      FROM "DriverActivity"
      WHERE "companyId"=${companyId} AND "driverId"=${driver.id} AND "startedAt">=${dayStart}
      ORDER BY "startedAt" ASC
    `;
  }

  const checks: PreflightCheck[] = [];
  const add = (status: CheckStatus, area: PreflightCheck["area"], id: string, title: string, detail: string, href?: string) => checks.push({ status, area, id, title, detail, href });
  const transportJob = (job.trade ?? "").toUpperCase() === "TRANSPORT";
  const hgv = job.vehicleType === "TRUCK";

  if (closedStatuses.includes(job.status)) add("WARN", "JOB", "job-status", "Job is already finished", `Current status is ${job.status.replaceAll("_", " ")}. A dispatch check is normally used before field work starts.`, "/jobs");
  else add("PASS", "JOB", "job-status", "Job is open", `Current status: ${job.status.replaceAll("_", " ")}.`, "/jobs");

  if (!scheduledStart) add("WARN", "SCHEDULE", "job-unscheduled", "No scheduled start", "Set a job time before relying on clash detection.", "/jobs");
  else add("PASS", "SCHEDULE", "job-scheduled", "Job has a scheduled start", scheduledStart.toLocaleString("en-GB"), "/jobs");

  if (!job.vehicleId || !job.registration) {
    add(transportJob ? "BLOCK" : "WARN", "VEHICLE", "vehicle-missing", "No vehicle allocated", transportJob ? "Allocate a vehicle before dispatching this transport job." : "No vehicle is currently attached to this job.", "/jobs");
  } else {
    add(job.vehicleStatus === "ACTIVE" ? "PASS" : "BLOCK", "VEHICLE", "vehicle-status", `${job.registration} vehicle status`, job.vehicleStatus === "ACTIVE" ? "Vehicle is recorded as active." : `Vehicle is recorded as ${job.vehicleStatus ?? "unknown"}.`, "/vehicles");
    const vehicleDates: Array<[string, string, Date | null]> = [["MOT", "MOT / annual test", job.motDue], ["TAX", "Tax", job.taxDue], ["INSURANCE", "Insurance", job.insuranceDue]];
    if (hgv) vehicleDates.push(["TACHO_CAL", "Tachograph calibration", job.tachoCalibrationDue]);
    for (const [id, label, date] of vehicleDates) {
      if (!date) add("WARN", "VEHICLE", `vehicle-${id.toLowerCase()}-missing`, `${label} date not recorded`, `FleetOS cannot verify the recorded ${label.toLowerCase()} date for ${job.registration}.`, id === "TACHO_CAL" ? "/tachograph" : "/vehicles");
      else if (isExpired(date, now)) add("BLOCK", "VEHICLE", `vehicle-${id.toLowerCase()}-expired`, `${label} is past the recorded due date`, `${job.registration}: ${date.toLocaleDateString("en-GB")}.`, id === "TACHO_CAL" ? "/tachograph" : "/vehicles");
      else add("PASS", "VEHICLE", `vehicle-${id.toLowerCase()}`, `${label} is in date on the FleetOS record`, `${job.registration}: ${date.toLocaleDateString("en-GB")}.`, id === "TACHO_CAL" ? "/tachograph" : "/vehicles");
    }
  }

  const seriousDefects = openDefects.filter((defect) => ["CRITICAL", "DANGEROUS", "HIGH"].includes((defect.severity ?? "").toUpperCase()));
  if (seriousDefects.length) add("BLOCK", "DEFECT", "defects-serious", `${seriousDefects.length} high-severity unresolved defect${seriousDefects.length === 1 ? "" : "s"}`, seriousDefects.map((item) => item.title).slice(0, 4).join("; "), "/workshop");
  else if (openDefects.length) add("WARN", "DEFECT", "defects-open", `${openDefects.length} unresolved defect${openDefects.length === 1 ? "" : "s"}`, "Review the open defect records before dispatch.", "/workshop");
  else if (job.vehicleId) add("PASS", "DEFECT", "defects-none", "No unresolved vehicle defects found", "No open defect records are attached to the allocated vehicle.", "/workshop");

  const overduePmi = maintenance.filter((plan) => plan.category === "PMI" && plan.nextDueAt < now);
  const overdueOther = maintenance.filter((plan) => plan.category !== "PMI" && plan.nextDueAt < now);
  if (overduePmi.length) add("BLOCK", "MAINTENANCE", "pmi-overdue", "Recorded PMI plan is overdue", overduePmi.map((item) => `${item.title} (${item.nextDueAt.toLocaleDateString("en-GB")})`).slice(0, 4).join("; "), "/workshop");
  else if (hgv && job.vehicleId && !maintenance.some((plan) => plan.category === "PMI")) add("WARN", "MAINTENANCE", "pmi-missing", "No active PMI plan found", "FleetOS cannot confirm an active planned maintenance inspection schedule for this truck.", "/workshop");
  else if (job.vehicleId) add("PASS", "MAINTENANCE", "pmi-current", "No overdue PMI plan found", "The recorded active PMI plans are not overdue.", "/workshop");
  if (overdueOther.length) add("WARN", "MAINTENANCE", "maintenance-overdue", `${overdueOther.length} other maintenance item${overdueOther.length === 1 ? "" : "s"} overdue`, overdueOther.map((item) => item.title).slice(0, 4).join("; "), "/workshop");

  if (!driver) {
    add(transportJob ? "BLOCK" : "WARN", "DRIVER", "driver-missing", "No linked driver found", transportJob ? "Allocate an active driver profile before dispatching this transport job." : "The assigned people do not currently resolve to a Driver record.", "/drivers");
  } else {
    const name = `${driver.firstName} ${driver.lastName}`;
    add(driver.isActive ? "PASS" : "BLOCK", "DRIVER", "driver-active", `${name} driver status`, driver.isActive ? "Driver is recorded as active." : "Driver is not active in the company record.", "/drivers");
    if (!driver.licenceExpiry) add("WARN", "DRIVER", "licence-missing", "Driving licence expiry not recorded", `Complete ${name}'s licence record before relying on automated preflight.`, "/drivers");
    else if (isExpired(driver.licenceExpiry, now)) add("BLOCK", "DRIVER", "licence-expired", "Driving licence is past the recorded expiry date", `${name}: ${driver.licenceExpiry.toLocaleDateString("en-GB")}.`, "/drivers");
    else add("PASS", "DRIVER", "licence-current", "Driving licence is in date on the FleetOS record", `${name}: ${driver.licenceExpiry.toLocaleDateString("en-GB")}.`, "/drivers");

    if (hgv) {
      const cpcDate = driver.dcpcExpiry ?? driver.cpcExpiry;
      if (!cpcDate) add("WARN", "DRIVER", "cpc-missing", "Driver CPC expiry not recorded", `FleetOS cannot verify a recorded CPC expiry for ${name}.`, "/drivers");
      else if (isExpired(cpcDate, now)) add("BLOCK", "DRIVER", "cpc-expired", "Driver CPC is past the recorded expiry date", `${name}: ${cpcDate.toLocaleDateString("en-GB")}.`, "/drivers");
      else add("PASS", "DRIVER", "cpc-current", "Driver CPC is in date on the FleetOS record", `${name}: ${cpcDate.toLocaleDateString("en-GB")}.`, "/drivers");
      if (!driver.tachoCardExpiry) add("WARN", "DRIVER", "tacho-card-missing", "Tachograph card expiry not recorded", `FleetOS cannot verify a recorded driver-card expiry for ${name}.`, "/tachograph");
      else if (isExpired(driver.tachoCardExpiry, now)) add("BLOCK", "DRIVER", "tacho-card-expired", "Tachograph card is past the recorded expiry date", `${name}: ${driver.tachoCardExpiry.toLocaleDateString("en-GB")}.`, "/tachograph");
      else add("PASS", "DRIVER", "tacho-card-current", "Tachograph card is in date on the FleetOS record", `${name}: ${driver.tachoCardExpiry.toLocaleDateString("en-GB")}.`, "/tachograph");
    }
    if (driver.medicalDue && isExpired(driver.medicalDue, now)) add("BLOCK", "DRIVER", "medical-overdue", "Driver medical is past the recorded due date", `${name}: ${driver.medicalDue.toLocaleDateString("en-GB")}.`, "/drivers");
    else if (driver.medicalDue) add("PASS", "DRIVER", "medical-current", "Driver medical is in date on the FleetOS record", `${name}: ${driver.medicalDue.toLocaleDateString("en-GB")}.`, "/drivers");
  }

  if (vehicleClashes.length) add("BLOCK", "SCHEDULE", "vehicle-clash", "Vehicle has a scheduling clash", vehicleClashes.map((item) => item.jobNumber || item.title || item.id).join(", "), "/jobs");
  else if (scheduledStart && scheduledEnd && job.vehicleId) add("PASS", "SCHEDULE", "vehicle-free", "No overlapping vehicle job found", "No conflicting FleetOS job is scheduled for the allocated vehicle in this time window.", "/jobs");
  if (driverClashes.length) add("BLOCK", "SCHEDULE", "driver-clash", "Driver has a scheduling clash", driverClashes.map((item) => item.jobNumber || item.title || item.id).join(", "), "/jobs");
  else if (scheduledStart && scheduledEnd && driver?.id) add("PASS", "SCHEDULE", "driver-free", "No overlapping driver job found", "No conflicting FleetOS job is scheduled for the linked driver in this time window.", "/jobs");

  const requiredSkills = asStringArray(job.requiredSkills);
  const availableSkills = new Set(assignedPeople.flatMap((person) => asStringArray(person.skills)).map((skill) => skill.toLowerCase()));
  const missingSkills = requiredSkills.filter((skill) => !availableSkills.has(skill.toLowerCase()));
  if (missingSkills.length) add("BLOCK", "SKILLS", "skills-missing", "Required job skills are not covered by the assigned team", `Missing: ${missingSkills.join(", ")}.`, "/jobs");
  else if (requiredSkills.length) add("PASS", "SKILLS", "skills-covered", "Required job skills are covered", requiredSkills.join(", "), "/jobs");
  else add("INFO", "SKILLS", "skills-none", "No required skills configured for this job type", "The job type does not currently declare required skills.", "/jobs");

  if (driver) {
    const end = new Date();
    const totals = activities.reduce((acc, row) => {
      const minutes = minutesBetween(new Date(row.startedAt), row.endedAt ? new Date(row.endedAt) : end);
      if (row.activity === "DRIVING") acc.driving += minutes;
      if (row.activity === "OTHER_WORK") acc.otherWork += minutes;
      if (row.activity === "BREAK_REST") acc.breakRest += minutes;
      return acc;
    }, { driving: 0, otherWork: 0, breakRest: 0 });
    add("INFO", "HOURS", "hours-record", "Today's recorded driver activity", `${totals.driving} min driving · ${totals.otherWork} min other work · ${totals.breakRest} min break/rest. This is information only; FleetOS is not declaring legal hours eligibility from this total alone.`, "/hours");
  }

  const blockers = checks.filter((check) => check.status === "BLOCK").length;
  const warnings = checks.filter((check) => check.status === "WARN").length;
  const decision = blockers ? "BLOCKED" : warnings ? "REVIEW" : "READY";

  res.json({
    generatedAt: now.toISOString(),
    decision,
    summary: { blockers, warnings, passed: checks.filter((check) => check.status === "PASS").length, information: checks.filter((check) => check.status === "INFO").length },
    job: {
      id: job.id,
      reference: job.jobNumber,
      title: job.title,
      status: job.status,
      jobTypeName: job.jobTypeName,
      trade: job.trade,
      scheduledStart: job.scheduledStart,
      scheduledEnd,
      registration: job.registration,
      driver: driver ? `${driver.firstName} ${driver.lastName}` : null,
      assignedPeople: assignedPeople.map((person) => ({ id: person.id, name: `${person.firstName} ${person.lastName}` })),
    },
    checks,
    note: "Preflight is based only on records held in FleetOS. It is an operational decision aid, not a substitute for the operator's legal checks, driver judgement or statutory records.",
  });
}));
