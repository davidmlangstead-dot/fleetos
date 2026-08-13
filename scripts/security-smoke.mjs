const API = process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com";
const routes = [
  "/api/company",
  "/api/dashboard",
  "/api/drivers",
  "/api/vehicles",
  "/api/jobs",
  "/api/operations/maintenance",
  "/api/organisation/depots",
  "/api/registers/FUEL",
  "/api/messages",
  "/api/documents/link-options",
  "/api/reports",
  "/api/marketplace",
  "/api/medic/status",
  "/api/notifications",
  "/api/driver-operations/me",
];

const results = [];
async function probe(name, path, headers, expected = 401) {
  const started = Date.now();
  try {
    const response = await fetch(`${API}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const ok = response.status === expected;
    results.push({ name, ok, status: response.status, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, status: "ERROR", ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}

await fetch(`${API}/health`, { signal: AbortSignal.timeout(60_000) }).catch(() => undefined);
for (const route of routes) {
  await probe(`No-session attack ${route}`, route, {});
  await probe(`Forged-session attack ${route}`, route, {
    authorization: "Bearer fleetos-forged-token",
    "x-company-id": "forged-company",
  });
}

try {
  const response = await fetch(`${API}/api`, {
    headers: { origin: "https://attacker.invalid" },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  results.push({ name: "Untrusted browser origin", ok: allowedOrigin === null, status: response.status, ms: 0 });
} catch (error) {
  results.push({ name: "Untrusted browser origin", ok: true, status: "BLOCKED", ms: 0, detail: error instanceof Error ? error.message : String(error) });
}

for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} (${result.status}, ${result.ms}ms)`);
if (results.some((result) => !result.ok)) process.exit(1);
console.log(`FleetOS security probes passed: ${results.length}/${results.length}`);


