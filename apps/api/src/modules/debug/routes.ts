*** Begin Patch
*** Add File: apps/api/src/modules/debug/routes.ts
+import { Router } from "express";
+import { createClient } from "@supabase/supabase-js";
+import { config } from "../../config.js";
+
+export const debugRouter = Router();
+
+debugRouter.get("/token", async (req, res) => {
+  if (!config.ENABLE_DEBUG_ROUTES) return res.status(404).json({ error: "Not found" });
+
+  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
+  if (!token) return res.status(400).json({ error: "Authorization header required" });
+
+  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
+    return res.status(500).json({ error: "Server misconfigured" });
+  }
+
+  try {
+    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
+    const { data, error } = await supabase.auth.getUser(token);
+
+    if (error) {
+      return res.status(401).json({ error: "Invalid session", details: error.message ?? error });
+    }
+
+    if (!data?.user) return res.status(404).json({ error: "User not found" });
+
+    const safeUser = {
+      id: data.user.id,
+      email: data.user.email,
+      aud: data.user.aud,
+      role: data.user.role,
+    };
+
+    return res.json({ ok: true, user: safeUser });
+  } catch (err) {
+    console.error("Debug token check failed:", err);
+    return res.status(500).json({ error: "Internal error" });
+  }
+});
+
*** End Patch
