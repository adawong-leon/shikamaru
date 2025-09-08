// Application Service Manager (Staff Engineer version)
//
// Purpose:
//   Orchestrates lifecycle of application services (local & dockerized):
//   dependency installation, startup, monitoring, and shutdown.
//
// Design goals:
//   - Service-agnostic (frontend, backend, infra).
//   - Pluggable execution strategies (local, docker, hybrid).
//   - Unified error classification & actionable suggestions.
//   - Observability hooks (LogBuffer) and structured logging.
//   - Predictable return values and safe resource cleanup.

import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import { spawn, type ChildProcess } from "child_process";
import { PassThrough } from "stream";

import { HybridError } from "../errors/HybridError";
import { execWithSudo, npmInstallWithSudo, ProcessManager } from "@/utils";
import { FrameworkDetector, type FrameworkInfo } from "./FrameworkDetector";
import type { InfraServiceType, ServiceStartOptions } from "../types";
import { getEnvManagerState } from "../../../env-manager/index";
import { UnifiedConfig } from "../../../config";
import { DockerComposeManager } from "./DockerComposeManager";
import { LogBuffer } from "./LogBuffer";
import { ProcItem } from "@/log-ui/types";
import {
  getRunningDockerContainers,
  stopDockerContainer,
  resolveContainerName,
  getDockerContainerNameWithFallbacks,
  getPlannedDockerServiceNames,
  normalizeName,
} from "@/api/express/utils/processUtils";

type InstallOutcome = {
  readyServices: string[];
  installFailures: string[];
};

type StartOutcome = {
  processes: ProcItem[];
  failedServices: string[];
};

