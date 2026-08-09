import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

async function ensureUser(identity: { id: string; email: string }) {
  const existingById = await prisma.user.findUnique({
    where: { id: identity.id },
  });
  if (existingById) return existingById;

  // A local FleetOS user may already exist for this verified Supabase email
  // (for example after an account/session was recreated). Reuse that user
  // instead of trying to insert a duplicate email and crashing the request.
  const existingByEmail = await prisma.user.findUnique({
    where: { email: identity.email },
  });
  if (existingByEmail) return existingByEmail;

  try {
    return await prisma.user.create({
      data: { id: identity.id, email: identity.email },
    });
  } catch (error) {
    // Protect against two first requests racing to create the same user.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const createdByAnotherRequest = await prisma.user.findUnique({
        where: { email: identity.email },
      });
      if (createdByAnotherRequest) return createdByAnotherRequest;
    }
    throw error;
  }
}

export const requireIdentity: RequestHandler = async (req, res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !config.SUPABASE_URL) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const user = await ensureUser({
    id: data.user.id,
    email: data.user.email,
  });

  // Use the FleetOS user ID for downstream company ownership/membership
  // lookups. This is the existing local user when the email was already
  // present, and the Supabase ID for newly created users.
  res.locals.identity = { id: user.id, email: user.email };
  next();
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  await requireIdentity(req, res, async () => {
    const membership = await prisma.companyMembership.findFirst({
      where: { userId: res.locals.identity.id },
    });
    if (!membership) {
      return res.status(403).json({ error: "No active company membership" });
    }
    req.user = {
      id: res.locals.identity.id,
      email: res.locals.identity.email,
      companyId: membership.companyId,
      role: membership.role,
    };
    next();
  });
};
