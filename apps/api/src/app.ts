---
*** Begin Patch
*** Update File: apps/api/src/app.ts
@@
-import { dashboardRouter } from "./modules/dashboard/routes.js";
-import { jobsRouter } from "./modules/jobs/routes.js";
-import { onboardingRouter } from "./modules/onboarding/routes.js";
-import { vehiclesRouter } from "./modules/vehicles/routes.js";
+import { dashboardRouter } from "./modules/dashboard/routes.js";
+import { jobsRouter } from "./modules/jobs/routes.js";
+import { onboardingRouter } from "./modules/onboarding/routes.js";
+import { vehiclesRouter } from "./modules/vehicles/routes.js";
+import { debugRouter } from "./modules/debug/routes.js";
@@
 app.use("/api/dashboard", dashboardRouter);
 app.use("/api/vehicles", vehiclesRouter);
 app.use("/api/jobs", jobsRouter);
 app.use("/api/onboarding", onboardingRouter);
+
+if (config.ENABLE_DEBUG_ROUTES) {
+  app.use("/api/debug", debugRouter);
+}
*** End Patch
