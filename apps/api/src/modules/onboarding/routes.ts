import { Router } from "express";
import { supabase } from "../../lib/supabase"; // adjust path if needed

const router = Router();

/**
 * POST /onboarding
 * Creates a company for the authenticated user.
 */
router.post("/", async (req, res) => {
  try {
    console.log("[API] Onboarding request received");

    const { companyName } = req.body;

    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({
        error: "Company name is required",
      });
    }

    console.log("[API] Fetching user session…");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));

    if (userError) {
      console.error("[API] Supabase user error:", userError);
      return res.status(401).json({ error: "Authentication failed" });
    }

    if (!user) {
      console.log("[API] No user found");
      return res.status(401).json({ error: "You must be signed in" });
    }

    console.log("[API] Inserting company…");

    const { data, error: insertError } = await supabase
      .from("companies")
      .insert({
        name: companyName.trim(),
        owner_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[API] Insert error:", insertError);

      // Duplicate company name
      if (insertError.code === "23505") {
        return res.json({ ok: true, duplicate: true });
      }

      return res.status(500).json({
        error: "Failed to create company",
        details: insertError.message,
      });
    }

    console.log("[API] Company created:", data);

    return res.json({ ok: true, company: data });
  } catch (err) {
    console.error("[API] Unexpected error:", err);
    return res.status(500).json({
      error: "Unexpected server error",
    });
  }
});

export default router;
