import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientKey(req: Parameters<RequestHandler>[0]) {
  // Express resolves req.ip using the configured trusted proxy chain. Avoid
  // trusting a raw X-Forwarded-For value supplied directly by a client.
  return req.ip || req.socket.remoteAddress || "unknown";
}

function limiter(windowMs: number, max: number, namespace: string): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${namespace}:${clientKey(req)}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }
    next();
  };
}

export const apiRateLimit = limiter(60_000, 240, "api");
export const sensitiveRateLimit = limiter(60_000, 40, "sensitive");

// Bound memory for long-running instances. This cleanup never affects request data.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 5 * 60_000).unref();
