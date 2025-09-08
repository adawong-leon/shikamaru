import { Router } from "express";
import { ServicesController } from "../controllers/ServicesController";

export function createServicesRoutes(
  servicesController: ServicesController
): Router {
  const router = Router();

  // Get all services status
  router.get("/api/services", (req, res) =>
    servicesController.retrieveAllServicesStatus(req, res)
  );

  // Stop all services endpoint
  router.post("/api/services/stop-all", (req, res) =>
    servicesController.terminateAllRunningServices(req, res)
  );

  // Log buffer management endpoints
  router.post("/api/log-buffer/enable", (req, res) =>
    servicesController.activateLogBufferingSystem(req, res)
  );

  router.post("/api/log-buffer/disable", (req, res) =>
    servicesController.deactivateLogBufferingSystem(req, res)
  );

  router.get("/api/log-buffer/status", (req, res) =>
    servicesController.retrieveLogBufferingSystemStatus(req, res)
  );

  return router;
}
