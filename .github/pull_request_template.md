---
*** Begin Patch
*** Add File: .github/pull_request_template.md
+## Summary
+
+Fixes server-side Supabase token validation by calling `supabase.auth.getUser(token)` correctly, improves error messages for missing Supabase config and invalid/expired tokens, and adds a gated `/api/debug/token` endpoint to help validate bearer tokens during local testing.
+
+### Changes
+- `apps/api/src/middleware/auth.ts` — defensive `getUser(token)` usage, clearer 401/500 handling, safer user creation.
+- `apps/api/src/config.ts` — added `ENABLE_DEBUG_ROUTES` flag (default `false`).
+- `apps/api/src/modules/debug/routes.ts` — gated debug endpoint `GET /api/debug/token` (enabled only when `ENABLE_DEBUG_ROUTES=true`).
+
+### Testing
+1. Checkout `fix/auth-signin` branch.
+2. Set env for API: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `ENABLE_DEBUG_ROUTES=true` (only for local testing).
+3. Start API and web.
+4. Obtain an access token via the web UI and run:
+   - `curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:3001/api/debug/token`
+   - `curl -i -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"companyName":"TestCo"}' http://localhost:3001/api/onboarding`
+
+### Security
+- `ENABLE_DEBUG_ROUTES` defaults to `false`. Do NOT enable in production.
+
*** End Patch
