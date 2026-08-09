import cors from "cors";
import express from "express";

import { config } from "./config.js";

import { dashboardRouter } from "./modules/dashboard/routes.js";
import { vehiclesRouter } from "./modules/vehicles/routes.js";
import { jobsRouter } from "./modules/jobs/routes.js";
import { onboardingRouter } from "./modules/onboarding/routes.js";

export const app = express();

const allowedOrigins = new Set([
  config.CORS_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://fleetos-orpin-one.vercel.app",
  "https://fleetos-davidmlangstead-dots-projects.vercel.app",
  "https://fleetos-git-main-davidmlangstead-dots-projects.vercel.app",
]);

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  // Vercel creates unique deployment URLs for production/preview builds.
  // Allow only FleetOS deployment URLs, not arbitrary *.vercel.app sites.
  if (
    /^https:\/\/fleetos(?:-[a-z0-9]+)*-davidmlangstead-dots-projects\.vercel\.app$/i.test(
      origin
    )
  ) {
    return true;
  }

  if (/^http:\/\/localhost:\d+$/.test(origin)) {
    return true;
  }

  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
    return true;
  }

  return false;
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

    credentials: true,

    methods: [
      "GET",
      "HEAD",
      "PUT",
      "PATCH",
      "POST",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "FleetOS API",
    status: "ok",
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
    status: "ok",
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

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("FleetOS API error:", error);

    if (res.headersSent) {
      return;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong";

    res.status(500).json({
      error: message,
    });
  }
);
