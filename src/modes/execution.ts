#!/usr/bin/env node

import { UnifiedExecutionManager } from "./execution/UnifiedExecutionManager";
import { UnifiedConfig } from "../config";
import { Logger } from "@/cli/logger/Logger";
export type PortsMap = Map<string, number>;

// Main execution interface
export async function execute(): Promise<string | undefined> {
  const logger = Logger.getInstance();
  const manager = UnifiedExecutionManager.createInstance(
    UnifiedConfig.getInstance(),
    logger
  );
  logger.info("✅ Using existing execution manager");
  try {
    // Execute unified mode
    const result = await manager.startExecution();

    if (!result.success) {
      throw new Error(
        `Hybrid mode execution failed: ${result.errors.join(", ")}`
      );
    }

    // Log results
    if (result.startedServices.length > 0) {
      logger.success(
        `Started ${result.startedServices.length} application services`
      );
    }

    if (result.infraServices.length > 0) {
      logger.success(
        `Managed ${result.infraServices.length} infrastructure services`
      );
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach((warning) => logger.warning(warning));
    }
    const config = UnifiedExecutionManager.getInstance().getConfig();
    if (config.isWebLoggingEnabled()) {
      // Start web monitoring now and capture URL
      const uiUrl = UnifiedExecutionManager.getInstance().getWebUiUrl();
      return uiUrl || undefined;
    }
    return undefined;
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Hybrid mode execution failed", error);
      throw error;
    }
    return undefined;
  }
}

// Export the new modular components for advanced usage
export { UnifiedExecutionManager } from "./execution/UnifiedExecutionManager";
export { InfraServiceManager } from "./execution/services/InfraServiceManager";
export { AppServiceManager } from "./execution/services/AppServiceManager";
export { HybridError } from "./execution/errors/HybridError";
export type {
  ExecutionModeConfig,
  ExecutionModeResult,
  ExtendedExecutionConfig,
  ServiceConfig,
  InfraService,
  HealthCheckResult,
  ServiceStartOptions,
  InfraServiceType,
  DockerComposeConfig,
} from "./execution/types";
