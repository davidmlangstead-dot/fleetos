import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { errorHandler } from "./middleware/errors.js";
import { companyRouter } from "./modules/company/routes.js";
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

export const app = express();
const configuredOrigins = [config.CORS_ORIGIN].filter(Boolean);
const fixedOrigins = new Set([
  "https://fleetos-orpin-one.vercel.app",
  "https://fleetos-davidmlangstead-dots-projects.vercel.app",
  "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app",
]);
function isAllowedOrigin(origin: string) {
  if (configuredOrigins.includes(origin) || fixedOrigins.has(origin)) return true;
  if (/^https:\/\/fleetos(?:-[a-z0-9]+)*-davidmlangstead-dots-projects\.vercel\.app$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error("Origin not allowed by FleetOS API"));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Company-Id"],
}));
app.use(express.json({ limit: "2mb" }));
app.get("/", (_req, res) => res.json({ name: "FleetOS API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/api", (_req, res) => res.json({ name: "FleetOS API", status: "ok" }));
app.use("/api/company", companyRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/operations", operationsRouter);
app.use("/api/organisation", organisationRouter);
app.use("/api/registers", registersRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/reports", reportsRouter);
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);
