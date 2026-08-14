const API = (process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com").replace(/\/$/, "");
const PATH = process.env.LOAD_TEST_PATH ?? "/health";
const STAGES = (process.env.LOAD_TEST_STAGES ?? "5,10,25,50")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0 && value <= 100);
const STAGE_SECONDS = Math.min(Math.max(Number(process.env.LOAD_TEST_STAGE_SECONDS ?? 8), 2), 30);
const THINK_MS = Math.min(Math.max(Number(process.env.LOAD_TEST_THINK_MS ?? 1000), 100), 5000);
const TIMEOUT_MS = Math.min(Math.max(Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 5000), 500), 20000);
const MAX_ERROR_RATE = Math.min(Math.max(Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? 0.05), 0), 1);
const MAX_P95_MS = Math.min(Math.max(Number(process.env.LOAD_TEST_MAX_P95_MS ?? 2000), 100), 30000);

if (!STAGES.length) {
  console.error("No valid LOAD_TEST_STAGES supplied.");
  process.exit(2);
}
if (!PATH.startsWith("/")) {
  console.error("LOAD_TEST_PATH must start with '/'.");
  process.exit(2);
}

const target = `${API}${PATH}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
};

async function requestOnce() {
  const started = performance.now();
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { "User-Agent": "FleetOS-safe-load-test/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, ms: performance.now() - started };
  } catch (error) {
    return {
      ok: false,
      status: "ERROR",
      ms: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runStage(concurrency) {
  const deadline = performance.now() + STAGE_SECONDS * 1000;
  const results = [];

  async function worker() {
    while (performance.now() < deadline) {
      const loopStarted = performance.now();
      results.push(await requestOnce());
      const remainingThink = THINK_MS - (performance.now() - loopStarted);
      if (remainingThink > 0) await sleep(remainingThink);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const latencies = results.map((item) => item.ms);
  const failures = results.filter((item) => !item.ok);
  const statusCounts = new Map();
  for (const item of results) statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);

  return {
    concurrency,
    requests: results.length,
    failures: failures.length,
    errorRate: results.length ? failures.length / results.length : 1,
    rps: results.length / STAGE_SECONDS,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies.length ? Math.max(...latencies) : 0,
    statuses: [...statusCounts.entries()].map(([status, count]) => `${status}:${count}`).join(", "),
  };
}

console.log("FleetOS safe load test");
console.log(`Target: ${target}`);
console.log(`Stages: ${STAGES.join(" -> ")} concurrent users`);
console.log(`Stage duration: ${STAGE_SECONDS}s | think time: ${THINK_MS}ms | timeout: ${TIMEOUT_MS}ms`);
console.log("Only the configured GET endpoint is called; no auth tokens or write requests are used.\n");

console.log("Warming endpoint...");
const warmup = await requestOnce();
if (!warmup.ok) {
  console.error(`Warmup failed (${warmup.status}) after ${warmup.ms.toFixed(0)}ms${warmup.error ? `: ${warmup.error}` : ""}`);
  process.exit(1);
}
console.log(`Warmup OK (${warmup.status}, ${warmup.ms.toFixed(0)}ms)\n`);

const summaries = [];
for (const concurrency of STAGES) {
  const summary = await runStage(concurrency);
  summaries.push(summary);
  console.log(
    `${String(concurrency).padStart(3)} users | ${String(summary.requests).padStart(4)} req | ` +
      `${summary.rps.toFixed(1).padStart(5)} rps | errors ${(summary.errorRate * 100).toFixed(1).padStart(5)}% | ` +
      `p50 ${summary.p50.toFixed(0).padStart(4)}ms | p95 ${summary.p95.toFixed(0).padStart(4)}ms | ` +
      `p99 ${summary.p99.toFixed(0).padStart(4)}ms | max ${summary.max.toFixed(0).padStart(4)}ms | ${summary.statuses}`,
  );
  await sleep(1000);
}

const failedStages = summaries.filter(
  (stage) => stage.errorRate > MAX_ERROR_RATE || stage.p95 > MAX_P95_MS,
);

console.log("\nThresholds:");
console.log(`- max error rate: ${(MAX_ERROR_RATE * 100).toFixed(1)}%`);
console.log(`- max p95 latency: ${MAX_P95_MS}ms`);

if (failedStages.length) {
  console.error(`LOAD TEST FAILED: ${failedStages.length}/${summaries.length} stage(s) exceeded thresholds.`);
  process.exit(1);
}

console.log(`LOAD TEST PASSED: ${summaries.length}/${summaries.length} stage(s) stayed within thresholds.`);
