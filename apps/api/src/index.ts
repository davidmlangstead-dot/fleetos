import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.send("FleetOS API Online"));

app.listen(3001, () => console.log("FleetOS API running on port 3001"));
