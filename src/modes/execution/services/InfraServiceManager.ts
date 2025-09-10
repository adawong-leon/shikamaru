// Infrastructure Service Manager

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { HybridError } from "../errors/HybridError";
import { execWithSudo } from "@/utils";
import type {
  InfraService,
  InfraServiceType,
  HealthCheckResult,
  DockerComposeConfig,
} from "../types";
import { spawn } from "child_process";

export class InfraServiceManager {
  private config: any;
  private logger: any;

  constructor(config: any, logger: any) {
    this.config = config;
    this.logger = logger;
  }

  async startInfrastructureServices(
    infraServices: Set<InfraServiceType>
  ): Promise<HealthCheckResult[]> {
    if (infraServices.size === 0) {
      this.logger.info("ℹ️ No infrastructure services required");
      return [];
    }

    try {
      // Check if services are already running
      if (await this.areServicesRunning(infraServices)) {
        this.logger.success(
          "✅ Required infrastructure services already running"
        );
        return await this.performHealthChecks(infraServices);
      }

      // Generate and start infrastructure services
      this.logger.step(
        "⚙️ Generating infrastructure Docker Compose configuration"
      );
      await this.generateInfraCompose(infraServices);

      this.logger.step("🐳 Starting infrastructure services");
      await this.startDockerServicesWithProgress(Array.from(infraServices));

      // Perform health checks
      this.logger.step("🔍 Performing health checks");
      const healthResults = await this.performHealthChecks(infraServices);

      // Log results
      const healthyServices = healthResults.filter(
        (r) => r.status === "healthy"
      );
      const unhealthyServices = healthResults.filter(
        (r) => r.status !== "healthy"
      );

      if (healthyServices.length > 0) {
        this.logger.success(
          `✅ ${healthyServices.length} infrastructure services healthy`
        );
      }

      if (unhealthyServices.length > 0) {
        this.logger.warning(
          `⚠️ ${unhealthyServices.length} infrastructure services unhealthy`
        );
        unhealthyServices.forEach((service) => {
          this.logger.warning(`  - ${service.service}: ${service.message}`);
        });
      }

      return healthResults;
    } catch (error) {
      throw HybridError.fromInfraStartError("infrastructure", error);
    }
  }

  async stopInfrastructureServices(): Promise<void> {
    try {
      this.logger.step("🛑 Stopping infrastructure services");
      const composePath = path.join(
        this.config.getProjectsDir(),
        this.config.getInfraComposeFile()
      );

      if (fs.existsSync(composePath)) {
        execWithSudo(`docker compose -f "${composePath}" down`, {
          stdio: "inherit",
          cwd: this.config.getProjectsDir(),
        });
        this.logger.success("✅ Infrastructure services stopped");
      } else {
        this.logger.warning("⚠️ No infrastructure compose file found");
      }
    } catch (error) {
      this.logger.error("Failed to stop infrastructure services", error);
      // Don't throw here as this is cleanup
    }
  }

  private async areServicesRunning(
    infraServices: Set<InfraServiceType>
  ): Promise<boolean> {
    try {
      // This is a simplified check - in production you'd want more sophisticated detection
      const { execSync } = await import("child_process");
      const result = execSync("docker ps --format '{{.Names}}'", {
        encoding: "utf8",
      });
      const runningContainers = result.split("\n").filter(Boolean);

      return Array.from(infraServices).some((service) =>
        runningContainers.some((container) => container.includes(service))
      );
    } catch {
      return false;
    }
  }

  private async generateInfraCompose(
    infraServices: Set<InfraServiceType>
  ): Promise<void> {
    try {
      const composeConfig: DockerComposeConfig = {
        services: {},
        networks: {
          devnet3: {
            driver: "bridge",
          },
        },
        volumes: {},
      };

      // Add services
      for (const serviceType of infraServices) {
        const serviceConfig = this.getServiceConfig(serviceType);
        composeConfig.services[serviceType] = serviceConfig;

        // Add volumes if needed
        if (serviceConfig.volumes) {
          serviceConfig.volumes.forEach((volume: string) => {
            const volumeName = volume.split(":")[0];
            if (volumeName && !composeConfig.volumes![volumeName]) {
              composeConfig.volumes![volumeName] = {};
            }
          });
        }
      }

      // Write compose file
      const composePath = path.resolve(
        this.config.getProjectsDir(),
        this.config.getInfraComposeFile()
      );
      const composeContent = this.formatComposeFile(composeConfig);

      fs.writeFileSync(composePath, composeContent);
      this.logger.debug(
        `📝 Generated infrastructure compose file: ${composePath}`
      );
    } catch (error) {
      throw HybridError.fromComposeGenerationError(error);
    }
  }

