import { readFile } from "node:fs/promises";

const REQUIRED_ROLES = [
  "DRIVER",
  "WORKSHOP_TECHNICIAN",
  "TRANSPORT_PLANNER",
  "TRANSPORT_MANAGER",
  "OFFICE_STAFF",
  "FINANCE",
  "COMPANY_ADMIN",
  "PLATFORM_ADMIN",
];

const GUARDED_MODULES = [
  "apps/api/src/modules/company/routes.ts",
  "apps/api/src/modules/drivers/routes.ts",
  "apps/api/src/modules/vehicles/routes.ts",
  "apps/api/src/modules/jobs/routes.ts",
  "apps/api/src/modules/operations/routes.ts",
  "apps/api/src/modules/organisation/routes.ts",
  "apps/api/src/modules/registers/routes.ts",
  "apps/api/src/modules/documents/routes.ts",
  "apps/api/src/modules/reports/routes.ts",
  "apps/api/src/modules/marketplace/routes.ts",
  "apps/api/src/modules/medic/routes.ts",
  "apps/api/src/modules/driver-operations/routes.ts",
];

const failures = [];
const allText = [];
for (const file of GUARDED_MODULES) {
  const text = await readFile(file, "utf8");
  allText.push(text);
  if (!text.includes("requireRoles")) failures.push(`${file}: missing role guard usage`);
}

const auth = await readFile("apps/api/src/middleware/auth.ts", "utf8");
if (!auth.includes("requireRoles")) failures.push("auth middleware: requireRoles export missing");
if (!auth.includes("403")) failures.push("auth middleware: role denial must remain fail-closed with 403");

const corpus = `${auth}\n${allText.join("\n")}`;
for (const role of REQUIRED_ROLES) {
  if (!corpus.includes(role)) failures.push(`role contract: ${role} is not represented in authorization code`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(`PASS FleetOS role-policy contract: ${REQUIRED_ROLES.length} roles and ${GUARDED_MODULES.length} sensitive modules checked`);
