import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";

type StoredRequest = {
  state: string;
  responseStatus: number | null;
  responseBody: unknown;
  updatedAt: Date;
};

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const validKey = /^[a-zA-Z0-9_.:-]{8,128}$/;

export const idempotencyMiddleware: RequestHandler = async (req, res, next) => {
  if (!mutationMethods.has(req.method)) return next();
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });

  const key = req.header("x-idempotency-key")?.trim();
  if (!key) return next();
  if (!validKey.test(key)) return res.status(400).json({ error: "Invalid idempotency key" });

  const companyId = req.user.companyId;
  const userId = req.user.id;
  const path = req.originalUrl.slice(0, 500);

  await prisma.$executeRaw`
    DELETE FROM "IdempotencyRequest"
    WHERE "companyId"=${companyId} AND "expiresAt" < NOW()
  `;

  const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "IdempotencyRequest" ("companyId","userId","key","method","path","state","createdAt","updatedAt","expiresAt")
    VALUES (${companyId},${userId},${key},${req.method},${path},'PROCESSING',NOW(),NOW(),NOW()+INTERVAL '7 days')
    ON CONFLICT ("companyId","userId","key") DO NOTHING
    RETURNING id::text
  `;

  if (!inserted.length) {
    const existing = await prisma.$queryRaw<StoredRequest[]>`
      SELECT state,"responseStatus","responseBody","updatedAt"
      FROM "IdempotencyRequest"
      WHERE "companyId"=${companyId} AND "userId"=${userId} AND "key"=${key}
      LIMIT 1
    `;
    const stored = existing[0];
    if (stored?.state === "COMPLETED" && stored.responseStatus) {
      res.setHeader("X-FleetOS-Replayed", "true");
      if (stored.responseStatus === 204) return res.status(204).end();
      return res.status(stored.responseStatus).json(stored.responseBody ?? {});
    }

    const reclaimed = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "IdempotencyRequest"
      SET "updatedAt"=NOW(), "method"=${req.method}, "path"=${path}
      WHERE "companyId"=${companyId} AND "userId"=${userId} AND "key"=${key}
        AND state='PROCESSING' AND "updatedAt" < NOW()-INTERVAL '5 minutes'
      RETURNING id::text
    `;
    if (!reclaimed.length) {
      return res.status(409).json({
        error: "This offline change is already syncing. Try again shortly.",
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
    }
  }

  let responseBody: unknown = null;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as typeof res.json;

  res.once("finish", () => {
    const status = res.statusCode;
    if (status === 429 || status >= 500) {
      void prisma.$executeRaw`
        DELETE FROM "IdempotencyRequest"
        WHERE "companyId"=${companyId} AND "userId"=${userId} AND "key"=${key}
      `.catch((error) => console.error("FleetOS idempotency retry cleanup failed", error));
      return;
    }
    void prisma.$executeRaw`
      UPDATE "IdempotencyRequest"
      SET state='COMPLETED', "responseStatus"=${status}, "responseBody"=${responseBody ?? null}::jsonb,
          "completedAt"=NOW(), "updatedAt"=NOW()
      WHERE "companyId"=${companyId} AND "userId"=${userId} AND "key"=${key}
    `.catch((error) => console.error("FleetOS idempotency result storage failed", error));
  });

  next();
};

