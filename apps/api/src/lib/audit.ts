import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";

type AuditInput = {
  companyId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditEvent(input: AuditInput) {
  const id = randomUUID();
  const metadata = JSON.stringify(input.metadata ?? {});
  await prisma.$executeRaw`
    INSERT INTO "AuditEvent" (id, "companyId", "actorUserId", "actorEmail", action, "entityType", "entityId", summary, metadata, "createdAt")
    VALUES (${id}::uuid, ${input.companyId}, ${input.actorUserId ?? null}, ${input.actorEmail ?? null}, ${input.action}, ${input.entityType}, ${input.entityId ?? null}, ${input.summary}, ${metadata}::jsonb, NOW())
  `;
  return id;
}
