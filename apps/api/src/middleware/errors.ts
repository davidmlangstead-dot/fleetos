import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ error: "Validation failed", details: error.flatten() });

  console.error(error);

  // Medic records only a sanitised fingerprint of unexpected authenticated API failures.
  // Raw stack traces, credentials, request bodies and secrets are deliberately excluded.
  if (req.user?.companyId) {
    const source = `${req.method} ${req.path}`.slice(0, 80);
    const detail = error instanceof Error ? `Error type: ${error.name}` : "Unknown server error type";
    void prisma.$executeRaw`
      INSERT INTO "MedicIncident" ("companyId", "actorUserId", severity, status, code, source, summary, detail)
      VALUES (${req.user.companyId}, ${req.user.id}, 'CRITICAL', 'OPEN', 'API_UNHANDLED_500', ${source}, 'FleetOS API encountered an unexpected server error.', ${detail})
    `.catch((medicError) => console.error("FleetOS Medic could not record API incident", medicError));
  }

  return res.status(500).json({ error: "Something went wrong" });
};
