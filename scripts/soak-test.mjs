const API = process.env.FLEETOS_API_URL ?? "https://fleetos-1.onrender.com";
const path = process.env.FLEETOS_SOAK_PATH ?? "/health";
const concurrency = Math.max(1, Math.min(25, Number(process.env.FLEETOS_SOAK_CONCURRENCY ?? 10)));
const durationMs = Math.max(60_000, Math.min(30 * 60_000, Number(process.env.FLEETOS_SOAK_DURATION_MS ?? 600_000)));
const thinkMs = Math.max(50, Number(process.env.FLEETOS_SOAK_THINK_MS ?? 250));
const maxErrorRate = Number(process.env.FLEETOS_SOAK_MAX_ERROR_RATE ?? 0.01);
const maxP95 = Number(process.env.FLEETOS_SOAK_MAX_P95_MS ?? 2500);
const latencies = [];
let requests = 0;
let failures = 0;
const deadline = Date.now() + durationMs;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function worker() {
  while (Date.now() < deadline) {
    const started = Date.now();
    try {
      const response = await fetch(`${API}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
      await response.arrayBuffer();
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      requests += 1;
      latencies.push(Date.now() - started);
    }
    await new Promise(resolve => setTimeout(resolve, thinkMs));
  }
}

console.log(`FleetOS soak: ${API}${path}, concurrency=${concurrency}, duration=${Math.round(durationMs / 60000)}m`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const errorRate = requests ? failures / requests : 1;
const p50 = percentile(latencies, 0.50);
const p95 = percentile(latencies, 0.95);
const p99 = percentile(latencies, 0.99);
console.log(`requests=${requests} failures=${failures} errorRate=${(errorRate * 100).toFixed(2)}% p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
if (errorRate > maxErrorRate || p95 > maxP95) process.exit(1);
console.log("FleetOS soak test passed.");
