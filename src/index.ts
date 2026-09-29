import "dotenv/config";
import meetRoutes from "./routes/meet.routes.js";
import express from "express";
import logger from "./services/logger.service.js";
import cors from 'cors'
const app = express();
app.use(cors())
// Middleware to parse JSON payloads
app.use(express.json());

// Health probe for the platform (Railway healthcheckPath). Unauthenticated and
// side-effect free — just confirms the process is up and serving.
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Routes
app.use("/api/meet", meetRoutes);

// Railway (and most PaaS) inject PORT and expect the app to bind it. Fall back
// to 3000 for local/Docker-compose runs. Bind 0.0.0.0 so the platform can reach it.
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Meeting Worker started successfully and listening on port ${PORT}`);
});
