const API = (process.env.FLEETOS_API_URL || "https://fleetos-api.onrender.com").replace(/\/$/, "");
const WEB = (process.env.FLEETOS_WEB_URL || "https://fleetos-orpin-one.vercel.app").replace(/\/$/, "");
const timeoutMs = Number(process.env.FLEETOS_MEDIC_TIMEOUT_MS || 10000);

async function probe(name, url, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "follow", ...options, signal: controller.signal });
    const latencyMs = Date.now() - started;
    return { name, ok: response.ok, status: response.status, latencyMs, url };
  } catch (error) {
    return { name, ok: false, status: 0, latencyMs: Date.now() - started, url, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const checks = await Promise.all([
  probe("api-health", `${API}/health`),
  probe("medic-liveness", `${API}/api/medic`),
  probe("web-shell", WEB),
]);

for (const check of checks) {
  const mark = check.ok ? "PASS" : "FAIL";
  console.log(`[MEDIC ${mark}] ${check.name}: HTTP ${check.status} in ${check.latencyMs}ms`);
}

const failed = checks.filter((check) => !check.ok);
const slow = checks.filter((check) => check.ok && check.latencyMs > 2500);
const report = {
  service: "FleetOS Backstage Medic",
  checkedAt: new Date().toISOString(),
  status: failed.length ? "FAIL" : slow.length ? "WARN" : "PASS",
  authority: { observe: true, destructiveRecovery: false, automaticDeployments: false, automaticSecurityChanges: false },
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
