import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { writeAuditEvent } from "../../lib/audit.js";

export const importsRouter = Router();
importsRouter.use(requireAuth, requireRoles("TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"));

const requestSchema = z.object({ kind: z.enum(["vehicles", "drivers"]), csv: z.string().min(1).max(1_500_000) });
const vehicleTypes = new Set(["TRUCK", "VAN", "TRAILER", "CAR", "OTHER"]);

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function norm(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function clean(value: string | undefined) { const v = value?.trim(); return v ? v : undefined; }
function date(value: string | undefined) {
  const v = clean(value); if (!v) return undefined;
  const parsed = new Date(v); return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function integer(value: string | undefined) {
  const v = clean(value); if (!v) return undefined;
  const n = Number(v.replace(/,/g, "")); return Number.isInteger(n) && n >= 0 ? n : null;
}
function indexMap(headers: string[]) { return new Map(headers.map((header, index) => [norm(header), index])); }
function read(row: string[], map: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) { const idx = map.get(norm(alias)); if (idx !== undefined) return row[idx]; }
  return undefined;
}

function validate(kind: "vehicles" | "drivers", csv: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { records: [] as Record<string, unknown>[], errors: ["Add a header row and at least one data row."] };
  const map = indexMap(rows[0]);
  const errors: string[] = [];
  const records: Record<string, unknown>[] = [];
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    if (kind === "vehicles") {
      const registration = clean(read(row, map, ["registration", "reg", "vrm"]));
      if (!registration) { errors.push(`Row ${line}: registration is required.`); return; }
      const rawType = (clean(read(row, map, ["type", "vehicle type"])) || "TRUCK").toUpperCase();
      const year = integer(read(row, map, ["year"]));
      const mileage = integer(read(row, map, ["mileage", "odometer"]));
      const dates = {
        motDue: date(read(row, map, ["mot due", "motdue"])), taxDue: date(read(row, map, ["tax due", "taxdue"])),
        insuranceDue: date(read(row, map, ["insurance due", "insurancedue"])),
        tachoCalibrationDue: date(read(row, map, ["tacho calibration due", "tachocalibrationdue"])),
      };
      if (year === null || mileage === null || Object.values(dates).some((value) => value === null)) { errors.push(`Row ${line}: one or more dates/numbers are invalid.`); return; }
      records.push({ registration: registration.toUpperCase(), fleetNumber: clean(read(row, map, ["fleet number", "fleetnumber"])), make: clean(read(row, map, ["make"])), model: clean(read(row, map, ["model"])), year, type: vehicleTypes.has(rawType) ? rawType : "OTHER", mileage, depot: clean(read(row, map, ["depot", "site"])), notes: clean(read(row, map, ["notes"])), ...dates });
    } else {
      const firstName = clean(read(row, map, ["first name", "firstname", "forename"]));
      const lastName = clean(read(row, map, ["last name", "lastname", "surname"]));
      if (!firstName || !lastName) { errors.push(`Row ${line}: first name and last name are required.`); return; }
      const dates = {
        licenceExpiry: date(read(row, map, ["licence expiry", "license expiry"])), cpcExpiry: date(read(row, map, ["cpc expiry"])),
        dcpcExpiry: date(read(row, map, ["dcpc expiry"])), tachoCardExpiry: date(read(row, map, ["tacho card expiry"])), medicalDue: date(read(row, map, ["medical due"])),
      };
      if (Object.values(dates).some((value) => value === null)) { errors.push(`Row ${line}: one or more dates are invalid.`); return; }
      records.push({ firstName, lastName, email: clean(read(row, map, ["email"])), phone: clean(read(row, map, ["phone", "mobile"])), licenceNumber: clean(read(row, map, ["licence number", "license number"])), tachoCardNumber: clean(read(row, map, ["tacho card number", "tachocardnumber"])), postcode: clean(read(row, map, ["postcode"])), ...dates });
    }
  });
  return { records, errors };
}

importsRouter.post("/preview", asyncHandler(async (req, res) => {
  const input = requestSchema.parse(req.body);
  const result = validate(input.kind, input.csv);
  res.json({ kind: input.kind, valid: result.records.length, invalid: result.errors.length, sample: result.records.slice(0, 5), errors: result.errors.slice(0, 100) });
}));

importsRouter.post("/commit", asyncHandler(async (req, res) => {
  const input = requestSchema.parse(req.body);
  const { records, errors } = validate(input.kind, input.csv);
  if (errors.length) return res.status(400).json({ error: "Fix spreadsheet validation errors before importing.", errors: errors.slice(0, 100) });
  if (!records.length) return res.status(400).json({ error: "No valid rows found." });
  if (records.length > 2000) return res.status(400).json({ error: "Import a maximum of 2,000 rows at a time." });
  const companyId = req.user!.companyId;
  let imported = 0;

  if (input.kind === "vehicles") {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
      const controls = await tx.$queryRaw<Array<{ vehicleLimit: number }>>`
        SELECT "vehicleLimit" FROM "CompanyControl" WHERE "companyId"=${companyId} LIMIT 1
      `;
      const vehicleLimit = controls[0]?.vehicleLimit ?? 10;
      const existingRows = await tx.vehicle.findMany({ where: { companyId }, select: { registration: true } });
      const existing = new Set(existingRows.map((item) => item.registration.toUpperCase()));
      const data = records.filter((item) => !existing.has(String(item.registration).toUpperCase())).map((item) => ({ ...item, companyId })) as never[];
      const available = Math.max(0, vehicleLimit - existingRows.length);
      if (data.length > available) return { blocked: true as const, vehicleLimit, vehicleUsage: existingRows.length, requested: data.length, available };
      const count = data.length ? (await tx.vehicle.createMany({ data, skipDuplicates: true })).count : 0;
      return { blocked: false as const, count, vehicleLimit, vehicleUsage: existingRows.length + count };
    });

    if (result.blocked) return res.status(409).json({
      error: `This import would exceed the ${result.vehicleLimit}-vehicle allowance. ${result.available} vehicle slot(s) are available on the current plan.`,
      code: "VEHICLE_LIMIT_REACHED",
      vehicleLimit: result.vehicleLimit,
      vehicleUsage: result.vehicleUsage,
      requested: result.requested,
      available: result.available,
    });
    imported = result.count;
  } else {
    imported = (await prisma.driver.createMany({ data: records.map((item) => ({ ...item, companyId })) as never[] })).count;
  }

  await writeAuditEvent({ companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "SPREADSHEET_IMPORT", entityId: input.kind, summary: `Imported ${imported} ${input.kind} record(s) from spreadsheet data` });
  res.status(201).json({ imported, kind: input.kind });
}));
