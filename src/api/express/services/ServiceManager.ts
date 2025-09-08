import type { IServiceManager } from "../API";
import { ServiceOperationResult, ServiceStatus } from "../types";
import {
  getProcessUptime,
  getProcessMemoryUsage,
  getProcessCpuUsage,
  getDockerContainerUptime,
  resolveContainerName,
  batchCollectDockerStats,
} from "../utils/processUtils";
import { ProcItem } from "@/log-ui/types";
import { Logger } from "@/cli/exports";
import { DockerMetricsCollector } from "./DockerMetricsCollector";
import { UnifiedConfig } from "@/config/UnifiedConfig";
import { spawnSync } from "child_process";
import { AppServiceManager } from "@/modes/execution/services/AppServiceManager";

/**
 * Read-only façade around running services that surfaces status,
 * metrics, and limited lifecycle actions for the web API.
 */
export class ServiceManager {
  private appProcesses: ProcItem[];
  private ports: Map<string, number>;
  private serviceManager: IServiceManager | null;
  private logger: Logger;
  private metricsCollector?: DockerMetricsCollector;
  private appServiceManager: AppServiceManager;

  constructor(
    logger: Logger,
    appProcesses: ProcItem[],
    ports: Map<string, number>,
    serviceManager: IServiceManager | null,
    appServiceManager: AppServiceManager,
    metricsCollector?: DockerMetricsCollector
  ) {
    this.logger = logger;
    this.appProcesses = appProcesses;
    this.ports = ports;
    this.serviceManager = serviceManager;
    this.metricsCollector = metricsCollector;
    this.appServiceManager = appServiceManager;
  }

  /** Collect service status and lightweight Docker/process metrics. */
  getApplicationServiceStatus(): ServiceStatus[] {
    // Determine which services are configured to run in docker from UnifiedConfig
    const plannedDocker = this.getPlannedDockerServiceNames();

    // First, identify Docker services and their container names
    const dockerServices: { procItem: ProcItem; containerName: string }[] = [];
    const localServices: ProcItem[] = [];

    for (const procItem of this.appProcesses) {
      if (!procItem.name) {
        continue;
      }
      const isDockerBased =
        plannedDocker.has(procItem.name) ||
        plannedDocker.has(this.normalizeName(procItem.name));
      if (isDockerBased) {
        const containerName = resolveContainerName(procItem);
        if (containerName) {
          dockerServices.push({ procItem, containerName });
        }
      } else {
        localServices.push(procItem);
      }
    }

    // If we have a background collector, prefer using its cache
    let batchStats = new Map<string, { memory: string; cpu: string }>();
    const useCollector = !!this.metricsCollector;
    if (!useCollector) {
      // Batch collect Docker stats for all Docker services at once (sync/expensive)
      const dockerContainerNames = dockerServices.map((ds) => ds.containerName);
      batchStats = batchCollectDockerStats(dockerContainerNames);
    }

    // Build the results
    const results: ServiceStatus[] = [];

    // Process Docker services
    for (const { procItem, containerName } of dockerServices) {
      const cachedMem = this.metricsCollector?.getMemory(containerName);
      const cachedCpu = this.metricsCollector?.getCpu(containerName);
      const batchStat = batchStats.get(containerName);

      results.push({
        name: procItem.name,
        type: "app" as const,
        status:
          procItem.proc?.killed || procItem.proc?.exitCode !== null
            ? ("stopped" as const)
            : ("running" as const),
        port: this.getServicePort(procItem.name),
        // Uptime via inspect is relatively cheap; keep it for accuracy
        uptime: getDockerContainerUptime(containerName),
        // Prefer collector cache; if not available and no collector, use batch; otherwise fallback to unknown
        memoryUsage:
          cachedMem ??
          (useCollector ? "unknown" : batchStat?.memory || "unknown"),
        cpuUsage:
          cachedCpu ?? (useCollector ? "unknown" : batchStat?.cpu || "unknown"),
        pid: procItem.proc?.pid,
      });
    }

    // Process local services
    for (const procItem of localServices) {
      results.push({
        name: procItem.name,
        type: "app" as const,
        status:
          procItem.proc?.killed || procItem.proc?.exitCode !== null
            ? ("stopped" as const)
            : ("running" as const),
        port: this.getServicePort(procItem.name),
        uptime: getProcessUptime(procItem.proc?.pid),
        memoryUsage: getProcessMemoryUsage(procItem.proc?.pid),
        cpuUsage: getProcessCpuUsage(procItem.proc?.pid),
        pid: procItem.proc?.pid,
      });
    }

    return results;
  }

