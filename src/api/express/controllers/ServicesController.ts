import { Request, Response } from "express";
import { ServicesResponse } from "../types";
import { ServiceManager } from "../services/ServiceManager";
import { LogStreamingService } from "../services/LogStreamingService";
import { LogBuffer } from "@/modes/execution/services/LogBuffer";

export class ServicesController {
  private serviceManager: ServiceManager;
  private logStreamingService: LogStreamingService;

  constructor(
    serviceManager: ServiceManager,
    logStreamingService: LogStreamingService
  ) {
    this.serviceManager = serviceManager;
    this.logStreamingService = logStreamingService;
  }

  /**
   * Retrieve comprehensive status of all managed services
   */
  retrieveAllServicesStatus(req: Request, res: Response): void {
    const applicationServices =
      this.serviceManager.getApplicationServiceStatus();
    const allServices = [...applicationServices];

    const response: ServicesResponse = {
      success: true,
      data: allServices,
      summary: {
        total: allServices.length,
        application: applicationServices.length,
        running: allServices.filter((s) => s.status === "running").length,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  }

  /**
   * Initialize and launch a specific service by name
   */
  initializeServiceByName(req: Request, res: Response): void {
    const { serviceName } = req.params;

    try {
      const result = this.serviceManager.startService(serviceName);

      if (result.success) {
        // Send log message about service start
        this.logStreamingService.sendSystemMessage(
          `Service '${serviceName}' started successfully`,
          "info"
        );

        res.json({
          success: true,
          message: `Service '${serviceName}' started successfully`,
          data: result.data,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to start service: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Terminate all running services gracefully
   */
  async terminateAllRunningServices(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const result = await this.serviceManager.stopApplicationServices();

      if (result.success) {
        // Send log message about stopping all services
        this.logStreamingService.sendSystemMessage(
          `All services stopped successfully`,
          "info"
        );

        res.json({
          success: true,
          message: "All services stopped successfully",
          data: result.data,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          timestamp: new Date().toISOString(),
        });
      }
      process.exit(0);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to stop all services: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      });
      process.exit(1);
    }
  }

  /**
   * Activate log buffering system for web interface
   */
  activateLogBufferingSystem(req: Request, res: Response): void {
    try {
      const logBuffer = LogBuffer.getInstance();
      logBuffer.enable();

      this.logStreamingService.sendSystemMessage(
        "Log buffer enabled - startup messages will be captured",
        "info"
      );

      res.json({
        success: true,
        message: "Log buffer enabled",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to enable log buffer: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Deactivate log buffering system
   */
  deactivateLogBufferingSystem(req: Request, res: Response): void {
    try {
      const logBuffer = LogBuffer.getInstance();
      logBuffer.disable();

      this.logStreamingService.sendSystemMessage("Log buffer disabled", "info");

      res.json({
        success: true,
        message: "Log buffer disabled",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to disable log buffer: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Retrieve current log buffering system status and metrics
   */
  retrieveLogBufferingSystemStatus(req: Request, res: Response): void {
    try {
      const logBuffer = LogBuffer.getInstance();

      res.json({
        success: true,
        data: {
          enabled: logBuffer.isBufferEnabled(),
          bufferSize: logBuffer.getBufferSize(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to get log buffer status: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
