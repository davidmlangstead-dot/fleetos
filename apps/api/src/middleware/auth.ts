import type { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

async function ensureUser(identity: { id: string; email: string }) {
  const existing = await prisma.user.findUnique({ where: { id: identity.id } });
  if (existing) return existing;
  return prisma.user.create({ data: { id: identity.id, email: identity.email } });
}

export const requireIdentity: RequestHandler = async (req, res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !config.SUPABASE_URL) return res.status(401).json({ error: "Unauthenticated" });
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return res.status(401).json({ error: "Invalid session" });
  await ensureUser({ id: data.user.id, email: data.user.email });
  res.locals.identity = { id: data.user.id, email: data.user.email };
  next();
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  await requireIdentity(req, res, async () => {
    const membership = await prisma.companyMembership.findFirst({ where: { userId: res.locals.identity.id } });
    if (!membership) return res.status(403).json({ error: "No active company membership" });
    req.user = { id: res.locals.identity.id, email: res.locals.identity.email, companyId: membership.companyId, role: membership.role };
    next();
  });
};
