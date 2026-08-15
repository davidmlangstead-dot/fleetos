import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errors.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
import { apiRateLimit, sensitiveRateLimit } from "./middleware/rateLimit.js";
import { companyRouter } from "./modules/company/routes.js";
import { commercialRouter } from "./modules/commercial/routes.js";
import { importsRouter } from "./modules/imports/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { driversRouter } from "./modules/drivers/routes.js";
import { vehiclesRouter } from "./modules/vehicles/routes.js";
import { jobsRouter } from "./modules/jobs/routes.js";
import { operationsRouter } from "./modules/operations/routes.js";
import { organisationRouter } from "./modules/organisation/routes.js";
import { registersRouter } from "./modules/registers/routes.js";
import { messagesRouter } from "./modules/messages/routes.js";
import { documentsRouter } from "./modules/documents/routes.js";
import { reportsRouter } from "./modules/reports/routes.js";
import { marketplaceRouter } from "./modules/marketplace/routes.js";
import { medicRouter } from "./modules/medic/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { driverOperationsRouter } from "./modules/driver-operations/routes.js";
import { tachographRouter } from "./modules/tachograph/routes.js";

export const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const configuredOrigins = [config.CORS_ORIGIN].filter(Boolean);
const fixedOrigins = new Set([
  "https://fleetos-orpin-one.vercel.app",
  "https://fleetos-davidmlangstead-dots-projects.vercel.app",
  "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app",
]);
async function isAllowedOrigin(origin: string) {
  if (configuredOrigins.includes(origin) || fixedOrigins.has(origin)) return true;
  if (/^https:\/\/fleetos(?:-[a-z0-9]+)*-davidmlangstead-dots-projects\.vercel\.app$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.port) return false;
    const matches = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM "CompanyControl"
        WHERE "customDomainVerified"=true AND lower("customDomain")=${url.hostname.toLowerCase()}
      ) AS exists
    `;
    return matches[0]?.exists === true;
  } catch {
    return false;
  }
}
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    void isAllowedOrigin(origin).then((allowed) => {
      if (allowed) return callback(null, true);
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Origin not allowed by FleetOS API"));
    }).catch(() => callback(new Error("Origin not allowed by FleetOS API")));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Company-Id", "X-Idempotency-Key"],
}));
app.use(express.json({ limit: "2mb" }));
app.get("/", (_req, res) => res.json({ name: "FleetOS API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/api", (_req, res) => res.json({ name: "FleetOS API", status: "ok" }));
app.use("/api", apiRateLimit);
app.use("/api/company", sensitiveRateLimit, companyRouter);
app.use("/api/commercial", sensitiveRateLimit, commercialRouter);
app.use("/api/imports", sensitiveRateLimit, idempotencyMiddleware, importsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/drivers", sensitiveRateLimit, requireAuth, idempotencyMiddleware, driversRouter);
app.use("/api/vehicles", requireAuth, idempotencyMiddleware, vehiclesRouter);
app.use("/api/jobs", requireAuth, idempotencyMiddleware, jobsRouter);
app.use("/api/operations", requireAuth, idempotencyMiddleware, operationsRouter);
app.use("/api/organisation", sensitiveRateLimit, organisationRouter);
app.use("/api/registers", requireAuth, idempotencyMiddleware, registersRouter);
app.use("/api/messages", requireAuth, idempotencyMiddleware, messagesRouter);
app.use("/api/documents", sensitiveRateLimit, documentsRouter);
app.use("/api/tachograph", sensitiveRateLimit, idempotencyMiddleware, tachographRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/marketplace", marketplaceRouter);
app.use("/api/medic", sensitiveRateLimit, medicRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/driver-operations", sensitiveRateLimit, requireAuth, idempotencyMiddleware, driverOperationsRouter);
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);