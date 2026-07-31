import { Router } from "express";
import { supabase } from "../../lib/supabase";

export const onboardingRouter = Router();

onboardingRouter.post("/company", async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({ error: "Company name is required" });
    }

    const authHeader = req.headers.authorization?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader);

    if (userError || !user) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    const { data, error: insertError } = await supabase
      .from("companies")
      .insert({ name: companyName.trim(), owner_id: user.id })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return res.status(409).json({ ok: true, duplicate: true });
      }
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(201).json({ ok: true, company: data });
  } catch (err) {
    console.error("[API] Onboarding error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});