  /** Planned docker service name set (original + normalized). */
  private getPlannedDockerServiceNames(): Set<string> {
    const set = new Set<string>();
    try {
      const cfg = UnifiedConfig.getInstance();
      const globalMode = cfg.getGlobalMode();

      // If global docker mode, treat all known processes as docker-planned
      if (globalMode === "docker") {
        for (const p of this.appProcesses) {
          set.add(p.name);
          set.add(this.normalizeName(p.name));
        }
        return set;
      }

      // Otherwise, use repoConfigs by mode (application repos)
      const dockerRepos = cfg.getRepositoriesByMode("docker");
      for (const repo of dockerRepos) {
        set.add(repo);
        set.add(this.normalizeName(repo));
      }

      // Include infra services as planned docker as well
      const infra = cfg.getInfraServices();
      for (const svc of infra) {
        set.add(svc);
        set.add(this.normalizeName(svc));
      }
    } catch {
      // If UnifiedConfig is not initialized yet, default to empty set
    }
    return set;
  }

  private normalizeName(name: string): string {
    return name?.toLowerCase().replace(/[^a-z0-9]/g, "-");
  }

  /** Attempt to stop a Docker container by name; returns success boolean. */
  private stopDockerContainer(containerName: string): boolean {
    try {
      const result = spawnSync("docker", ["stop", containerName], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      return result.status === 0;
    } catch (error) {
      this.logger.debug?.(
        `Ignoring docker stop error for ${containerName}: ${
          (error as Error).message
        }`
      );
      return false;
    }
  }

  /** Alias for getApplicationServiceStatus. */
  getServicesStatus(): ServiceStatus[] {
    return this.getApplicationServiceStatus();
  }

  /** Resolve host port assigned to a service name. */
  private getServicePort(serviceName: string): number | undefined {
    return (
      this.ports.get(serviceName) ??
      this.ports.get(this.normalizeName(serviceName))
    );
  }

  /** Stop a specific service (best-effort). */
  async stopService(serviceName: string): Promise<ServiceOperationResult> {
    try {
      const procItem = this.appProcesses.find(
        (proc) => proc.name === serviceName
      );

      if (!procItem) {
        return {
          success: false,
          error: `Service '${serviceName}' not found`,
        };
      }

      if (procItem.proc?.killed) {
        return {
          success: false,
          error: `Service '${serviceName}' is already stopped`,
        };
      }

      // If this service is docker-based, try stopping the container itself first
      try {
        const plannedDocker = this.getPlannedDockerServiceNames();
        const isDockerBased =
          plannedDocker.has(serviceName) ||
          plannedDocker.has(this.normalizeName(serviceName));
        if (isDockerBased && procItem) {
          const containerName = resolveContainerName(procItem);
          if (containerName) {
            const stopped = this.stopDockerContainer(containerName);
            if (stopped) {
              this.logger.info(
                `Stopped docker container for service ${serviceName}: ${containerName}`
              );
            } else {
              this.logger.debug?.(
                `No running docker container to stop for ${serviceName}: ${containerName}`
              );
            }
          }
        }
      } catch (e) {
        this.logger.debug?.(
          `Ignored error while attempting docker stop for ${serviceName}: ${
            (e as Error).message
          }`
        );
      }

      // Stop the service using the generic service manager
      if (this.serviceManager) {
        try {
          const maybeStopByName = (this.serviceManager as any)
            ?.stopServiceByName;
          if (typeof maybeStopByName === "function") {
            await maybeStopByName.call(this.serviceManager, serviceName);
          }
        } catch (error) {
          this.logger.error(
            `Failed to stop service ${serviceName}:`,
            error as Error
          );
        }
      }

      // Remove from tracking arrays
      this.appProcesses = this.appProcesses.filter(
        (proc) => proc.name !== serviceName
      );

      this.logger.info(`Stopped service: ${serviceName}`);
      this.logger.info(`Total services: ${this.appProcesses.length}`);

      return {
        success: true,
        data: {
          serviceName,
          status: "stopped",
          message: `Service '${serviceName}' stopped successfully`,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to stop service ${serviceName}:`,
        error as Error
      );
      return {
        success: false,
        error: `Failed to stop service: ${(error as Error).message}`,
      };
    }
  }

  /** Stop service by name or throw on failure. */
  async stopServiceByName(serviceName: string): Promise<void> {
    const result = await this.stopService(serviceName);
    if (!result.success) {
      throw new Error(result.error || `Failed to stop service ${serviceName}`);
    }
  }

  /** Start is not supported here; returns an explanatory error. */
  startService(serviceName: string): ServiceOperationResult {
    try {
      // Check if service is already running
      const existingProc = this.appProcesses.find(
        (proc) => proc.name === serviceName
      );

      if (existingProc && !existingProc.proc?.killed) {
        return {
          success: false,
          error: `Service '${serviceName}' is already running`,
        };
      }

      // For now, return an error since we can't directly start services
      // This would require integration with the HybridManager to restart the entire service set
      return {
        success: false,
        error: `Service start functionality requires HybridManager integration. Use restart mode to restart all services.`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to start service ${serviceName}:`,
        error as Error
      );
      return {
        success: false,
        error: `Failed to start service: ${(error as Error).message}`,
      };
    }
  }

  /** Restart is not implemented for the generic manager. */
  async restartService(serviceName: string): Promise<ServiceOperationResult> {
    try {
      // Find the service in the app processes
      const procItem = this.appProcesses.find(
        (proc) => proc.name === serviceName
      );

      if (!procItem) {
        return {
          success: false,
          error: `Service '${serviceName}' not found`,
        };
      }

      // Stop the service first
      if (this.serviceManager) {
        const maybeStopByName = (this.serviceManager as any)?.stopServiceByName;
        if (typeof maybeStopByName === "function") {
          await maybeStopByName.call(this.serviceManager, serviceName);
        }
      }

      // Remove from tracking
      this.appProcesses = this.appProcesses.filter(
        (proc) => proc.name !== serviceName
      );

      // Start the service again - this would need to be implemented based on the specific service manager
      // For now, we'll return an error since we don't have the specific implementation
      return {
        success: false,
        error: `Service restart not implemented for generic service manager`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to restart service ${serviceName}:`,
        error as Error
      );
      return {
        success: false,
        error: `Failed to restart service: ${(error as Error).message}`,
      };
    }
  }

  /** Stop all application services via AppServiceManager. */
  async stopAllServices(): Promise<ServiceOperationResult> {
    try {
      const result = await this.appServiceManager.stopApplicationServices();
      // Clear local tracking
      this.appProcesses = [];
      return result;
    } catch (error) {
      this.logger.error("Failed to stop all services:", error as Error);
      return {
        success: false,
        error: `Failed to stop all services: ${(error as Error).message}`,
      };
    }
  }

  /** Snapshot of tracked processes with computed metrics. */
  getProcessState() {
    return {
      totalServices: this.appProcesses.length,
      runningServices: this.appProcesses.filter((proc) => !proc.proc?.killed)
        .length,
      stoppedServices: this.appProcesses.filter((proc) => proc.proc?.killed)
        .length,
      services: this.appProcesses.map((proc) => ({
        name: proc.name,
        pid: proc.proc?.pid,
        status: (proc.proc?.killed ? "stopped" : "running") as
          | "running"
          | "stopped",
        uptime: getProcessUptime(proc.proc?.pid),
        memoryUsage: getProcessMemoryUsage(proc.proc?.pid),
        cpuUsage: getProcessCpuUsage(proc.proc?.pid),
      })),
    };
  }

  /** Detailed metrics for a single service, if present. */
  getProcessDetails(serviceName: string) {
    const procItem = this.appProcesses.find(
      (proc) => proc.name === serviceName
    );

    if (procItem) {
      return {
        name: procItem.name,
        pid: procItem.proc?.pid,
        status: (procItem.proc?.killed ? "stopped" : "running") as
          | "running"
          | "stopped",
        uptime: getProcessUptime(procItem.proc?.pid),
        memoryUsage: getProcessMemoryUsage(procItem.proc?.pid),
        cpuUsage: getProcessCpuUsage(procItem.proc?.pid),
      };
    }

    return null;
  }

  /** Replace the tracked processes list. */
  updateAppProcesses(processes: ProcItem[]): void {
    this.appProcesses = processes;
  }

  /** Current tracked processes list. */
  getAppProcesses(): ProcItem[] {
    return this.appProcesses;
  }

  /** Delegate: stop application services. */
  async stopApplicationServices(): Promise<ServiceOperationResult> {
    return this.appServiceManager.stopApplicationServices();
  }
}
