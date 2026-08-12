import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const medicRouter = Router();

/**
 * FleetOS Medic is deliberately truthful: a check is only PASS when the
 * dependency was actually exercised. It never reports a green status from
 * configuration alone.
 */
medicRouter.get("/", async (_req, res) => {
  const checks: Record<string, { status: "PASS" | "WARN" | "FAIL"; detail: string }> = {};

  checks.api = { status: "PASS", detail: "FleetOS API is responding." };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "PASS", detail: "Database connection and query succeeded." };
  } catch (error) {
    checks.database = {
      status: "FAIL",
      detail: error instanceof Error ? error.message : "Database check failed.",
    };
  }

  const failed = Object.values(checks).filter((check) => check.status === "FAIL").length;
  const warnings = Object.values(checks).filter((check) => check.status === "WARN").length;

  res.status(failed ? 503 : 200).json({
    service: "FleetOS Medic",
    status: failed ? "FAIL" : warnings ? "WARN" : "PASS",
    checkedAt: new Date().toISOString(),
    checks,
    deployment: {
      commit: process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.NODE_ENV ?? "unknown",
    },
  });
});
