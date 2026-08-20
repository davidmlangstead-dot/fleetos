import type { Role } from "@prisma/client";
import type { RequestHandler } from "express";
import { createClient } from "@supabase/supabase-js";
import { config, SUPABASE_AUTH_KEY } from "../config.js";
import { prisma } from "../lib/prisma.js";

type Identity = { id: string; email: string; emailConfirmed: boolean };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function linkAuthIdentity(userId: string, authUserId: string) {
  const existing = await prisma.$queryRaw<{ authUserId: string | null }[]>`
    SELECT "authUserId"::text AS "authUserId" FROM "User" WHERE id = ${userId} LIMIT 1
  `;
  if (existing[0]?.authUserId && existing[0].authUserId !== authUserId) throw new Error("FleetOS account is linked to a different authentication identity");
  await prisma.$executeRaw`UPDATE "User" SET "authUserId" = ${authUserId}::uuid WHERE id = ${userId} AND ("authUserId" IS NULL OR "authUserId" = ${authUserId}::uuid)`;
}

async function syncIdentityEmail<T extends { id: string; email: string }>(user: T, identity: Identity) {
  if (normalizeEmail(user.email) === normalizeEmail(identity.email)) return user;
  return prisma.user.update({ where: { id: user.id }, data: { email: normalizeEmail(identity.email) } });
}

async function ensureUser(identity: Identity) {
  const canonicalIdentity = { ...identity, email: normalizeEmail(identity.email) };
  const linked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE "authUserId" = ${canonicalIdentity.id}::uuid LIMIT 1
  `;
  if (linked[0]) {
    const user = await prisma.user.findUnique({ where: { id: linked[0].id } });
    if (user) return syncIdentityEmail(user, canonicalIdentity);
  }

  const existingById = await prisma.user.findUnique({ where: { id: canonicalIdentity.id } });
  if (existingById) {
    await linkAuthIdentity(existingById.id, canonicalIdentity.id);
    return syncIdentityEmail(existingById, canonicalIdentity);
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email: canonicalIdentity.email } });
  if (existingByEmail) {
    if (!canonicalIdentity.emailConfirmed) throw new Error("Email confirmation is required before linking an existing FleetOS account");
    await linkAuthIdentity(existingByEmail.id, canonicalIdentity.id);
    return existingByEmail;
  }

  try {
    const created = await prisma.user.create({ data: { id: canonicalIdentity.id, email: canonicalIdentity.email } });
    await linkAuthIdentity(created.id, canonicalIdentity.id);
    return created;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002") {
      const createdByAnotherRequest = await prisma.user.findUnique({ where: { email: canonicalIdentity.email } });
      if (createdByAnotherRequest && canonicalIdentity.emailConfirmed) {
        await linkAuthIdentity(createdByAnotherRequest.id, canonicalIdentity.id);
        return createdByAnotherRequest;
      }
    }
    throw error;
  }
}

export async function isPlatformOwner(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM "PlatformOwner" WHERE "userId"=${userId}) AS exists
  `;
  return rows[0]?.exists === true;
}

export const requireIdentity: RequestHandler = async (req, res, next) => {
  if (res.locals.identity) return next();
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !config.SUPABASE_URL) return res.status(401).json({ error: "Unauthenticated" });

  const supabase = createClient(config.SUPABASE_URL, SUPABASE_AUTH_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  const authUser = data.user;
  if (error || !authUser?.email) return res.status(401).json({ error: "Invalid session" });

  const user = await ensureUser({ id: authUser.id, email: authUser.email, emailConfirmed: Boolean(authUser.email_confirmed_at) });
  res.locals.identity = { id: user.id, email: user.email };
  next();
};

export const requirePlatformOwner: RequestHandler = async (req, res, next) => {
  await requireIdentity(req, res, async () => {
    if (!(await isPlatformOwner(res.locals.identity.id))) return res.status(403).json({ error: "FleetOS owner access is required" });
    res.locals.platformOwner = true;
    next();
  });
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  if (req.user) return next();
  await requireIdentity(req, res, async () => {
    const requestedCompanyId = req.header("x-company-id")?.trim();
    const membership = requestedCompanyId
      ? await prisma.companyMembership.findUnique({ where: { userId_companyId: { userId: res.locals.identity.id, companyId: requestedCompanyId } } })
      : await prisma.companyMembership.findFirst({ where: { userId: res.locals.identity.id }, orderBy: { createdAt: "asc" } });

    if (!membership) return res.status(403).json({ error: "No active company membership" });
    req.user = { id: res.locals.identity.id, email: res.locals.identity.email, companyId: membership.companyId, role: membership.role };
    next();
  });
};

export function requireRoles(...allowed: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!allowed.includes(req.user.role as Role)) return res.status(403).json({ error: "You do not have permission for this action" });
    next();
  };
}
