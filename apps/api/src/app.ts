import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { errorHandler } from "./middleware/errors.js";

import { dashboardRouter } from "./modules/dashboard/routes.js";
import { jobsRouter } from "./modules/jobs/routes.js";
import { onboardingRouter } from "./modules/onboarding/routes.js";
import { vehiclesRouter } from "./modules/vehicles/routes.js";

export const app = express();

const allowedOrigins = new Set([
  config.CORS_ORIGIN,
  "https://fleetos-orpin-one.vercel.app",
  "https://fleetos-davidmlangstead-dots-projects.vercel.app",
  "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);

function isAllowedOrigin(origin: string) {
  return (
    allowedOrigins.has(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Origin not allowed by FleetOS API"));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "FleetOS API",
    version: "0.1.0",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api", (_req, res) => {
  res.json({
    name: "FleetOS API",
    status: "running",
    endpoints: {
      dashboard: "/api/dashboard",
      vehicles: "/api/vehicles",
      jobs: "/api/jobs",
      onboarding: "/api/onboarding",
      health: "/health",
    },
  });
});

app.use("/api/dashboard", dashboardRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/onboarding", onboardingRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use(errorHandler);
