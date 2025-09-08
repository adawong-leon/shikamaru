import { Request, Response } from "express";
import { HealthCheckResponse } from "../types";

export class HealthController {
  private getConnectedClientsCount: () => number;
  private getApplicationProcessesCount: () => number;

  constructor(
    getConnectedClientsCount: () => number,
    getApplicationProcessesCount: () => number
  ) {
    this.getConnectedClientsCount = getConnectedClientsCount;
    this.getApplicationProcessesCount = getApplicationProcessesCount;
  }

  /**
   * Perform comprehensive system health assessment
   */
  performSystemHealthAssessment(req: Request, res: Response): void {
    const response: HealthCheckResponse = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connectedClients: this.getConnectedClientsCount(),
      applicationProcesses: this.getApplicationProcessesCount(),
    };

    res.json(response);
  }

  /**
   * Retrieve current system health status for programmatic access
   */
  retrieveCurrentSystemHealthStatus(): HealthCheckResponse {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connectedClients: this.getConnectedClientsCount(),
      applicationProcesses: this.getApplicationProcessesCount(),
    };
  }
}
