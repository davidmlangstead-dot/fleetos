const API = process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com";
const WEB = process.env.FLEETOS_WEB_URL ?? "https://fleetos-orpin-one.vercel.app";

const checks = [];

async function check(name, url, expectedStatuses, validate) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* HTML/text is valid for web checks */ }
    const ok = expectedStatuses.includes(response.status) && (!validate || validate(body, response));
    checks.push({ name, ok, status: response.status, ms: Date.now() - started });
    if (!ok) throw new Error(`${name} returned ${response.status}`);
  } catch (error) {
    const existing = checks.find((item) => item.name === name);
    if (!existing) checks.push({ name, ok: false, status: "ERROR", ms: Date.now() - started });
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

await check("API health", `${API}/health`, [200], (body) => body && body.status === "ok");
await check("API root", `${API}/api`, [200], (body) => body && body.status === "ok");
await check("Protected company route", `${API}/api/company`, [401]);
await check("Protected Medic route", `${API}/api/medic/status`, [401]);
await check("Unknown API route", `${API}/api/__fleetos_smoke_missing__`, [404]);
await check("Web app", WEB, [200]);

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name} (${item.status}, ${item.ms}ms)`);
}

if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`FleetOS smoke checks passed: ${checks.length}/${checks.length}`);
