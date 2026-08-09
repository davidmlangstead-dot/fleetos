import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { config, SUPABASE_AUTH_KEY } from "../config.js";
import { prisma } from "../lib/prisma.js";

async function ensureUser(identity: { id: string; email: string }) {
  const existingById = await prisma.user.findUnique({
    where: { id: identity.id },
  });
  if (existingById) return existingById;

  const existingByEmail = await prisma.user.findUnique({
    where: { email: identity.email },
  });
  if (existingByEmail) return existingByEmail;

  try {
    return await prisma.user.create({
      data: { id: identity.id, email: identity.email },
    });
  } catch (error) {
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

  // Prefer the server-only service-role key when configured, falling back to
  // the publishable/anon key for environments that don't provide one.
  // getUser(token) still validates the caller's bearer token with Supabase.
  const supabase = createClient(config.SUPABASE_URL, SUPABASE_AUTH_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const user = await ensureUser({
    id: data.user.id,
    email: data.user.email,
  });

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
