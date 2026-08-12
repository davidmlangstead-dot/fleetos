import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth } from "../../middleware/auth.js";

const createConversation = z.object({
  title: z.string().trim().min(1).max(120),
  memberUserIds: z.array(z.string().min(1)).max(50).default([]),
});
const sendMessage = z.object({ body: z.string().trim().min(1).max(5000) });

type ConversationRow = {
  id: string; title: string; createdAt: Date; updatedAt: Date;
  lastMessage: string | null; lastMessageAt: Date | null; memberCount: bigint;
};
type MessageRow = { id: string; body: string; createdAt: Date; senderUserId: string; senderEmail: string | null; senderFirstName: string | null; senderLastName: string | null };

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

messagesRouter.get("/members", asyncHandler(async (req, res) => {
  const memberships = await prisma.companyMembership.findMany({
    where: { companyId: req.user!.companyId },
    select: { role: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
    take: 250,
  });
  return res.json(memberships.map(m => ({ ...m.user, role: m.role })));
}));

messagesRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<ConversationRow[]>`
    SELECT c.id, c.title, c."createdAt", c."updatedAt",
      (SELECT m.body FROM "Message" m WHERE m."conversationId" = c.id ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessage",
      (SELECT m."createdAt" FROM "Message" m WHERE m."conversationId" = c.id ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessageAt",
      (SELECT COUNT(*) FROM "ConversationMember" cm2 WHERE cm2."conversationId" = c.id) AS "memberCount"
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c.id
    WHERE c."companyId" = ${req.user!.companyId} AND cm."userId" = ${req.user!.id}
    ORDER BY c."updatedAt" DESC
    LIMIT 100
  `;
  return res.json(rows.map(r => ({ ...r, memberCount: Number(r.memberCount) })));
}));

messagesRouter.post("/", asyncHandler(async (req, res) => {
  const input = createConversation.parse(req.body);
  const requested = [...new Set([...input.memberUserIds, req.user!.id])];
  const validMemberships = await prisma.companyMembership.findMany({
    where: { companyId: req.user!.companyId, userId: { in: requested } },
    select: { userId: true },
  });
  const valid = new Set(validMemberships.map(m => m.userId));
  if (!valid.has(req.user!.id) || requested.some(id => !valid.has(id))) return res.status(400).json({ error: "Every participant must belong to the selected company" });

  const id = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "Conversation" (id, "companyId", title, "createdById", "createdAt", "updatedAt") VALUES (${id}::uuid, ${req.user!.companyId}, ${input.title}, ${req.user!.id}, NOW(), NOW())`;
    for (const userId of requested) await tx.$executeRaw`INSERT INTO "ConversationMember" ("conversationId", "userId", "createdAt") VALUES (${id}::uuid, ${userId}, NOW())`;
  });
  await writeAuditEvent({ companyId: req.user!.companyId, actorUserId: req.user!.id, actorEmail: req.user!.email, action: "CREATE", entityType: "CONVERSATION", entityId: id, summary: `Conversation created: ${input.title}` });
  return res.status(201).json({ id, title: input.title, memberCount: requested.length });
}));

async function requireConversationMember(companyId: string, userId: string, conversationId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c.id
    WHERE c.id = ${conversationId}::uuid AND c."companyId" = ${companyId} AND cm."userId" = ${userId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

messagesRouter.get("/:id", asyncHandler(async (req, res) => {
  const conversation = await requireConversationMember(req.user!.companyId, req.user!.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  const messages = await prisma.$queryRaw<MessageRow[]>`
    SELECT m.id, m.body, m."createdAt", m."senderUserId", u.email AS "senderEmail", u."firstName" AS "senderFirstName", u."lastName" AS "senderLastName"
    FROM "Message" m LEFT JOIN "User" u ON u.id = m."senderUserId"
    WHERE m."conversationId" = ${req.params.id}::uuid AND m."companyId" = ${req.user!.companyId}
    ORDER BY m."createdAt" ASC LIMIT 500
  `;
  return res.json(messages);
}));

messagesRouter.post("/:id", asyncHandler(async (req, res) => {
  const input = sendMessage.parse(req.body);
  const conversation = await requireConversationMember(req.user!.companyId, req.user!.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  const id = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "Message" (id, "conversationId", "companyId", "senderUserId", body, "createdAt") VALUES (${id}::uuid, ${req.params.id}::uuid, ${req.user!.companyId}, ${req.user!.id}, ${input.body}, NOW())`;
    await tx.$executeRaw`UPDATE "Conversation" SET "updatedAt" = NOW() WHERE id = ${req.params.id}::uuid AND "companyId" = ${req.user!.companyId}`;
  });
  return res.status(201).json({ id, body: input.body, senderUserId: req.user!.id, createdAt: new Date().toISOString() });
}));
