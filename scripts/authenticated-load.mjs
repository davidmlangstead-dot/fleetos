const API = process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com";
const token = process.env.FLEETOS_SECURITY_TOKEN_A;
const company = process.env.FLEETOS_SECURITY_COMPANY_A;

const missing = [
  ["FLEETOS_SECURITY_TOKEN_A", token],
  ["FLEETOS_SECURITY_COMPANY_A", company],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  const message = `Authenticated load test cannot run; missing: ${missing.join(", ")}.`;
  if (process.env.CI === "true") {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`SKIP ${message}`);
  process.exit(0);
}

const paths = [
  "/api/company",
  "/api/dashboard",
  "/api/vehicles",
  "/api/drivers",
  "/api/jobs",
  "/api/operations/maintenance",
  "/api/messages",
  "/api/notifications",
];
const stages = [5, 10, 25];
const requestsPerWorker = 6;
const timeoutMs = 20_000;
const maxErrorRate = Number(process.env.FLEETOS_AUTH_LOAD_MAX_ERROR_RATE ?? "0.01");
const maxP95Ms = Number(process.env.FLEETOS_AUTH_LOAD_MAX_P95_MS ?? "2500");

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function hit(path) {
  const start = performance.now();
  try {
    const response = await fetch(`${API}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-company-id": company,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      duration: performance.now() - start,
      path,
    };
  } catch (error) {
    return { ok: false, status: 0, duration: performance.now() - start, path, error: String(error) };
  }
}

let failedStages = 0;
for (const concurrency of stages) {
  const results = [];
  const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
    for (let i = 0; i < requestsPerWorker; i += 1) {
      const path = paths[(workerIndex + i) % paths.length];
      results.push(await hit(path));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
  await Promise.all(workers);

  const errors = results.filter((result) => !result.ok);
  const durations = results.map((result) => result.duration);
  const errorRate = results.length ? errors.length / results.length : 1;
  const p50 = Math.round(percentile(durations, 0.5));
  const p95 = Math.round(percentile(durations, 0.95));
  const p99 = Math.round(percentile(durations, 0.99));
  const pass = errorRate <= maxErrorRate && p95 <= maxP95Ms;
  console.log(`${pass ? "PASS" : "FAIL"} authenticated concurrency=${concurrency} requests=${results.length} errors=${errors.length} errorRate=${(errorRate * 100).toFixed(2)}% p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
  if (errors.length) {
    const summary = new Map();
    for (const error of errors) {
      const key = `${error.path} -> ${error.status || "network"}`;
      summary.set(key, (summary.get(key) ?? 0) + 1);
    }
    for (const [key, count] of summary) console.log(`  ${count}x ${key}`);
  }
  if (!pass) failedStages += 1;
}

if (failedStages) process.exit(1);
console.log("FleetOS authenticated read load checks passed.");
