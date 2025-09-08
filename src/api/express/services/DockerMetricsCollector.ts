import { Logger } from "@/cli/exports";
import {
  getRunningDockerContainers,
  batchCollectDockerStats,
} from "../utils/processUtils";

type MetricsRecord = {
  memory: string;
  cpu: string;
  timestamp: number;
};

export interface DockerMetricsCollectorOptions {
  pollIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Background collector that periodically polls docker for container metrics
 * and caches the results to serve requests without blocking.
 */
export class DockerMetricsCollector {
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly enabled: boolean;
  // containerName -> metrics
  private cache: Map<string, MetricsRecord> = new Map();

  constructor(logger: Logger, opts?: DockerMetricsCollectorOptions) {
    this.logger = logger;
    this.pollIntervalMs = opts?.pollIntervalMs ?? 3000;
    this.enabled = opts?.enabled ?? true;
  }

  start(): void {
    if (!this.enabled) return;
    if (this.intervalId) return;

    // Run immediately then on interval
    this.collectSafely();
    this.intervalId = setInterval(
      () => this.collectSafely(),
      this.pollIntervalMs
    );
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get cached memory usage for a container name, if available
   */
  getMemory(containerName: string): string | undefined {
    return this.cache.get(containerName)?.memory;
  }

  /**
   * Get cached CPU usage for a container name, if available
   */
  getCpu(containerName: string): string | undefined {
    return this.cache.get(containerName)?.cpu;
  }

  /**
   * Get last updated timestamp for a container name, if available
   */
  getTimestamp(containerName: string): number | undefined {
    return this.cache.get(containerName)?.timestamp;
  }

  /**
   * Perform one collection cycle with safety wrapper.
   */
  private collectSafely(): void {
    try {
      this.collect();
    } catch (err) {
      // Never throw in background loop
      this.logger.debug?.(
        `DockerMetricsCollector: collection error: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Collect metrics for all currently running containers.
   * Uses one docker ps and one docker stats call.
   */
  private collect(): void {
    const running = getRunningDockerContainers();
    if (running.size === 0) return;

    const containerNames = Array.from(running.values());

    const stats = batchCollectDockerStats(containerNames);
    const now = Date.now();

    for (const [name, rec] of stats.entries()) {
      this.cache.set(name, {
        memory: rec.memory,
        cpu: rec.cpu,
        timestamp: now,
      });
    }
  }
}
