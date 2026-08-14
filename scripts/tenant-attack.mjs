const API = process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com";
const tokenA = process.env.FLEETOS_SECURITY_TOKEN_A;
const tokenB = process.env.FLEETOS_SECURITY_TOKEN_B;
const companyA = process.env.FLEETOS_SECURITY_COMPANY_A;
const companyB = process.env.FLEETOS_SECURITY_COMPANY_B;

const missing = [
  ["FLEETOS_SECURITY_TOKEN_A", tokenA],
  ["FLEETOS_SECURITY_TOKEN_B", tokenB],
  ["FLEETOS_SECURITY_COMPANY_A", companyA],
  ["FLEETOS_SECURITY_COMPANY_B", companyB],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  const message = `Authenticated cross-tenant probes cannot run; missing: ${missing.join(", ")}.`;
  if (process.env.CI === "true") {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`SKIP ${message}`);
  process.exit(0);
}

const targets = ["/api/company", "/api/vehicles", "/api/drivers", "/api/jobs", "/api/operations/maintenance", "/api/messages", "/api/driver-operations/office"];
const attempts = [
  { name: "Tenant A token against tenant B", token: tokenA, company: companyB },
  { name: "Tenant B token against tenant A", token: tokenB, company: companyA },
];
let failures = 0;

for (const attempt of attempts) {
  for (const path of targets) {
    const response = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${attempt.token}`, "x-company-id": attempt.company },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const ok = response.status === 403;
    console.log(`${ok ? "PASS" : "FAIL"} ${attempt.name} ${path} (${response.status})`);
    if (!ok) failures += 1;
  }
}
if (failures) process.exit(1);
console.log("FleetOS authenticated cross-tenant probes passed.");