type StartApplicationOptions = {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

// Typed stop reporting used by stopApplicationServices
type StopKind = "planned-docker" | "infra-docker";
type StopRecord = {
  name: string;
  kind: StopKind;
  stopped: boolean;
  reason?: string;
};
type DockerStopError = {
  name: string;
  kind: StopKind;
  error: string;
};

export class AppServiceManager {
  private readonly config: UnifiedConfig;
  private readonly logger: any;

  private readonly frameworkDetector: FrameworkDetector;
  private readonly dockerComposeManager: DockerComposeManager;
  private readonly logBuffer?: LogBuffer;

  private runningServices: Map<string, ProcItem> = new Map();

  constructor(config: UnifiedConfig, logger: any) {
    this.config = config;
    this.logger = logger;
    this.frameworkDetector = new FrameworkDetector();

    this.dockerComposeManager = new DockerComposeManager(
      config.getProjectsDir(),
      logger,
      config.getPortAssignments()
    );

    if (config.isWebLoggingEnabled()) {
      this.logBuffer = LogBuffer.getInstance();
      this.logBuffer.enable();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────────

  async startApplicationServices(
    repos: string[],
    options?: StartApplicationOptions
  ): Promise<{
    processes: ProcItem[];
    failedServices: string[];
    installFailures: string[];
  }> {
    const targetRepos = repos?.length
      ? repos
      : this.config.getRepositoryNames();

    if (targetRepos.length === 0) {
      this.logger.info("ℹ️ No application services configured.");
      return { processes: [], failedServices: [], installFailures: [] };
    }

    this.logger.sectionHeader(
      `Application Services Startup (${targetRepos.length})`
    );

    const results = {
      processes: [] as ProcItem[],
      failedServices: [] as string[],
      installFailures: [] as string[],
    };

    try {
      // --- Docker services (apps in docker + infra dependencies) ---
      const dockerServices =
        await this.dockerComposeManager.detectDockerServices(
          targetRepos,
          this.config
        );
      const infraServices = getEnvManagerState().internalServices;
      this.config.setInfraServices(Array.from(infraServices) as any[]);
      if (dockerServices.length || infraServices.size) {
        await this.setupDockerServices(dockerServices, infraServices, results);
      }

      // --- Local services ---
      const localRepos = this.getLocalRepos(targetRepos);
      if (localRepos.length) {
        const { readyServices, installFailures } =
          await this.installDependencies(localRepos, options);
        results.installFailures.push(...installFailures);

        if (installFailures.length === 0 && readyServices.length) {
          const { processes, failedServices } = await this.startLocalServices(
            readyServices,
            options
          );
          results.processes.push(...processes);
          results.failedServices.push(...failedServices);
        }
      }

      this.summarizeStartup(targetRepos, results);
      this.runningServices = new Map(results.processes.map((p) => [p.name, p]));
      return results;
    } catch (err) {
      throw HybridError.fromServiceStartError("application", err);
    }
  }

  async stopApplicationServices() {
    const startedAt = Date.now();

    const initialCount = this.runningServices.size;
    this.logger.info("🛑 Stopping all services...");

    // 1) Stop all local app processes
    let localStopErrors: string | null = null;
    try {
      const dockerServices = getPlannedDockerServiceNames();
      await ProcessManager.stopAll(
        Array.from(this.runningServices.values()).filter(
          (proc) => !dockerServices.has(proc.name)
        ) as ProcItem[]
      );
      this.logger.info(
        `🧹 Stopped ${this.runningServices.size} local process(es).`
      );
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? String(e);
      localStopErrors = msg;
      this.logger.warning?.(`⚠️ Failed while stopping local processes: ${msg}`);
    }
    // 2) Stop Docker services and collect a report
    const dockerReport = await this.stopDockerAndReport();

    // 3) Clear in-memory tracking
    const stoppedProcesses = this.runningServices.size;
    this.runningServices = new Map();

    const durationMs = Date.now() - startedAt;

    // Summary
    const dockerStopped = dockerReport.stopped.length;
    const dockerSkipped = dockerReport.skipped.length;
    const totalErrors = dockerReport.errors.length + (localStopErrors ? 1 : 0);

    if (totalErrors === 0) {
      this.logger.success(
        `✅ All services stopped successfully in ${durationMs}ms ` +
          `(processes: ${stoppedProcesses}, docker stopped: ${dockerStopped}, skipped: ${dockerSkipped}).`
      );
    } else {
      this.logger.warning?.(
        `✅ Stopping finished with ${totalErrors} error(s) in ${durationMs}ms ` +
          `(processes: ${stoppedProcesses}, docker stopped: ${dockerStopped}, skipped: ${dockerSkipped}).`
      );
    }

    return {
      success: totalErrors === 0,
      data: {
        message:
          totalErrors === 0
            ? "All services stopped successfully"
            : "Stopped with some errors",
        stoppedServices: initialCount,
        stoppedProcesses,
        docker: {
          stopped: dockerReport.stopped,
          skipped: dockerReport.skipped,
          errors: dockerReport.errors,
        },
        durationMs,
      },
      error: totalErrors
        ? `${totalErrors} error(s) occurred. See data.docker.errors.`
        : undefined,
    };
  }

  getRunningServices(): Map<string, ProcItem> {
    return this.runningServices;
  }

  isServiceRunning(serviceName: string): boolean {
    return this.runningServices.has(serviceName);
  }

  getServiceStatus(serviceName: string): any {
    const service = this.runningServices.get(serviceName);
    if (!service) return null;

    return {
      name: serviceName,
      status: service.proc?.killed ? "stopped" : "running",
      pid: service.proc?.pid,
      // TODO(ma): Wire real process metrics provider
      uptime: service.proc?.pid
        ? this.getProcessUptime(service.proc.pid)
        : null,
      memoryUsage: service.proc?.pid
        ? this.getProcessMemoryUsage(service.proc.pid)
        : null,
      cpuUsage: service.proc?.pid
        ? this.getProcessCpuUsage(service.proc.pid)
        : null,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Docker + Local orchestration
  // ────────────────────────────────────────────────────────────────────────────────

  private async stopDockerAndReport(): Promise<{
    stopped: StopRecord[];
    skipped: StopRecord[];
    errors: DockerStopError[];
  }> {
    const stopped: StopRecord[] = [];
    const skipped: StopRecord[] = [];
    const errors: DockerStopError[] = [];

    try {
      // Determine which docker services exist in the unified compose, if any
      const composePathYml = path.join(
        process.cwd(),
        "docker-compose.unified.yml"
      );
      const composePath = fs.existsSync(composePathYml) ? composePathYml : null;

      if (!composePath) {
        // Nothing to stop
        return { stopped, skipped, errors };
      }

      // Load compose to list services for reporting
      try {
        const content = fs.readFileSync(composePath, "utf-8");
        const compose = yaml.load(content) as any;
        if (compose?.services) {
          const names = Object.keys(compose.services) as string[];
          // Pre-populate as planned docker services; actual stop action happens below
          for (const name of names) {
            skipped.push({
              name,
              kind: "planned-docker",
              stopped: false,
              reason: "pending stop",
            });
          }
        }
      } catch (e) {
        this.logger.warning?.(
          `⚠️ Unable to parse unified compose for reporting: ${
            (e as Error).message
          }`
        );
      }

      await this.dockerComposeManager.stopUnifiedServices();

      // If stop succeeds, convert any pending records to stopped
      for (const rec of skipped) {
        if (rec.kind === "planned-docker") {
          stopped.push({ name: rec.name, kind: rec.kind, stopped: true });
        }
      }
      return { stopped, skipped: [], errors };
    } catch (e: unknown) {
      errors.push({
        name: "docker-compose",
        kind: "planned-docker",
        error: (e as Error)?.message ?? String(e),
      });
      return { stopped, skipped, errors };
    }
  }

  private async setupDockerServices(
    dockerServices: any[],
    infra: Set<InfraServiceType>,
    results: { processes: ProcItem[] }
  ) {
    this.logger.step("🐳 Docker Compose setup");

    const composeContent =
      await this.dockerComposeManager.generateUnifiedCompose(
        dockerServices,
        infra
      );
    await this.dockerComposeManager.writeUnifiedCompose(composeContent);
    this.logger.stopProgress(true, "Docker Compose configuration ready");

    await this.dockerComposeManager.startUnifiedServices();
    this.logger.stopProgress(true, "Docker services started");

    const dockerProcItems =
      await this.dockerComposeManager.createLogViewerItems();
    results.processes.push(...dockerProcItems);

    this.logger.info(
      `📊 Docker process items created: ${dockerProcItems.length}`
    );
    if (dockerProcItems.length > 0) {
      this.logger.info(
        `📋 Docker services monitored: ${dockerProcItems
          .map((p) => p.name)
          .join(", ")}`
      );
    }
    this.logger.stopProgress(true, "Log monitoring configured");
  }

  private getLocalRepos(targetRepos: string[]): string[] {
    return targetRepos.filter((repo) => {
      const repoConfig = this.config
        .getRepoConfigs()
        .find((r) => r.repo === repo);
      const isDockerMode =
        repoConfig?.mode === "docker" ||
        this.config.getGlobalMode() === "docker";
      return !isDockerMode;
    });
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Dependency installation (local)
  // ────────────────────────────────────────────────────────────────────────────────

  private async installDependencies(
    repos: string[],
    options?: StartApplicationOptions
  ): Promise<InstallOutcome> {
    const readyServices: string[] = [];
    const installFailures: string[] = [];

    this.logger.sectionHeader("Dependency Installation");
    this.logger.info(
      `📦 Installing dependencies for ${repos.length} repositories`
    );

    const concurrency = Math.max(1, options?.concurrency ?? 1);
    const timeoutMs = options?.timeoutMs;
    const signal = options?.signal;

    let completed = 0;

    const worker = async (repo: string, index: number) => {
      const repoPath = path.join(this.config.getProjectsDir(), repo);
      const startTime = Date.now();

      try {
        const execCfg = this.getExecutionConfig(repo);

        // Decide install necessity
        let shouldInstall = true;
        let skipReason = "";

        if (this.config.getSkipInstall()) {
          shouldInstall = false;
          skipReason = "Skip installation flag enabled";
        } else if (execCfg.mode === "docker") {
          shouldInstall = false;
          skipReason = `Docker mode selected (${execCfg.source})`;
        }

        if (!shouldInstall) {
          this.logger.installStep(
            repo,
            `Skipping installation - ${skipReason}`
          );
          readyServices.push(repo);
          return;
        }

        // Detect framework
        this.logger.installStep(repo, "Detecting framework...");
        const fw = await this.frameworkDetector.detectFramework(repoPath);

        if (fw?.installCommand) {
          this.logger.installStart(repo, fw.framework);
        } else {
          this.logger.installStart(repo);
        }

        // Choose install command (custom > framework-detected)
        const installCommand =
          execCfg.installCommand ?? fw?.installCommand ?? null;

        if (installCommand) {
          const [command, ...args] = installCommand.split(" ");

          this.logger.installStep(
            repo,
            `Executing: ${command} ${args.join(" ")}`
          );

          const result = await this.installWithRetry(
            command,
            args,
            repoPath,
            fw?.framework || "unknown",
            2
          );
          const duration = Math.round((Date.now() - startTime) / 1000);

          if (result.success) {
            readyServices.push(repo);
            this.logger.installSuccess(repo, duration);
          } else {
            installFailures.push(repo);
            this.logger.installFailure(repo, result.error?.message);

            if (result.error) {
              const category = this.categorizeInstallError(result.error);
              const suggestions = this.getErrorSpecificSolutions(
                category,
                fw?.framework || "unknown"
              );
              if (suggestions.length) {
                this.logger.warningWithSuggestions(
                  `Installation failed for ${repo}`,
                  suggestions
                );
              }
            }
          }
        } else {
          // No install step needed
          readyServices.push(repo);
          this.logger.installStep(repo, "No dependencies to install");
        }
      } catch (error) {
        installFailures.push(repo);
        this.logger.installFailure(
          repo,
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        completed++;
        this.logger.info(
          `Installation Progress: ${completed}/${repos.length} - ${readyServices.length} successful, ${installFailures.length} failed`
        );
      }
    };

    await this.runWithConcurrency(
      repos,
      worker,
      concurrency,
      timeoutMs,
      signal
    );

    // Summary
    this.logger.info("Installation Summary");
    if (readyServices.length) {
      this.logger.success(
        `✅ Installed for ${readyServices.length} repositories`
      );
      this.logger.info(`📋 Ready: ${readyServices.join(", ")}`);
    }
    if (installFailures.length) {
      this.logger.error(`❌ Failed for ${installFailures.length} repositories`);
      this.logger.info(`📋 Failed: ${installFailures.join(", ")}`);
    }

    return { readyServices, installFailures };
  }

  private async installWithRetry(
    command: string,
    args: string[],
    cwd: string,
    framework: string,
    maxRetries: number = 2
  ): Promise<{ success: boolean; error?: Error; attempts: number }> {
    let lastError: Error | undefined;
    const repoName = path.basename(cwd);

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        if (attempt > 1) {
          this.logger.installStep(
            repoName,
            `Retry attempt ${attempt - 1}/${maxRetries}`
          );
        }

        const result = npmInstallWithSudo(command, args, cwd, {
          shell: process.platform === "win32",
        });

        this.logger.stopProgress(true);

        if (result.status === 0) {
          if (attempt > 1)
            this.logger.installStep(
              repoName,
              `Succeeded on attempt ${attempt}`
            );
          return { success: true, attempts: attempt };
        }

        const errorMessage =
          result.stderr?.toString() ||
          result.stdout?.toString() ||
          (result.error as any)?.message ||
          "Unknown error";

        lastError = new Error(errorMessage);

        if (!this.isRetryableError(lastError, framework)) {
          this.logger.installStep(repoName, "Non-retryable error detected");
          break;
        }

        if (attempt <= maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.logger.installStep(
            repoName,
            `Waiting ${delay}ms before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        this.logger.stopProgress(false);
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryableError(lastError, framework)) {
          this.logger.installStep(repoName, "Non-retryable error detected");
          break;
        }

        if (attempt <= maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.logger.installStep(
            repoName,
            `Waiting ${delay}ms before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.stopProgress(false, `Failed after ${maxRetries + 1} attempts`);
    return { success: false, error: lastError, attempts: maxRetries + 1 };
  }

  private isRetryableError(error: Error, _framework: string): boolean {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound")
    )
      return true;

    if (
      msg.includes("registry") ||
      msg.includes("npm") ||
      msg.includes("yarn") ||
      msg.includes("pnpm")
    )
      return true;

    if (
      msg.includes("permission") ||
      msg.includes("eacces") ||
      msg.includes("enoent")
    )
      return false;
    if (msg.includes("syntax") || msg.includes("parse")) return false;

    return false;
  }

  private categorizeInstallError(error: Error): string {
    const m = error.message.toLowerCase();
    if (m.includes("permission") || m.includes("eacces"))
      return "PERMISSION_ERROR";
    if (m.includes("enoent") || m.includes("not found"))
      return "COMMAND_NOT_FOUND";
    if (m.includes("network") || m.includes("timeout")) return "NETWORK_ERROR";
    if (m.includes("registry") || m.includes("npm")) return "REGISTRY_ERROR";
    if (m.includes("syntax") || m.includes("parse")) return "SYNTAX_ERROR";
    if (m.includes("version") || m.includes("incompatible"))
      return "VERSION_ERROR";
    return "UNKNOWN_ERROR";
  }

  private getErrorSpecificSolutions(
    errorCategory: string,
    framework: string
  ): string[] {
    const s: string[] = [];
    switch (errorCategory) {
      case "PERMISSION_ERROR":
        s.push("Run with elevated permissions (sudo/admin)");
        s.push("Check file permissions in the project directory");
        s.push("Verify package manager installation");
        break;
      case "COMMAND_NOT_FOUND":
        s.push(`Install the required package manager/tool for ${framework}`);
        s.push("Add the package manager to PATH");
        s.push("Use npx for npm commands: npx npm install");
        break;
      case "NETWORK_ERROR":
        s.push("Check internet connection");
        s.push("Configure proxy if behind a corporate firewall");
        s.push("Try a different npm registry");
        s.push("Clear the package manager cache");
        break;
      case "REGISTRY_ERROR":
        s.push("Clear the package manager cache");
        s.push("Check npm/yarn registry configuration");
        s.push("Try using a different registry");
        s.push("Verify package.json dependencies");
        break;
      case "SYNTAX_ERROR":
        s.push("Check package.json syntax");
        s.push("Verify lockfile integrity");
        s.push("Remove node_modules and reinstall");
        break;
      case "VERSION_ERROR":
        s.push("Update package manager to latest version");
        s.push("Check Node.js version compatibility");
        s.push("Update dependencies to compatible versions");
        break;
      default:
        s.push("Check project configuration");
        s.push("Verify all dependencies are available");
        s.push("Try manual installation to debug");
    }
    return s;
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Startup (local)
  // ────────────────────────────────────────────────────────────────────────────────

  private async startLocalServices(
    repos: string[],
    options?: StartApplicationOptions
  ): Promise<StartOutcome> {
    const processes: ProcItem[] = [];
    const failedServices: string[] = [];

    this.logger.sectionHeader("Service Startup");
    this.logger.info(`🚀 Starting ${repos.length} application services`);

    const concurrency = Math.max(1, options?.concurrency ?? 1);
    const timeoutMs = options?.timeoutMs;
    const signal = options?.signal;

    let completed = 0;

    const worker = async (repo: string, index: number) => {
      const startTime = Date.now();

      try {
        const repoPath = path.join(this.config.getProjectsDir(), repo);

        // Detect framework
        this.logger.startupStep(repo, "Detecting framework...");
        const fw = await this.frameworkDetector.detectFramework(repoPath);
        if (fw) {
          this.logger.startupStep(
            repo,
            `Detected ${fw.framework} (${fw.type})`
          );
          if (fw.version)
            this.logger.startupStep(repo, `Version: ${fw.version}`);
        }

        // Resolve execution config + startup command
        const execCfg = this.getExecutionConfig(repo);

        let startupCommand = fw?.startupCommand || "npm run start";
        if (execCfg.startupCommand) {
          startupCommand = execCfg.startupCommand;
          this.logger.startupStep(
            repo,
            `Using custom startup command: ${startupCommand}`
          );
        } else if (execCfg.mode === "docker") {
          startupCommand = "docker-compose up";
          this.logger.startupStep(
            repo,
            `Using Docker command: ${startupCommand}`
          );
        } else {
          this.logger.startupStep(
            repo,
            `Using framework command: ${startupCommand}`
          );
        }

        const isFrontend = fw?.type === "frontend";

        this.logger.startupStart(repo, startupCommand);
        const procItem = isFrontend
          ? await this.startFrontendInTerminal(
              repo,
              fw,
              repoPath,
              startupCommand
            )
          : await this.startService({
              name: repo,
              command: startupCommand,
              args: [],
              cwd: repoPath,
              env: process.env,
            });

        processes.push(procItem);
        const duration = Math.round((Date.now() - startTime) / 1000);
        this.logger.startupSuccess(repo, undefined, procItem.proc?.pid);
      } catch (error) {
        failedServices.push(repo);
        const message = error instanceof Error ? error.message : String(error);
        this.logger.startupFailure(repo, message);

        const category = this.categorizeStartupError(
          error instanceof Error ? error : new Error(message)
        );
        const suggestions = this.getStartupErrorSolutions(category, repo);
        this.logger.errorWithDetails(
          `Startup failed for ${repo}`,
          [`Error category: ${category}`],
          suggestions
        );
      } finally {
        completed++;
        this.logger.info(
          `Startup Progress: ${completed}/${repos.length} - ${processes.length} started, ${failedServices.length} failed`
        );
      }
    };

    await this.runWithConcurrency(
      repos,
      worker,
      concurrency,
      timeoutMs,
      signal
    );

    // Summary
    this.logger.info("Startup Summary");
    if (processes.length) {
      this.logger.success(
        `✅ Successfully started ${processes.length} services`
      );
      this.logger.info(
        `📋 Running services: ${processes.map((p) => p.name).join(", ")}`
      );
    }
    if (failedServices.length) {
      this.logger.error(`❌ Failed to start ${failedServices.length} services`);
      this.logger.info(`📋 Failed services: ${failedServices.join(", ")}`);
    }

    return { processes, failedServices };
  }

  private categorizeStartupError(error: Error): string {
    const m = error.message.toLowerCase();
    if (
      m.includes("port") ||
      m.includes("address already in use") ||
      m.includes("eaddrinuse")
    )
      return "PORT_CONFLICT";
    if (m.includes("permission") || m.includes("eacces"))
      return "PERMISSION_ERROR";
    if (m.includes("enoent") || m.includes("not found"))
      return "COMMAND_NOT_FOUND";
    if (m.includes("dependency") || m.includes("module"))
      return "DEPENDENCY_ERROR";
    if (m.includes("configuration") || m.includes("config"))
      return "CONFIGURATION_ERROR";
    if (m.includes("timeout") || m.includes("connection"))
      return "CONNECTION_ERROR";
    if (m.includes("syntax") || m.includes("parse")) return "SYNTAX_ERROR";
    return "UNKNOWN_ERROR";
  }

  private getStartupErrorSolutions(
    errorCategory: string,
    serviceName: string
  ): string[] {
    const s: string[] = [];
    switch (errorCategory) {
      case "PORT_CONFLICT":
        s.push("Check if another service is using the same port");
        s.push("Configure a different port in the service configuration");
        s.push("Stop conflicting services: lsof -ti:PORT | xargs kill");
        break;
      case "PERMISSION_ERROR":
        s.push("Check file permissions in the project directory");
        s.push("Run with elevated permissions if required");
        s.push("Verify service configuration files are readable");
        break;
      case "COMMAND_NOT_FOUND":
        s.push("Verify the startup command is correctly configured");
        s.push("Check if required binaries are installed and in PATH");
        s.push("Review the service configuration for typos");
        break;
      case "DEPENDENCY_ERROR":
        s.push("Reinstall dependencies: npm install or yarn install");
        s.push("Check for missing peer dependencies");
        s.push("Verify package.json and lockfile integrity");
        break;
      case "CONFIGURATION_ERROR":
        s.push("Review service configuration files");
        s.push("Check environment variables and .env files");
        s.push("Verify configuration syntax and required fields");
        break;
      case "CONNECTION_ERROR":
        s.push("Check if required services (database, API) are running");
        s.push("Verify network connectivity and firewall settings");
        s.push("Check service URLs and connection strings");
        break;
      case "SYNTAX_ERROR":
        s.push("Check source code for syntax errors");
        s.push("Verify configuration file syntax");
        s.push("Run linter to identify issues");
        break;
      default:
        s.push("Check service logs for detailed error information");
        s.push("Verify all dependencies are properly installed");
        s.push("Try running the service manually to debug");
    }
    return s;
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Process start primitives
  // ────────────────────────────────────────────────────────────────────────────────

  private getExecutionConfig(repo: string): {
    mode: "local" | "docker";
    installCommand?: string;
    startupCommand?: string;
    source: "repo" | "global";
  } {
    const repoConfig = this.config
      .getRepoConfigs()
      .find((rc) => rc.repo === repo);
    if (repoConfig) {
      return {
        mode: repoConfig.mode,
        installCommand:
          repoConfig.installCommand || this.config.getGlobalInstallCommand(),
        startupCommand:
          repoConfig.startupCommand || this.config.getGlobalStartupCommand(),
        source: "repo",
      };
    }

    const globalMode = this.config.getGlobalMode();
    return {
      mode:
        globalMode === "hybrid"
          ? "local"
          : globalMode === "local"
          ? "local"
          : "docker",
      installCommand: this.config.getGlobalInstallCommand(),
      startupCommand: this.config.getGlobalStartupCommand(),
      source: "global",
    };
  }

  async startService(options: ServiceStartOptions): Promise<ProcItem> {
    const { name, command, args, cwd, env } = options;

    // Detect framework (informational)
    const fw = await this.frameworkDetector.detectFramework(cwd);
    if (fw) {
      this.logger.info(`   🔍 Detected ${fw.framework} (${fw.type})`);
      if (fw.version) this.logger.info(`   📦 Version: ${fw.version}`);
    }

    // Frontend apps run in a dedicated terminal to keep dev UX.
    if (fw?.type === "frontend") {
      return this.startFrontendInTerminal(name, fw, cwd, command, env);
    }

    // Otherwise, start as a managed child process with unified stream.
    const [cmd, ...arg] = command.split(" ").filter((a) => a.trim() !== "");
    return this.startGenericService(name, cmd, arg, cwd, env);
  }

  private async startGenericService(
    name: string,
    command: string,
    args: string[],
    cwd: string,
    env?: NodeJS.ProcessEnv
  ): Promise<ProcItem> {
    // Validate npm scripts if applicable.
    const packageJsonPath = path.join(cwd, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        );
        if (command === "npm" && args[0] === "run" && args[1]) {
          const scriptName = args[1];
          if (!packageJson.scripts?.[scriptName]) {
            throw new HybridError(
              `Script "${scriptName}" not found in package.json for ${name}`,
              "CONFIGURATION_ERROR",
              name
            );
          }
        }
      } catch (e) {
        // Surface JSON parse/config issues clearly
        throw new HybridError(
          `Invalid package.json in ${name}: ${(e as Error).message}`,
          "CONFIGURATION_ERROR",
          name
        );
      }
    }

    this.logger.info(`   🔧 Executing: ${command} ${args.join(" ")} in ${cwd}`);

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: process.platform === "win32",
      cwd,
      env: env || process.env,
    });

    const stream = new PassThrough();
    child.stdout?.pipe(stream, { end: false });
    child.stderr?.pipe(stream, { end: false });
    stream.setEncoding("utf8");

    // Lightweight real-time issue hints for the web UI.
    if (this.config.isWebLoggingEnabled()) {
      stream.on("data", (buf: Buffer) => {
        const msg = buf.toString();
        const lower = msg.toLowerCase();

        if (
          lower.includes("port") &&
          (lower.includes("already in use") ||
            lower.includes("eaddrinuse") ||
            lower.includes("address already in use"))
        ) {
          const note = `Port conflict detected for ${name}: ${msg.trim()}`;
          this.logger.warning(note);
          this.logBuffer?.addSystemMessage(note, "warn");
        }

        if (
          lower.includes("error") ||
          lower.includes("failed") ||
          lower.includes("cannot") ||
          lower.includes("unable")
        ) {
          const note = `Startup issue for ${name}: ${msg.trim()}`;
          this.logBuffer?.addSystemMessage(note, "error");
        }
      });
    }

    // Join both streams on close.
    let open = 0;
    const closeOne = () => {
      if (--open === 0) stream.end();
    };
    if (child.stdout) {
      open++;
      child.stdout.on("close", closeOne);
    }
    if (child.stderr) {
      open++;
      child.stderr.on("close", closeOne);
    }

    // Process lifecycle hooks.
    child.on("error", (err) => {
      const errorMessage = `Service ${name} encountered an error: ${err.message}`;
      stream.write(`\n[${name}] process error: ${err.message}\n`);
      this.logger.error(errorMessage);
      this.logBuffer?.addSystemMessage(errorMessage, "error");
    });

    child.on("exit", (code, sig) => {
      const exitMessage = `Service ${name} exited with code ${code}`;
      stream.write(`\n[${name}] exited code=${code} sig=${sig}\n`);
      this.logger.info(exitMessage);
      this.runningServices.delete(name);
      this.logBuffer?.addSystemMessage(exitMessage, "info");
    });

    child.on("spawn", () => {
      const spawnMessage = `🚀 Process started for ${name} (PID: ${child.pid})`;
      this.logger.info(spawnMessage);
      this.logBuffer?.addSystemMessage(spawnMessage, "info");
    });

    return { name, stream, proc: child };
  }

  private async startFrontendInTerminal(
    name: string,
    frameworkInfo: FrameworkInfo | null,
    cwd: string,
    customStartupCommand?: string,
    env?: NodeJS.ProcessEnv
  ): Promise<ProcItem> {
    this.logger.info(
      `   🖥️  Starting frontend app ${name} in new terminal window`
    );

    // Resolve actual command + args
    let actualCommand = "npm run start";
    let actualArgs: string[] = [];

    if (customStartupCommand) {
      const [cmd, ...args] = customStartupCommand.split(" ");
      actualCommand = cmd;
      actualArgs = args;
    } else if (frameworkInfo?.startupCommand) {
      const [cmd, ...args] = frameworkInfo.startupCommand.split(" ");
      actualCommand = cmd;
      actualArgs = args;
    }

    let terminalCommand: string;
    let terminalArgs: string[];

    if (process.platform === "darwin") {
      // macOS
      terminalCommand = "osascript";
      terminalArgs = [
        "-e",
        `tell application "Terminal" to do script "cd '${cwd}' && ${actualCommand} ${actualArgs.join(
          " "
        )}"`,
      ];
    } else if (process.platform === "win32") {
      // Windows
      terminalCommand = "cmd";
      terminalArgs = [
        "/c",
        "start",
        "cmd",
        "/k",
        `cd /d "${cwd}" && ${actualCommand} ${actualArgs.join(" ")}`,
      ];
    } else {
      // Linux
      terminalCommand = "xterm";
      terminalArgs = [
        "-e",
        `bash -c "cd '${cwd}' && ${actualCommand} ${actualArgs.join(
          " "
        )}; exec bash"`,
      ];
    }

    const child = spawn(terminalCommand, terminalArgs, {
      stdio: "ignore",
      detached: true,
      shell: false,
      env: env || process.env,
    });

    const stream = new PassThrough();
    stream.write(
      `\n[${name}] 🖥️  Frontend app started in new terminal window\n`
    );
    stream.write(
      `[${name}] 📍 Check the new terminal window for logs and output\n`
    );
    stream.write(
      `[${name}] 🔗 The app should be accessible at the configured port\n`
    );

    child.on("error", (err) => {
      this.logger.error(`Failed to open terminal for ${name}: ${err.message}`);
      stream.write(`\n[${name}] ❌ Failed to open terminal: ${err.message}\n`);
    });

    child.on("exit", (code, sig) => {
      if (code === 0) {
        this.logger.info(`Terminal opened successfully for ${name}`);
      } else {
        this.logger.warning(
          `Terminal process exited with code ${code} for ${name}`
        );
      }
    });

    child.on("spawn", () => {
      // no-op; already logged in startGenericService pattern
    });

    return { name, stream, proc: child };
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Summaries & Metrics (stubs)
  // ────────────────────────────────────────────────────────────────────────────────

  private summarizeStartup(allRepos: string[], results: any) {
    this.logger.sectionHeader("Startup Summary");
    this.logger.info(`📊 Total services processed: ${allRepos.length}`);
    this.logger.info(`✅ Successfully started: ${results.processes.length}`);
    this.logger.info(`❌ Failed to start: ${results.failedServices.length}`);
    this.logger.info(
      `📦 Installation failures: ${results.installFailures.length}`
    );

    if (results.processes.length) {
      this.logger.success(
        `🎉 Successfully started ${results.processes.length} services`
      );
      this.logger.info(
        `📋 Running: ${results.processes
          .map((p: ProcItem) => p.name)
          .join(", ")}`
      );
    }

    if (results.failedServices.length) {
      const msg = `⚠️ Failed to start ${
        results.failedServices.length
      } services: ${results.failedServices.join(", ")}`;
      this.logger.warning(msg);
      this.logBuffer?.addSystemMessage(msg, "warn");
    }
  }

  private getProcessUptime(_pid: number): string | null {
    try {
      // TODO(ma): inject pid metrics provider to return actual uptime
      return "N/A";
    } catch {
      return null;
    }
  }

  private getProcessMemoryUsage(_pid: number): string | null {
    try {
      // TODO(ma): inject pid metrics provider to return RSS/heap
      return "N/A";
    } catch {
      return null;
    }
  }

  private getProcessCpuUsage(_pid: number): string | null {
    try {
      // TODO(ma): inject pid metrics provider to return CPU%
      return "N/A";
    } catch {
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Concurrency helpers
  // ────────────────────────────────────────────────────────────────────────────────

  private async runWithConcurrency<T>(
    items: T[],
    worker: (item: T, index: number) => Promise<void>,
    concurrency: number,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<void> {
    if (!items.length) return;
    const max = Math.max(1, concurrency || 1);
    let nextIndex = 0;
    const runNext = async (): Promise<void> => {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      const current = nextIndex++;
      if (current >= items.length) return;
      const item = items[current];
      await this.runMaybeTimed(() => worker(item, current), timeoutMs, signal);
      return runNext();
    };
    const runners = Array.from({ length: Math.min(max, items.length) }, () =>
      runNext()
    );
    await Promise.all(runners);
  }

  private async runMaybeTimed<T>(
    fn: () => Promise<T>,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<T> {
    if (!timeoutMs && !signal) return fn();

    return new Promise<T>((resolve, reject) => {
      let finished = false;
      let timer: NodeJS.Timeout | undefined;

      const onAbort = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        reject(new Error("Operation aborted"));
      };

      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
      }

      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          if (finished) return;
          finished = true;
          if (signal) signal.removeEventListener("abort", onAbort);
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      fn()
        .then((res) => {
          if (finished) return;
          finished = true;
          if (timer) clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", onAbort);
          resolve(res);
        })
        .catch((err) => {
          if (finished) return;
          finished = true;
          if (timer) clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", onAbort);
          reject(err);
        });
    });
  }
}
