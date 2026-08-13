import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth } from "../../middleware/auth.js";

const createConversation = z.object({ title: z.string().trim().min(1).max(120), memberUserIds: z.array(z.string().min(1)).max(50).default([]) });
const sendMessage = z.object({ body: z.string().trim().min(1).max(5000) });
const updateConversation = z.object({ title: z.string().trim().min(1).max(120).optional(), archived: z.boolean().optional() });
const updateMembers = z.object({ memberUserIds: z.array(z.string().min(1)).min(1).max(50) });

type ConversationRow = {
  id: string; title: string; createdById: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null;
  lastMessage: string | null; lastMessageAt: Date | null; memberCount: bigint; unreadCount: bigint;
};
type MessageRow = { id: string; body: string; createdAt: Date; senderUserId: string; senderEmail: string | null; senderFirstName: string | null; senderLastName: string | null };
type MemberRow = { id: string; email: string; firstName: string | null; lastName: string | null; role: string; joinedAt: Date };

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

function canManage(role: string, creatorId: string, userId: string) {
  return creatorId === userId || ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(role);
}

async function requireConversationMember(companyId: string, userId: string, conversationId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; title: string; createdById: string; archivedAt: Date | null }>>`
    SELECT c.id::text, c.title, c."createdById", c."archivedAt" FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId"=c.id
    WHERE c.id=${conversationId}::uuid AND c."companyId"=${companyId} AND cm."userId"=${userId} LIMIT 1
  `;
  return rows[0] ?? null;
}

messagesRouter.get("/members", asyncHandler(async (req, res) => {
  const memberships = await prisma.companyMembership.findMany({
    where: { companyId: req.user!.companyId }, select: { role: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" }, take: 250,
  });
  res.json(memberships.map(m => ({ ...m.user, role: m.role })));
}));

messagesRouter.get("/", asyncHandler(async (req, res) => {
  const includeArchived = req.query.archived === "true";
  const rows = await prisma.$queryRaw<ConversationRow[]>`
    SELECT c.id::text, c.title, c."createdById", c."createdAt", c."updatedAt", c."archivedAt",
      (SELECT m.body FROM "Message" m WHERE m."conversationId"=c.id ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessage",
      (SELECT m."createdAt" FROM "Message" m WHERE m."conversationId"=c.id ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessageAt",
      (SELECT COUNT(*) FROM "ConversationMember" cm2 WHERE cm2."conversationId"=c.id) AS "memberCount",
      (SELECT COUNT(*) FROM "Message" unread WHERE unread."conversationId"=c.id AND unread."createdAt">cm."lastReadAt" AND unread."senderUserId"<>${req.user!.id}) AS "unreadCount"
    FROM "Conversation" c JOIN "ConversationMember" cm ON cm."conversationId"=c.id
    WHERE c."companyId"=${req.user!.companyId} AND cm."userId"=${req.user!.id}
      AND (${includeArchived} OR c."archivedAt" IS NULL)
    ORDER BY c."updatedAt" DESC LIMIT 100
  `;
  res.json(rows.map(r => ({ ...r, memberCount: Number(r.memberCount), unreadCount: Number(r.unreadCount) })));
}));

messagesRouter.post("/", asyncHandler(async (req, res) => {
  const input = createConversation.parse(req.body);
  const requested = [...new Set([...input.memberUserIds, req.user!.id])];
  const validMemberships = await prisma.companyMembership.findMany({ where: { companyId: req.user!.companyId, userId: { in: requested } }, select: { userId: true } });
  const valid = new Set(validMemberships.map(m => m.userId));
  if (!valid.has(req.user!.id) || requested.some(id => !valid.has(id))) return res.status(400).json({ error: "Every participant must belong to the selected company" });
  const id = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "Conversation" (id,"companyId",title,"createdById","createdAt","updatedAt") VALUES (${id}::uuid,${req.user!.companyId},${input.title},${req.user!.id},NOW(),NOW())`;
    for (const userId of requested) await tx.$executeRaw`INSERT INTO "ConversationMember" ("conversationId","userId","createdAt","lastReadAt") VALUES (${id}::uuid,${userId},NOW(),NOW())`;
  });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "CONVERSATION", entityId: id, summary: `Conversation created: ${input.title}` });
  res.status(201).json({ id, title: input.title, createdById: req.user!.id, memberCount: requested.length, unreadCount: 0 });
}));

messagesRouter.get("/:id", asyncHandler(async (req, res) => {
  const conversation = await requireConversationMember(req.user!.companyId, req.user!.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  const [messages, members] = await Promise.all([
    prisma.$queryRaw<MessageRow[]>`
      SELECT m.id::text,m.body,m."createdAt",m."senderUserId",u.email AS "senderEmail",u."firstName" AS "senderFirstName",u."lastName" AS "senderLastName"
      FROM "Message" m LEFT JOIN "User" u ON u.id=m."senderUserId"
      WHERE m."conversationId"=${req.params.id}::uuid AND m."companyId"=${req.user!.companyId}
      ORDER BY m."createdAt" ASC LIMIT 1000
    `,
    prisma.$queryRaw<MemberRow[]>`
      SELECT u.id,u.email,u."firstName",u."lastName",membership.role::text,cm."createdAt" AS "joinedAt"
      FROM "ConversationMember" cm JOIN "User" u ON u.id=cm."userId"
      JOIN "CompanyMembership" membership ON membership."userId"=u.id AND membership."companyId"=${req.user!.companyId}
      WHERE cm."conversationId"=${req.params.id}::uuid ORDER BY u."firstName",u."lastName",u.email
    `,
  ]);
  await prisma.$executeRaw`UPDATE "ConversationMember" SET "lastReadAt"=NOW() WHERE "conversationId"=${req.params.id}::uuid AND "userId"=${req.user!.id}`;
  res.json({ conversation, messages, members });
}));

messagesRouter.post("/:id", asyncHandler(async (req, res) => {
  const input = sendMessage.parse(req.body);
  const conversation = await requireConversationMember(req.user!.companyId, req.user!.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  if (conversation.archivedAt) return res.status(409).json({ error: "Restore this conversation before sending a message" });
  const id = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "Message" (id,"conversationId","companyId","senderUserId",body,"createdAt") VALUES (${id}::uuid,${req.params.id}::uuid,${req.user!.companyId},${req.user!.id},${input.body},NOW())`;
    await tx.$executeRaw`UPDATE "Conversation" SET "updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId}`;
    await tx.$executeRaw`UPDATE "ConversationMember" SET "lastReadAt"=NOW() WHERE "conversationId"=${req.params.id}::uuid AND "userId"=${req.user!.id}`;
  });
  res.status(201).json({ id, body: input.body, senderUserId: req.user!.id, createdAt: new Date().toISOString() });
}));

messagesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const input = updateConversation.parse(req.body);
  const conversation = await requireConversationMember(req.user!.companyId, req.user!.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  if (!canManage(req.user!.role, conversation.createdById, req.user!.id)) return res.status(403).json({ error: "Only the conversation owner or a company manager can change this thread" });
  const title = input.title ?? conversation.title;
  const archivedAt = input.archived === undefined ? conversation.archivedAt : input.archived ? new Date() : null;
  await prisma.$executeRaw`UPDATE "Conversation" SET title=${title},"archivedAt"=${archivedAt},"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId}`;
  res.json({ ok: true, title, archivedAt });
}));

messagesRouter.put("/:id/members", asyncHandler(async (req, res) => {
  const input = updateMembers.parse(req.body);
  const conversation = await requireConversationMember(req.user!.companyId, req.user!.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  if (!canManage(req.user!.role, conversation.createdById, req.user!.id)) return res.status(403).json({ error: "Only the conversation owner or a company manager can change participants" });
  const requested = [...new Set([...input.memberUserIds, conversation.createdById])];
  const valid = await prisma.companyMembership.findMany({ where: { companyId: req.user!.companyId, userId: { in: requested } }, select: { userId: true } });
  if (valid.length !== requested.length) return res.status(400).json({ error: "Every participant must belong to the selected company" });
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`DELETE FROM "ConversationMember" WHERE "conversationId"=${req.params.id}::uuid AND "userId"<>${conversation.createdById} AND NOT ("userId"=ANY(${requested}::text[]))`;
    for (const userId of requested) await tx.$executeRaw`INSERT INTO "ConversationMember" ("conversationId","userId","createdAt","lastReadAt") VALUES (${req.params.id}::uuid,${userId},NOW(),NOW()) ON CONFLICT ("conversationId","userId") DO NOTHING`;
    await tx.$executeRaw`UPDATE "Conversation" SET "updatedAt"=NOW() WHERE id=${req.params.id}::uuid`;
  });
  res.json({ ok: true, memberCount: requested.length });
}));
