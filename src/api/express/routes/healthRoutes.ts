import { Router } from "express";
import { HealthController } from "../controllers/HealthController";

export function createHealthRoutes(healthController: HealthController): Router {
  const router = Router();

  // Health check endpoint
  router.get("/health", (req, res) =>
    healthController.performSystemHealthAssessment(req, res)
  );

  return router;
}
