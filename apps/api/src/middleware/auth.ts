*** Begin Patch
*** Update File: apps/api/src/middleware/auth.ts
@@
-export const requireIdentity: RequestHandler = async (req, res, next) => {
-  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
-  if (!token || !config.SUPABASE_URL) return res.status(401).json({ error: "Unauthenticated" });
-  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
-  const { data, error } = await supabase.auth.getUser(token);
-  if (error || !data.user?.email) return res.status(401).json({ error: "Invalid session" });
-  await ensureUser({ id: data.user.id, email: data.user.email });
-  res.locals.identity = { id: data.user.id, email: data.user.email };
-  next();
-};
+export const requireIdentity: RequestHandler = async (req, res, next) => {
+  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
+
+  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
+    console.error("Supabase configuration missing on the API: set SUPABASE_URL and SUPABASE_ANON_KEY");
+    return res.status(500).json({ error: "Server misconfigured" });
+  }
+
+  if (!token) return res.status(401).json({ error: "Unauthenticated" });
+
+  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
+
+  // In supabase-js v2 the correct call is getUser(token: string)
+  const { data, error } = await supabase.auth.getUser(token);
+
+  if (error) {
+    console.warn("Supabase getUser error:", error.message ?? error);
+    return res.status(401).json({ error: "Invalid session" });
+  }
+
+  if (!data?.user?.email || !data.user?.id) {
+    return res.status(401).json({ error: "Invalid or expired session" });
+  }
+
+  try {
+    await ensureUser({ id: data.user.id, email: data.user.email });
+  } catch (err) {
+    console.error("Failed to ensure user in DB:", err);
+    return res.status(500).json({ error: "Could not ensure user" });
+  }
+
+  res.locals.identity = { id: data.user.id, email: data.user.email };
+  next();
+};
*** End Patch
