import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { spawn } from "child_process";
import { PassThrough } from "stream";
import type { UnifiedExecutionConfig } from "../../../prompts-manager/types";
import { ProcItem } from "@/log-ui/types";
import type { InfraServiceType } from "../types";
import { getEnvManagerState } from "@/env-manager";

export interface DockerServiceConfig {
  name: string;
  build: {
    context: string;
    dockerfile: string;
  };
  ports?: string[];
  environment?: Record<string, string>;
  depends_on?: string[];
  networks?: string[];
  volumes?: string[];
}

export interface PortsMap {
  [serviceName: string]: {
    internal: number;
    host: number;
  };
}

export class DockerComposeManager {
  private projectsDir: string;
  private logger: any;
  private logProcesses: Map<string, any> | null = null;
  private portsMap: PortsMap;
  private alreadyRunningServices: string[] = [];

  /**
   * Convert repository name to Docker-compatible service name
   */
  private slug(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  constructor(projectsDir: string, logger: any, portsMap?: PortsMap) {
    this.projectsDir = projectsDir;
    this.logger = logger;
    this.portsMap = portsMap || {};
  }

  /**
   * Detect Dockerfiles in repositories configured for Docker mode
   */
  async detectDockerServices(
    repos: string[],
    unifiedConfig: UnifiedExecutionConfig
  ): Promise<DockerServiceConfig[]> {
    const dockerServices: DockerServiceConfig[] = [];

    for (const repo of repos) {
      const repoConfig = unifiedConfig.repoConfigs.find(
        (rc) => rc.repo === repo
      );

      // Check if this repo is configured for Docker mode
      if (
        repoConfig?.mode === "docker" ||
        unifiedConfig.globalMode === "docker"
      ) {
        const repoPath = path.join(this.projectsDir, repo);
        const dockerfilePath = path.join(repoPath, "Dockerfile");

        if (fs.existsSync(dockerfilePath)) {
          this.logger.info(`🐳 Found Dockerfile in ${repo}`);

          // Use ports mapping if available, otherwise extract from Dockerfile
          let ports: string[] | undefined;
          const serviceName = this.slug(repo);
          if (this.portsMap[serviceName]) {
            const portConfig = this.portsMap[serviceName];
            ports = [`${portConfig.host}:${portConfig.internal}`];
            this.logger.info(
              `📡 Using mapped ports for ${serviceName}: ${portConfig.host}:${portConfig.internal}`
            );
          } else {
            // Fallback to extracting from Dockerfile
            const extractedPorts = await this.extractPortsFromDockerfile(
              dockerfilePath
            );
            ports = extractedPorts.length > 0 ? extractedPorts : undefined;
            this.logger.info(
              `📡 Using Dockerfile ports for ${serviceName}: ${extractedPorts.join(
                ", "
              )}`
            );
          }

          const serviceConfig: DockerServiceConfig = {
            name: this.slug(repo),
            build: {
              context: repoPath,
              dockerfile: "Dockerfile",
            },
            ports: ports,
            depends_on: Array.from(getEnvManagerState().internalServices),
            networks: ["devnet3"],
          };

          dockerServices.push(serviceConfig);
        } else {
          this.logger.warning(
            `⚠️ Repository ${repo} configured for Docker but no Dockerfile found`
          );
        }
      }
    }

    return dockerServices;
  }

  /**
   * Extract port mappings from Dockerfile
   */
  private async extractPortsFromDockerfile(
    dockerfilePath: string
  ): Promise<string[]> {
    try {
      const content = fs.readFileSync(dockerfilePath, "utf-8");
      const lines = content.split("\n");
      const ports: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("EXPOSE")) {
          const portMatch = trimmedLine.match(/EXPOSE\s+(\d+)/);
          if (portMatch) {
            const port = portMatch[1];
            // Map container port to host port with same number
            ports.push(`${port}:${port}`);
          }
        }
      }

      return ports;
    } catch (error) {
      this.logger.warning(
        `⚠️ Could not read Dockerfile at ${dockerfilePath}: ${error}`
      );
      return [];
    }
  }

  /**
   * Generate a unified Docker Compose file with infrastructure and application services
   */
  async generateUnifiedCompose(
    dockerServices: DockerServiceConfig[],
    requiredInfraServices?: Set<InfraServiceType>
  ): Promise<string> {
    try {
      // Create unified compose configuration
      const unifiedCompose: any = {
        services: {},
        networks: {
          devnet3: {
            driver: "bridge",
          },
        },
        volumes: {},
      };

      // Add only required infrastructure services to the unified compose
      if (requiredInfraServices && requiredInfraServices.size > 0) {
        this.logger.info(
          `ℹ️ Adding ${requiredInfraServices.size} required infrastructure services to unified compose`
        );

        for (const serviceType of requiredInfraServices) {
          switch (serviceType) {
            case "redis":
              unifiedCompose.services.redis = {
                image: "redis/redis-stack-server:latest",
                restart: "unless-stopped",
                container_name: "redis",
                ports: ["${REDIS_PORT:-6379}:6379"],
                volumes: ["redisdata:/data"],
                healthcheck: {
                  test: ["CMD", "redis-cli", "ping"],
                  interval: "10s",
                  timeout: "5s",
                  retries: 5,
                  start_period: "10s",
                },
                networks: ["devnet3"],
              };
              unifiedCompose.volumes.redisdata = {};
              break;

            case "rabbitmq":
              unifiedCompose.services.rabbitmq = {
                image: "rabbitmq:3-management-alpine",
                container_name: "rabbitmq",
                restart: "unless-stopped",
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
                networks: ["devnet3"],
              };
              unifiedCompose.volumes.rabbitmqdata = {};
              break;

            case "postgres":
              unifiedCompose.services.postgres = {
                image: "postgres:15-alpine",
                restart: "unless-stopped",
                container_name: "postgres",
                environment: {
                  POSTGRES_USER: "${POSTGRES_USERNAME:-default_user}",
                  POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-default_password}",
                  POSTGRES_DB: "${POSTGRES_DATABASE:-default_db}",
                },
                ports: ["${POSTGRES_PORT:-5432}:5432"],
                volumes: ["pgdata:/var/lib/postgresql/data"],
                healthcheck: {
                  test: [
                    "CMD-SHELL",
                    "pg_isready -U ${POSTGRES_USERNAME:-default_user}",
                  ],
                  interval: "10s",
                  timeout: "5s",
                  retries: 5,
                  start_period: "30s",
                },
                networks: ["devnet3"],
              };
              unifiedCompose.volumes.pgdata = {};
              break;

            case "timescaledb":
              unifiedCompose.services.timescaledb = {
                image: "timescale/timescaledb-ha:pg15-latest",
                restart: "unless-stopped",
                container_name: "timescaledb",
                environment: {
                  POSTGRES_USER: "${POSTGRES_TIMESCALE_USERNAME:-default_user}",
                  POSTGRES_PASSWORD:
                    "${POSTGRES_TIMESCALE_PASSWORD:-default_password}",
                  POSTGRES_DB:
                    "${POSTGRES_TIMESCALE_DATABASE:-default_timescale_db}",
                },
                ports: ["${POSTGRES_TIMESCALE_PORT:-5433}:5432"],
                volumes: ["tsdata:/var/lib/postgresql/data"],
                healthcheck: {
                  test: [
                    "CMD-SHELL",
                    "pg_isready -U ${POSTGRES_TIMESCALE_USERNAME:-default_user}",
                  ],
                  interval: "10s",
                  timeout: "5s",
                  retries: 5,
                  start_period: "30s",
                },
                networks: ["devnet3"],
              };
              unifiedCompose.volumes.tsdata = {};
              break;
          }
        }
      } else {
        this.logger.info("ℹ️ No infrastructure services required, skipping");
      }

      // Add application services to the services section
      for (const service of dockerServices) {
        // Build depends_on with health conditions for infrastructure services
        const dependsOn: any = {};

        // Add existing dependencies
        if (service.depends_on) {
          for (const dep of service.depends_on) {
            dependsOn[dep] = { condition: "service_healthy" };
          }
        }

        // Add infrastructure dependencies if they exist and are required
        if (requiredInfraServices) {
          for (const infraService of requiredInfraServices) {
            if (unifiedCompose.services[infraService]) {
              dependsOn[infraService] = { condition: "service_healthy" };
            }
          }
        }

        unifiedCompose.services[service.name] = {
          build: service.build,
          ports: service.ports,
          environment: service.environment,
          restart: "unless-stopped",
          depends_on: Object.keys(dependsOn).length > 0 ? dependsOn : undefined,
          networks: service.networks || ["devnet3"],
          volumes: service.volumes,
        };
      }

      // Generate the unified compose file
      const composeContent = yaml.dump(unifiedCompose, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

      return composeContent;
    } catch (error) {
      throw new Error(`Failed to generate unified Docker Compose: ${error}`);
    }
  }

  /**
   * Get list of currently running Docker services
   */
  async getRunningServices(): Promise<string[]> {
    try {
      return new Promise((resolve, reject) => {
        const dockerPs = spawn("docker", ["ps", "--format", "{{.Names}}"], {
          stdio: ["pipe", "pipe", "pipe"],
        });

        let output = "";
        dockerPs.stdout.on("data", (data) => {
          output += data.toString();
        });

        dockerPs.on("close", (code) => {
          if (code === 0) {
            const services = output
              .trim()
              .split("\n")
              .filter((line) => line.length > 0);
            resolve(services);
          } else {
            resolve([]);
          }
        });

        dockerPs.on("error", () => {
          resolve([]);
        });
      });
    } catch (error) {
      this.logger.warning("⚠️ Could not check running services");
      return [];
    }
  }

  /**
   * Write the unified Docker Compose file
   */
  async writeUnifiedCompose(composeContent: string): Promise<void> {
    const unifiedComposePath = path.join(
      process.cwd(),
      "docker-compose.unified.yml"
    );

    try {
      fs.writeFileSync(unifiedComposePath, composeContent, "utf-8");
      this.logger.success(
        `✅ Generated unified Docker Compose: ${unifiedComposePath}`
      );
    } catch (error) {
      throw new Error(`Failed to write unified Docker Compose: ${error}`);
    }
  }

  /**
   * Start services using the unified Docker Compose
   */
  async startUnifiedServices(): Promise<void> {
    const unifiedComposePath = path.join(
      process.cwd(),
      "docker-compose.unified.yml"
    );

    if (!fs.existsSync(unifiedComposePath)) {
      throw new Error("Unified Docker Compose file not found");
    }

    this.logger.step("🐳 Starting unified Docker services");

    // First, check what services we're about to start
    const services = await this.getServicesFromCompose(unifiedComposePath);
    this.logger.info(
      `📋 Found ${services.length} services to start: ${services.join(", ")}`
    );

    // Build services first with progress tracking
    this.logger.step("🔨 Building Docker images");
    await this.buildServicesWithProgress(unifiedComposePath, services);

    // Start services with progress tracking
    this.logger.step("🚀 Starting Docker services");
    await this.startServicesWithProgress(unifiedComposePath, services);

    // After start, wait until services are healthy before proceeding
    this.logger.step("⏱️ Waiting for Docker services to become healthy");
    await this.waitForServicesHealthy(unifiedComposePath, services, {
      timeoutMs: 5 * 60 * 1000,
      intervalMs: 2000,
    });
  }

  /**
   * Check if a container with the given name exists (running or stopped)
   */
  private async isContainerExists(containerName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const docker = spawn(
        "docker",
        [
          "ps",
          "-a",
          "--filter",
          `name=^${containerName}$`,
          "--format",
          "{{.Names}}",
        ],
        {
          stdio: "pipe",
        }
      );

      let output = "";

      docker.stdout?.on("data", (data) => {
        output += data.toString();
      });

      docker.on("close", (code) => {
        if (code === 0) {
          const exists = output.trim() === containerName;
          resolve(exists);
        } else {
          // If docker command fails, assume container doesn't exist
          resolve(false);
        }
      });

      docker.on("error", (error) => {
        // If docker command fails, assume container doesn't exist
        resolve(false);
      });
    });
  }

  /**
   * Check if a container with the given name is already running
   */
  private async isContainerRunning(containerName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const docker = spawn(
        "docker",
        ["ps", "--filter", `name=^${containerName}$`, "--format", "{{.Names}}"],
        {
          stdio: "pipe",
        }
      );

      let output = "";

      docker.stdout?.on("data", (data) => {
        output += data.toString();
      });

      docker.on("close", (code) => {
        if (code === 0) {
          const isRunning = output.trim() === containerName;
          resolve(isRunning);
        } else {
          // If docker command fails, assume container is not running
          resolve(false);
        }
      });

      docker.on("error", (error) => {
        // If docker command fails, assume container is not running
        resolve(false);
      });
    });
  }

  /**
   * Get list of services from docker-compose file
   */
  private async getServicesFromCompose(composePath: string): Promise<string[]> {
    try {
      const composeContent = fs.readFileSync(composePath, "utf-8");
      const compose = yaml.load(composeContent) as any;
      return Object.keys(compose.services || {});
    } catch (error) {
      this.logger.warning(
        "Could not parse compose file, proceeding without service list"
      );
      return [];
    }
  }

  /**
   * Build services with progress tracking
   */
  private async buildServicesWithProgress(
    composePath: string,
    services: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let buildOutput = "";
      let currentService = "";
      let buildProgress = 0;
      let lastLogTime = Date.now();
      let hasLoggedOutput = false;

      // Start build process
      const dockerCompose = spawn(
        "docker-compose",
        ["-f", composePath, "build", "--progress=plain"],
        {
          stdio: "pipe",
        }
      );

      // Log activity every 5 seconds if no other output
      const progressTimer = setInterval(() => {
        const now = Date.now();
        if (now - lastLogTime > 5000 && !hasLoggedOutput) {
          this.logger.info(`   🔄 Building in progress...`);
          lastLogTime = now;
        }
      }, 5000);

      dockerCompose.stdout?.on("data", (data) => {
        const output = data.toString();
        buildOutput += output;
        lastLogTime = Date.now();
        hasLoggedOutput = true;

        // Parse build progress
        const lines = output.split("\n");
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Log significant build steps
          if (
            trimmedLine.includes("Step ") ||
            trimmedLine.includes("RUN ") ||
            trimmedLine.includes("COPY ") ||
            trimmedLine.includes("ADD ") ||
            trimmedLine.includes("FROM ") ||
            trimmedLine.includes("WORKDIR ")
          ) {
            this.logger.info(`   📝 ${trimmedLine}`);
          }

          // Detect service being built
          const serviceMatch = line.match(
            /Building\s+(\w+)|building\s+(\w+)|#\d+\s+building\s+(\w+)/i
          );
          if (serviceMatch) {
            currentService =
              serviceMatch[1] || serviceMatch[2] || serviceMatch[3];
            this.logger.info(`🔨 Building ${currentService}...`);
            buildProgress = 0;
          }

          // Parse build progress percentage
          const progressMatch = line.match(/(\d+)%/);
          if (progressMatch && currentService) {
            const progress = parseInt(progressMatch[1]);
            if (progress > buildProgress && progress % 25 === 0) {
              // Log every 25%
              buildProgress = progress;
              this.logger.info(
                `   📊 ${currentService}: ${progress}% complete`
              );
            }
          }

          // Detect build steps
          const stepMatch = line.match(/Step\s+(\d+)\/(\d+)/);
          if (stepMatch && currentService) {
            const current = parseInt(stepMatch[1]);
            const total = parseInt(stepMatch[2]);
            const stepProgress = Math.round((current / total) * 100);
            if (stepProgress > buildProgress && stepProgress % 20 === 0) {
              // Log every 20%
              buildProgress = stepProgress;
              this.logger.info(
                `   📊 ${currentService}: Step ${current}/${total} (${stepProgress}%)`
              );
            }
          }

          // Detect build completion
          if (
            line.includes("Successfully built") ||
            line.includes("Successfully tagged") ||
            line.includes("naming to docker.io")
          ) {
            if (currentService) {
              this.logger.success(`   ✅ ${currentService} built successfully`);
            } else {
              this.logger.success(`   ✅ Image built successfully`);
            }
          }

          // Detect build errors
          if (
            line.includes("ERROR") ||
            line.includes("failed") ||
            line.includes("Error")
          ) {
            this.logger.error(
              `   ❌ Build error${
                currentService ? ` in ${currentService}` : ""
              }: ${line.trim()}`
            );
          }

          // Log downloading/pulling activity
          if (line.includes("Pulling") || line.includes("Download")) {
            this.logger.info(`   ⬇️ ${trimmedLine}`);
          }
        }
      });

      dockerCompose.stderr?.on("data", (data) => {
        const output = data.toString();
        buildOutput += output;
        lastLogTime = Date.now();
        hasLoggedOutput = true;

        // Parse stderr for progress and errors
        const lines = output.split("\n");
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Log build progress from stderr (Docker often outputs to stderr)
          if (
            trimmedLine.includes("#") &&
            (trimmedLine.includes("RUN") ||
              trimmedLine.includes("COPY") ||
              trimmedLine.includes("FROM"))
          ) {
            this.logger.info(`   📝 ${trimmedLine}`);
          }

          // Log errors
          if (
            line.includes("ERROR") ||
            line.includes("failed") ||
            line.includes("Error")
          ) {
            this.logger.error(`   ❌ Build error: ${line.trim()}`);
          }

          // Log warnings
          if (line.includes("WARNING") || line.includes("warning")) {
            this.logger.warning(`   ⚠️ ${line.trim()}`);
          }
        }
      });

      dockerCompose.on("close", (code: number) => {
        clearInterval(progressTimer);

        if (code === 0) {
          this.logger.success("✅ All Docker images built successfully");
          resolve();
        } else {
          const errorMessage = buildOutput || "Unknown build error";
          const errorCategory = this.categorizeDockerError(errorMessage);
          const solutions = this.getDockerErrorSolutions(errorCategory);

          this.logger.error(`❌ Docker build failed with code ${code}`);
          this.logger.error(`🔍 Error category: ${errorCategory}`);
          this.logger.error(`📝 Error details: ${errorMessage}`);

          if (solutions.length > 0) {
            this.logger.info("🔧 Suggested solutions:");
            solutions.forEach((solution, index) => {
              this.logger.info(`   ${index + 1}. ${solution}`);
            });
          }

          reject(
            new Error(`Docker build failed with code ${code}: ${errorMessage}`)
          );
        }
      });

      dockerCompose.on("error", (error: Error) => {
        clearInterval(progressTimer);
        const errorCategory = this.categorizeDockerError(error.message);
        const solutions = this.getDockerErrorSolutions(errorCategory);

        this.logger.error(`❌ Failed to start Docker build: ${error.message}`);
        this.logger.error(`🔍 Error category: ${errorCategory}`);

        if (solutions.length > 0) {
          this.logger.info("🔧 Suggested solutions:");
          solutions.forEach((solution, index) => {
            this.logger.info(`   ${index + 1}. ${solution}`);
          });
        }

        reject(new Error(`Failed to start Docker build: ${error.message}`));
      });
    });
  }

  /**
   * Start services with progress tracking
   */
  private async startServicesWithProgress(
    composePath: string,
    services: string[]
  ): Promise<void> {
    this.logger.info(`🚀 Starting ${services.length} Docker services...`);

    return new Promise((resolve, reject) => {
      let startOutput = "";
      let lastLogTime = Date.now();
      let hasLoggedOutput = false;
      const startedServices = new Set<string>();

      // Periodic heartbeat while starting
      const progressTimer = setInterval(() => {
        const now = Date.now();
        if (now - lastLogTime > 5000 && !hasLoggedOutput) {
          this.logger.info(
            `   🔄 Starting in progress... (${startedServices.size}/${services.length})`
          );
          lastLogTime = now;
        }
      }, 5000);

      // Start all services with docker-compose up -d
      const dockerCompose = spawn(
        "docker-compose",
        ["-f", composePath, "up", "-d"],
        {
          stdio: "pipe",
        }
      );

      const parseStartLines = (chunk: string) => {
        const lines = chunk.split("\n");
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          hasLoggedOutput = true;
          lastLogTime = Date.now();

          // Detect events
          const creatingDone = line.match(
            /Creating\s+([\w.-]+)\s+\.\.\.\s+done/i
          );
          const startingDone = line.match(
            /Starting\s+([\w.-]+)\s+\.\.\.\s+done/i
          );
          const recreatingDone = line.match(
            /Recreating\s+([\w.-]+)\s+\.\.\.\s+done/i
          );
          const upToDate = line.match(/([\w.-]+)\s+is up-to-date/i);
          const pulling = line.match(/Pulling\s+([\w.-]+)\s*\(?.*\)?/i);

          if (pulling?.[1]) {
            this.logger.info(`   ⬇️  Pulling image for ${pulling[1]}...`);
          }

          const serviceName =
            creatingDone?.[1] ||
            startingDone?.[1] ||
            recreatingDone?.[1] ||
            upToDate?.[1];

          if (serviceName && !startedServices.has(serviceName)) {
            startedServices.add(serviceName);
            const status = upToDate ? "up-to-date" : "started";
            this.logger.info(
              `   ✅ ${serviceName} ${status} (${startedServices.size}/${services.length})`
            );
          }

          if (/\b(ERROR|failed|Error)\b/i.test(line)) {
            this.logger.error(`   ❌ ${line}`);
          }
        }
      };

      dockerCompose.stdout?.on("data", (data) => {
        const output = data.toString();
        startOutput += output;
        parseStartLines(output);
      });

      dockerCompose.stderr?.on("data", (data) => {
        const output = data.toString();
        startOutput += output;
        parseStartLines(output);
      });

      dockerCompose.on("close", (code: number) => {
        clearInterval(progressTimer);
        if (code === 0) {
          // Summary
          this.logger.success(`✅ Docker services startup completed`);

          resolve();
        } else {
          const errorMessage = startOutput || "Unknown startup error";
          this.logger.error(`❌ Docker startup failed with code ${code}`);
          this.logger.error(`📝 Error details: ${errorMessage}`);
          reject(
            new Error(
              `Docker startup failed with code ${code}: ${errorMessage}`
            )
          );
        }
      });

      dockerCompose.on("error", (error: Error) => {
        clearInterval(progressTimer);
        this.logger.error(
          `❌ Failed to start Docker services: ${error.message}`
        );
        reject(new Error(`Failed to start Docker services: ${error.message}`));
      });
    });
  }

  /**
   * Resolve container ID for a given compose service name
   */
  private async getContainerIdForService(
    composePath: string,
    serviceName: string
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(
        "docker-compose",
        ["-f", composePath, "ps", "-q", serviceName],
        { stdio: ["pipe", "pipe", "pipe"] }
      );

      let output = "";
      proc.stdout?.on("data", (d) => (output += d.toString()));
      proc.on("close", (code) => {
        if (code === 0) {
          const id = output.trim();
          resolve(id.length > 0 ? id : null);
        } else {
          resolve(null);
        }
      });
      proc.on("error", () => resolve(null));
    });
  }

  /**
   * Inspect a container's health and running status by ID
   */
  private async getContainerHealthStatusById(
    containerId: string
  ): Promise<{ status: string; hasHealthcheck: boolean }> {
    return new Promise((resolve) => {
      const proc = spawn("docker", ["inspect", containerId], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      proc.stdout?.on("data", (d) => (output += d.toString()));
      proc.on("close", () => {
        try {
          const data = JSON.parse(output);
          const state = data?.[0]?.State;
          const healthStatus = state?.Health?.Status as string | undefined;
          const status = healthStatus || (state?.Status as string) || "unknown";
          resolve({ status, hasHealthcheck: Boolean(state?.Health) });
        } catch {
          resolve({ status: "unknown", hasHealthcheck: false });
        }
      });
      proc.on("error", () =>
        resolve({ status: "unknown", hasHealthcheck: false })
      );
    });
  }

  /**
   * Wait until all specified services are healthy (or running if no healthcheck)
   */
  private async waitForServicesHealthy(
    composePath: string,
    services: string[],
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
    const intervalMs = opts?.intervalMs ?? 2000; // 2 seconds
    const start = Date.now();
    const pending = new Set<string>(services);
    let lastHeartbeat = 0;

    while (pending.size > 0) {
      for (const serviceName of Array.from(pending)) {
        const containerId = await this.getContainerIdForService(
          composePath,
          serviceName
        );
        if (!containerId) {
          continue; // not yet created/started
        }

        const { status, hasHealthcheck } =
          await this.getContainerHealthStatusById(containerId);

        // Normalize and act on status
        if (hasHealthcheck) {
          if (status === "healthy") {
            pending.delete(serviceName);
            this.logger.success(`   ✅ ${serviceName} healthy`);
          } else if (status === "unhealthy") {
            throw new Error(`Service ${serviceName} reported unhealthy`);
          }
        } else {
          // No healthcheck -> consider running as good-enough
          if (status === "running") {
            pending.delete(serviceName);
            this.logger.info(`   ✅ ${serviceName} running (no healthcheck)`);
          } else if (status === "exited" || status === "dead") {
            throw new Error(
              `Service ${serviceName} is not running (status: ${status})`
            );
          }
        }
      }

      // Heartbeat log
      const now = Date.now();
      if (now - lastHeartbeat > 5000 && pending.size > 0) {
        this.logger.info(
          `   🔄 Waiting for health... (${services.length - pending.size}/${
            services.length
          })`
        );
        lastHeartbeat = now;
      }

      if (pending.size === 0) break;

      if (Date.now() - start > timeoutMs) {
        const stillPending = Array.from(pending).join(", ");
        throw new Error(
          `Timed out waiting for services to become healthy: ${stillPending}`
        );
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  /**
   * Stop unified Docker services
   */
  async stopUnifiedServices(): Promise<void> {
    const ymlPath = path.join(process.cwd(), "docker-compose.unified.yml");

    const composePath = fs.existsSync(ymlPath) ? ymlPath : null;

    if (!composePath) {
      return; // Nothing to stop
    }
    this.logger.step("🛑 Stopping unified Docker services");

    const dockerCompose = spawn(
      "docker",
      ["compose", "-f", composePath, "down"],
      {
        stdio: "inherit",
      }
    );

    // Stop log streaming processes
    if (this.logProcesses) {
      this.logProcesses.forEach((process, serviceName) => {
        try {
          process.kill();
          this.logger.info(`🛑 Stopped log streaming for ${serviceName}`);
        } catch (error) {
          this.logger.warning(
            `⚠️ Could not stop log streaming for ${serviceName}: ${error}`
          );
        }
      });
      this.logProcesses.clear();
    }

    return new Promise((resolve, reject) => {
      dockerCompose.on("close", (code: number) => {
        if (code === 0) {
          this.logger.success("✅ Unified Docker services stopped");
          resolve();
        } else {
          reject(new Error(`Docker Compose down failed with code ${code}`));
        }
      });

      dockerCompose.on("error", (error: Error) => {
        reject(new Error(`Failed to stop Docker Compose: ${error.message}`));
      });
    });
  }

  /**
   * Create ProcItem objects for LogViewer from Docker services
   */
  async createLogViewerItems(): Promise<ProcItem[]> {
    const unifiedComposePath = path.join(
      process.cwd(),
      "docker-compose.unified.yml"
    );

    try {
      const composeContent = fs.readFileSync(unifiedComposePath, "utf-8");
      const compose = yaml.load(composeContent) as any;

      const procItems: ProcItem[] = [];

      if (compose.services) {
        this.logger.info(
          `🐳 Creating log viewer items for ${
            Object.keys(compose.services).length
          } Docker services...`
        );

        for (const serviceName of Object.keys(compose.services)) {
          // Create a pass-through stream for the service logs
          const logStream = new PassThrough();

          // Start the log streaming process
          const dockerLogs = spawn(
            "docker-compose",
            [
              "-f",
              path.join(process.cwd(), "docker-compose.unified.yml"),
              "logs",
              "-f",
              serviceName,
            ],
            {
              stdio: ["pipe", "pipe", "pipe"],
            }
          );

          // Pipe the logs to our pass-through stream with empty line filtering
          dockerLogs.stdout.on("data", (data) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.length > 0) {
                logStream.write(line + "\n");
              }
            }
          });

          dockerLogs.stderr.on("data", (data) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.length > 0) {
                logStream.write(line + "\n");
              }
            }
          });

          dockerLogs.on("error", (error) => {
            this.logger.warning(
              `⚠️ Could not stream logs for ${serviceName}: ${error}`
            );
          });

          // Store the process for cleanup
          if (!this.logProcesses) {
            this.logProcesses = new Map();
          }
          this.logProcesses.set(serviceName, dockerLogs);

          // Create ProcItem for LogViewer with Docker process
          procItems.push({
            name: serviceName,
            stream: logStream,
            proc: dockerLogs,
          });

          // Log which service is being monitored and its status
          const isAlreadyRunning =
            this.alreadyRunningServices.includes(serviceName);
          this.logger.info(
            `   📊 Monitoring ${serviceName} (${
              isAlreadyRunning ? "already running" : "newly started"
            })`
          );

          // Add a small delay to ensure logs start flowing, then trigger a redraw
          setTimeout(() => {
            // Write a small marker to trigger LogViewer redraw
            const isAlreadyRunning =
              this.alreadyRunningServices.includes(serviceName);
            if (isAlreadyRunning) {
              logStream.write("⏭️  Docker service was already running\n");
            } else {
              logStream.write("🚀 Docker service started\n");
            }
          }, 500);
        }
      }

      return procItems;
    } catch (error) {
      this.logger.warning(`⚠️ Could not create LogViewer items: ${error}`);
      return [];
    }
  }

  /**
   * Remove a specific container
   */
  private async removeContainer(containerName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const docker = spawn("docker", ["rm", containerName], {
        stdio: "pipe",
      });

      docker.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`Failed to remove container ${containerName}: ${code}`)
          );
        }
      });

      docker.on("error", (error) => {
        reject(
          new Error(
            `Failed to remove container ${containerName}: ${error.message}`
          )
        );
      });
    });
  }

  /**
   * Categorize Docker errors for better error reporting
   */
  private categorizeDockerError(errorMessage: string): string {
    const message = errorMessage.toLowerCase();

    if (
      message.includes("port") ||
      message.includes("address already in use")
    ) {
      return "PORT_CONFLICT";
    }

    if (message.includes("permission") || message.includes("denied")) {
      return "PERMISSION_ERROR";
    }

    if (message.includes("not found") || message.includes("no such file")) {
      return "FILE_NOT_FOUND";
    }

    if (message.includes("network") || message.includes("connection")) {
      return "NETWORK_ERROR";
    }

    if (message.includes("build") || message.includes("dockerfile")) {
      return "BUILD_ERROR";
    }

    if (message.includes("image") || message.includes("pull")) {
      return "IMAGE_ERROR";
    }

    if (message.includes("volume") || message.includes("mount")) {
      return "VOLUME_ERROR";
    }

    if (message.includes("memory") || message.includes("disk space")) {
      return "RESOURCE_ERROR";
    }

    if (message.includes("syntax") || message.includes("yaml")) {
      return "SYNTAX_ERROR";
    }

    return "UNKNOWN_ERROR";
  }

  /**
   * Get Docker error-specific solutions
   */
  private getDockerErrorSolutions(errorCategory: string): string[] {
    const solutions: string[] = [];

    switch (errorCategory) {
      case "PORT_CONFLICT":
        solutions.push("Check if ports are already in use: lsof -i :PORT");
        solutions.push("Stop conflicting services or change port mappings");
        solutions.push("Use different host ports in the compose configuration");
        break;

      case "PERMISSION_ERROR":
        solutions.push("Run with elevated permissions (sudo)");
        solutions.push(
          "Add user to docker group: sudo usermod -aG docker $USER"
        );
        solutions.push(
          "Check Docker daemon is running: sudo systemctl start docker"
        );
        break;

      case "FILE_NOT_FOUND":
        solutions.push("Verify Dockerfile exists in the project directory");
        solutions.push("Check file paths in docker-compose.yml");
        solutions.push("Ensure all referenced files and directories exist");
        break;

      case "NETWORK_ERROR":
        solutions.push("Check Docker network configuration");
        solutions.push("Verify internet connectivity for image pulls");
        solutions.push("Configure Docker proxy settings if behind firewall");
        break;

      case "BUILD_ERROR":
        solutions.push("Check Dockerfile syntax and instructions");
        solutions.push("Verify all build context files are present");
        solutions.push("Review build logs for specific error details");
        break;

      case "IMAGE_ERROR":
        solutions.push("Pull images manually: docker pull IMAGE_NAME");
        solutions.push("Check image availability in registry");
        solutions.push("Verify image names and tags are correct");
        break;

      case "VOLUME_ERROR":
        solutions.push("Check volume permissions and ownership");
        solutions.push("Verify volume paths exist and are accessible");
        solutions.push("Create missing directories for volume mounts");
        break;

      case "RESOURCE_ERROR":
        solutions.push("Check available disk space: df -h");
        solutions.push("Monitor system resources: docker system df");
        solutions.push("Clean up unused Docker resources: docker system prune");
        break;

      case "SYNTAX_ERROR":
        solutions.push("Validate docker-compose.yml syntax");
        solutions.push("Check YAML indentation and formatting");
        solutions.push("Use docker-compose config to validate configuration");
        break;

      default:
        solutions.push("Check Docker daemon status: docker info");
        solutions.push("Review Docker logs: journalctl -u docker");
        solutions.push("Try running docker-compose manually to debug");
    }

    return solutions;
  }
}
