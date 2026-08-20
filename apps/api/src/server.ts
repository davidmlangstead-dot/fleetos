import { app } from "./app.js";
import { config } from "./config.js";
import { startComplianceIntelligenceWatcher } from "./modules/medic/complianceIntelligence.js";

app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`FleetOS API listening on ${config.PORT}`);
  startComplianceIntelligenceWatcher();
});
