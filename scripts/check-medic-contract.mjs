import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [app, monitor, routes] = await Promise.all([
  readFile(new URL("../apps/api/src/app.ts", import.meta.url), "utf8"),
  readFile(new URL("./medic-background.mjs", import.meta.url), "utf8"),
  readFile(new URL("../apps/api/src/modules/medic/routes.ts", import.meta.url), "utf8"),
]);

function fail(message) {
  console.error(`FAIL Medic contract: ${message}`);
  process.exit(1);
}

if (!monitor.includes("https://fleetos-1.onrender.com")) fail("background monitor does not target the live API");

const publicMount = app.indexOf('app.use("/api/medic", sensitiveRateLimit, medicRouter)');
const catchAll = app.indexOf('app.use("/api", requireAuth, requireCommercialWriteAccess, brandedDocumentsRouter)');
if (publicMount < 0 || catchAll < 0 || publicMount > catchAll) fail("Medic liveness is hidden behind the authenticated /api catch-all");

const liveness = routes.indexOf('medicRouter.get("/", async');
const protectedStatus = routes.indexOf('medicRouter.get("/status", requireAuth');
if (liveness < 0) fail("public database liveness route is missing");
if (protectedStatus < 0) fail("detailed Medic status is not protected");

console.log(`PASS Medic contract: public liveness is reachable before authenticated routes (${root}).`);
