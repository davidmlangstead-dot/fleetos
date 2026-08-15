import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { requireIdentity } from "../../middleware/auth.js";

export const preferencesRouter = Router();
preferencesRouter.use(requireIdentity);

const inputSchema = z.object({
  language: z.enum(["en", "pl", "ro", "lt", "bg", "uk", "pt", "es"]),
  largeText: z.boolean(),
  largeControls: z.boolean(),
  highContrast: z.boolean(),
  reducedMotion: z.boolean(),
  easyRead: z.boolean(),
  darkMode: z.boolean(),
  readAloud: z.boolean(),
  voiceInput: z.boolean(),
});

type PreferenceRow = z.infer<typeof inputSchema>;

const defaults: PreferenceRow = {
  language: "en", largeText: false, largeControls: false, highContrast: false,
  reducedMotion: false, easyRead: false, darkMode: false, readAloud: false, voiceInput: false,
};

preferencesRouter.get("/", asyncHandler(async (_req, res) => {
  const userId = res.locals.identity.id;
  const rows = await prisma.$queryRaw<PreferenceRow[]>`
    SELECT language,"largeText","largeControls","highContrast","reducedMotion","easyRead","darkMode","readAloud","voiceInput"
    FROM "UserPreference" WHERE "userId"=${userId} LIMIT 1
  `;
  res.json(rows[0] ?? defaults);
}));

preferencesRouter.put("/", asyncHandler(async (req, res) => {
  const input = inputSchema.parse(req.body);
  const userId = res.locals.identity.id;
  const rows = await prisma.$queryRaw<PreferenceRow[]>`
    INSERT INTO "UserPreference" ("userId",language,"largeText","largeControls","highContrast","reducedMotion","easyRead","darkMode","readAloud","voiceInput","updatedAt")
    VALUES (${userId},${input.language},${input.largeText},${input.largeControls},${input.highContrast},${input.reducedMotion},${input.easyRead},${input.darkMode},${input.readAloud},${input.voiceInput},NOW())
    ON CONFLICT ("userId") DO UPDATE SET
      language=EXCLUDED.language,"largeText"=EXCLUDED."largeText","largeControls"=EXCLUDED."largeControls",
      "highContrast"=EXCLUDED."highContrast","reducedMotion"=EXCLUDED."reducedMotion","easyRead"=EXCLUDED."easyRead",
      "darkMode"=EXCLUDED."darkMode","readAloud"=EXCLUDED."readAloud","voiceInput"=EXCLUDED."voiceInput","updatedAt"=NOW()
    RETURNING language,"largeText","largeControls","highContrast","reducedMotion","easyRead","darkMode","readAloud","voiceInput"
  `;
  res.json(rows[0]);
}));
