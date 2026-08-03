*** Begin Patch
*** Update File: apps/api/src/config.ts
@@
 const schema = z.object({
   DATABASE_URL: z.string().url(),
   SUPABASE_URL: z.string().url().optional(),
   SUPABASE_ANON_KEY: z.string().min(1),
   PORT: z.coerce.number().default(3001),
   CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
+  ENABLE_DEBUG_ROUTES: z.coerce.boolean().default(false),
 });
*** End Patch
