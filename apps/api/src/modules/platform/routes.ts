import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { isPlatformOwner, requireIdentity } from "../../middleware/auth.js";

export const platformRouter = Router();
platformRouter.use(requireIdentity);

platformRouter.get("/me", asyncHandler(async (_req, res) => {
  res.json({ isPlatformOwner: await isPlatformOwner(res.locals.identity.id) });
}));