  private getServiceConfig(serviceType: InfraServiceType): any {
    const baseConfig = {
      restart: "unless-stopped",
      networks: ["devnet3"],
    };

    switch (serviceType) {
      case "postgres":
        return {
          ...baseConfig,
          image: "postgres:15-alpine",
          environment: {
            POSTGRES_USER: "${POSTGRES_USERNAME:-default_user}",
            POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-default_password}",
            POSTGRES_DB: "${POSTGRES_DATABASE:-default_db}",
          },
          ports: ["${POSTGRES_PORT:-5432}:5432"],
          volumes: ["pgdata:/var/lib/postgresql/data"],
        };

      case "timescaledb":
        return {
          ...baseConfig,
          image: "timescale/timescaledb-ha:pg15-latest",
          environment: {
            POSTGRES_USER: "${POSTGRES_TIMESCALE_USERNAME:-default_user}",
            POSTGRES_PASSWORD:
              "${POSTGRES_TIMESCALE_PASSWORD:-default_password}",
            POSTGRES_DB: "${POSTGRES_TIMESCALE_DATABASE:-default_timescale_db}",
          },
          ports: ["${POSTGRES_TIMESCALE_PORT:-5433}:5432"],
          volumes: ["tsdata:/var/lib/postgresql/data"],
        };

      case "redis":
        return {
          ...baseConfig,
          container_name: "redis",
          image: "redis/redis-stack-server:latest",
          ports: ["${REDIS_PORT:-6379}:6379"],
          volumes: ["redisdata:/data"],
        };

      case "rabbitmq":
        return {
          ...baseConfig,
          container_name: "rabbitmq",
          image: "rabbitmq:3-management-alpine",
          environment: {
            RABBITMQ_DEFAULT_USER: "${RABBITMQ_USERNAME:-guest}",
            RABBITMQ_DEFAULT_PASS: "${RABBITMQ_PASSWORD:-guest}",
          },
          ports: [
            "${RABBITMQ_PORT:-5672}:5672",
            "${RABBITMQ_MANAGEMENT_PORT:-15672}:15672",
          ],
          volumes: ["rabbitmqdata:/var/lib/rabbitmq"],
          healthcheck: {
            test: ["CMD-SHELL", "rabbitmq-diagnostics -q ping"],
            interval: "10s",
            timeout: "5s",
            retries: 5,
            start_period: "30s",
          },
        };

      default:
        throw HybridError.fromConfigurationError(
          `Unknown infrastructure service: ${serviceType}`
        );
    }
  }

  private formatComposeFile(config: DockerComposeConfig): string {
    return `
services:
${Object.entries(config.services)
  .map(([name, service]) => this.formatService(name, service))
  .join("\n")}

networks:
${Object.entries(config.networks || {})
  .map(
    ([name, network]) => `  ${name}:
    driver: ${network.driver}`
  )
  .join("\n")}

volumes:
${Object.entries(config.volumes || {})
  .map(([name, volume]) => `  ${name}:`)
  .join("\n")}
`;
  }

  private formatService(name: string, service: any): string {
    const lines = [`  ${name}:`];

    if (service.image) lines.push(`    image: ${service.image}`);
    if (service.restart) lines.push(`    restart: ${service.restart}`);

    if (service.environment) {
      lines.push(`    environment:`);
      Object.entries(service.environment).forEach(([key, value]) => {
        lines.push(`      ${key}: ${value}`);
      });
    }

    if (service.ports) {
      lines.push(`    ports:`);
      service.ports.forEach((port: string) => {
        lines.push(`      - "${port}"`);
      });
    }

    if (service.volumes) {
      lines.push(`    volumes:`);
      service.volumes.forEach((volume: string) => {
        lines.push(`      - ${volume}`);
      });
    }

    if (service.networks) {
      lines.push(`    networks:`);
      service.networks.forEach((network: string) => {
        lines.push(`      - ${network}`);
      });
    }

    return lines.join("\n");
  }

  /**
   * Start Docker services with progress tracking
   */
  private async startDockerServicesWithProgress(
    services: InfraServiceType[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let startOutput = "";
      let startedServices: string[] = [];

      this.logger.info(
        `📋 Starting ${
          services.length
        } infrastructure services: ${services.join(", ")}`
      );

      // Start services
      const dockerCompose = spawn(
        "docker-compose",
        ["-f", this.config.infraComposeFile, "up", "-d"],
        {
          stdio: "pipe",
        }
      );

      dockerCompose.stdout?.on("data", (data) => {
        const output = data.toString();
        startOutput += output;

        // Parse startup progress
        const lines = output.split("\n");
        for (const line of lines) {
          // Detect service starting
          const startingMatch = line.match(/Creating\s+(\w+)/);
          if (startingMatch) {
            const serviceName = startingMatch[1];
            this.logger.info(`🚀 Starting ${serviceName}...`);
          }

          // Detect service started
          const startedMatch = line.match(/(\w+)\s+is up-to-date/);
          if (startedMatch) {
            const serviceName = startedMatch[1];
            if (!startedServices.includes(serviceName)) {
              startedServices.push(serviceName);
              this.logger.success(`   ✅ ${serviceName} started successfully`);
            }
          }

          // Detect service creation
          const createdMatch = line.match(/Creating\s+(\w+)\s+\.\.\.\s+done/);
          if (createdMatch) {
            const serviceName = createdMatch[1];
            if (!startedServices.includes(serviceName)) {
              startedServices.push(serviceName);
              this.logger.success(`   ✅ ${serviceName} created and started`);
            }
          }

          // Detect startup errors
          if (line.includes("ERROR") || line.includes("failed")) {
            this.logger.error(`   ❌ Startup error: ${line.trim()}`);
          }
        }
      });

      dockerCompose.stderr?.on("data", (data) => {
        const output = data.toString();
        startOutput += output;

        // Parse stderr for errors
        const lines = output.split("\n");
        for (const line of lines) {
          if (line.includes("ERROR") || line.includes("failed")) {
            this.logger.error(`   ❌ Startup error: ${line.trim()}`);
          }
        }
      });

      dockerCompose.on("close", (code: number) => {
        if (code === 0) {
          // Check final status of all services
          this.checkInfraServiceStatus(services)
            .then((statusResults) => {
              const runningServices = statusResults.filter(
                (r) => r.status === "running"
              );
              const failedServices = statusResults.filter(
                (r) => r.status !== "running"
              );

              this.logger.success(
                `✅ Infrastructure services startup completed`
              );
              this.logger.info(`📊 Service status summary:`);
              this.logger.info(
                `   🟢 Running: ${runningServices.length}/${services.length} services`
              );

              if (failedServices.length > 0) {
                this.logger.warning(
                  `   🔴 Issues: ${failedServices.length} services`
                );
                failedServices.forEach((service) => {
                  this.logger.warning(
                    `      - ${service.name}: ${service.status}`
                  );
                });
              }

              if (runningServices.length === services.length) {
                this.logger.success(
                  "🎉 All infrastructure services are running!"
                );
              } else {
                this.logger.warning(
                  "⚠️ Some infrastructure services may need attention"
                );
              }

              resolve();
            })
            .catch(() => {
              this.logger.success(
                "✅ Infrastructure services started (status check failed)"
              );
              resolve();
            });
        } else {
          const errorMessage = startOutput || "Unknown startup error";
          this.logger.error(
            `❌ Infrastructure services startup failed with code ${code}`
          );
          this.logger.error(`📝 Error details: ${errorMessage}`);
          reject(
            new Error(
              `Infrastructure services startup failed with code ${code}: ${errorMessage}`
            )
          );
        }
      });

      dockerCompose.on("error", (error: Error) => {
        this.logger.error(
          `❌ Failed to start infrastructure services: ${error.message}`
        );
        reject(
          new Error(`Failed to start infrastructure services: ${error.message}`)
        );
      });
    });
  }

  /**
   * Check status of infrastructure services
   */
  private async checkInfraServiceStatus(
    services: InfraServiceType[]
  ): Promise<Array<{ name: string; status: string }>> {
    return new Promise((resolve, reject) => {
      const dockerPs = spawn(
        "docker",
        ["ps", "--format", "table {{.Names}}\t{{.Status}}"],
        {
          stdio: "pipe",
        }
      );

      let output = "";
      dockerPs.stdout?.on("data", (data) => {
        output += data.toString();
      });

      dockerPs.on("close", (code) => {
        if (code === 0) {
          const lines = output.split("\n").filter((line) => line.trim());
          const runningServices = new Set<string>();

          // Parse docker ps output
          for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
              const serviceName = parts[0];
              runningServices.add(serviceName);
            }
          }

          // Check each expected service
          const statusResults = services.map((service) => ({
            name: service,
            status: runningServices.has(service) ? "running" : "not running",
          }));

          resolve(statusResults);
        } else {
          reject(new Error("Failed to check infrastructure service status"));
        }
      });

      dockerPs.on("error", () => {
        reject(new Error("Failed to check infrastructure service status"));
      });
    });
  }

  private async performHealthChecks(
    infraServices: Set<InfraServiceType>
  ): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const service of infraServices) {
      const startTime = Date.now();

      try {
        const isHealthy = await this.checkServiceHealth(service);
        const duration = Date.now() - startTime;

        results.push({
          service,
          status: isHealthy ? "healthy" : "unhealthy",
          duration,
          message: isHealthy
            ? "Service is healthy"
            : "Service health check failed",
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        results.push({
          service,
          status: "error",
          duration,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  private async checkServiceHealth(
    service: InfraServiceType
  ): Promise<boolean> {
    // This is a simplified health check - in production you'd want more sophisticated checks
    try {
      const { execSync } = await import("child_process");

      switch (service) {
        case "postgres":
        case "timescaledb":
          // Check if postgres is accepting connections
          execSync(
            `docker exec $(docker ps -q -f name=${service}) pg_isready`,
            {
              stdio: "ignore",
              timeout: this.config.healthCheckTimeout,
            }
          );
          return true;

        case "redis":
          // Check if redis is responding to ping
          execSync(
            `docker exec $(docker ps -q -f name=${service}) redis-cli ping`,
            {
              stdio: "ignore",
              timeout: this.config.healthCheckTimeout,
            }
          );
          return true;

        case "rabbitmq":
          // Check if rabbitmq management API is responding
          execSync(`curl -f http://localhost:15672/api/overview`, {
            stdio: "ignore",
            timeout: this.config.healthCheckTimeout,
          });
          return true;

        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}
