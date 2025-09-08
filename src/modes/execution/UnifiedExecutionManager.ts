// Execution Mode Manager - Handles Local, Docker, and Hybrid execution modes

import inquirer from "inquirer";
import path from "path";
import fsSync from "fs";
import { getEnvManagerState, initEnv } from "../../env-manager/index";
import { LogViewer } from "../../log-ui/LogViewer";
import { InfraServiceManager } from "./services/InfraServiceManager";
import { AppServiceManager } from "./services/AppServiceManager";
import type { ExecutionModeResult } from "./types";
import { UnifiedConfig } from "../../config";
import type { Logger } from "../../cli/logger/Logger";
import { ProcItem } from "@/log-ui/types";
import { ProcessExpressAPI } from "../../api/express/API";
import { LogBuffer } from "./services/LogBuffer";
import { PortsMap } from "@/utils";

export class UnifiedExecutionManager {
  private static instance: UnifiedExecutionManager | null = null;
  private config: UnifiedConfig;
  private logger: Logger;
  private infraManager: InfraServiceManager;
  private appManager: AppServiceManager;
  private logViewer: LogViewer | null = null;
  private ProcessExpressAPI: ProcessExpressAPI | null = null;
  private isInitialized: boolean = false;
  private logBuffer: LogBuffer | null = null;
  private webUiUrl: string | null = null;

  private constructor(config: UnifiedConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.infraManager = new InfraServiceManager(config, logger);
    this.appManager = new AppServiceManager(config, logger);
    this.isInitialized = true;
  }
  // ==================== SINGLETON MANAGEMENT ====================

  /**
   * Get the singleton instance of UnifiedExecutionManager
   */
  public static getInstance(): UnifiedExecutionManager {
    if (!UnifiedExecutionManager.instance) {
      throw new Error(
        "UnifiedExecutionManager not initialized. Call createInstance() first."
      );
    }
    return UnifiedExecutionManager.instance;
  }

  /**
   * Create the singleton instance of UnifiedExecutionManager
   * @param config - Unified configuration
   * @param logger - Logger instance
   * @returns The singleton instance
   */
  public static createInstance(
    config: UnifiedConfig,
    logger: Logger
  ): UnifiedExecutionManager {
    if (UnifiedExecutionManager.instance) {
      throw new Error(
        "UnifiedExecutionManager already initialized. Use getInstance() to get the existing instance."
      );
    }

    UnifiedExecutionManager.instance = new UnifiedExecutionManager(
      config,
      logger
    );
    return UnifiedExecutionManager.instance;
  }

  /**
   * Check if UnifiedExecutionManager is initialized
   */
  public static isInitialized(): boolean {
    return UnifiedExecutionManager.instance !== null;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    UnifiedExecutionManager.instance = null;
  }

  /**
   * Get initialization status
   */
  public getInitializationStatus(): boolean {
    return this.isInitialized;
  }

  // ==================== EXECUTION METHODS ====================

  /**
   * Start the main execution flow for all modes (Local, Docker, Hybrid)
   */
  async startExecution(): Promise<ExecutionModeResult> {
    const repos = this.config.getRepositoryNames();
    const ports = this.config.getPortMap();

    const result: ExecutionModeResult = {
      success: false,
      startedServices: [],
      infraServices: [],
      healthCheckResults: [],
      errors: [],
      warnings: [],
    };

    try {
      // Initialize LogBuffer if web logging is enabled
      if (this.config.isWebLoggingEnabled()) {
        this.logBuffer = LogBuffer.getInstance();
        this.logBuffer.enable();
      }

      // Ensure any active progress indicators are stopped before starting
      this.logger.ensureCleanState();

      this.logger.sectionHeader("shikamaru Execution Mode");
      this.logger.info("🚀 Starting execution mode");
      this.logger.info(
        `📁 Projects directory: ${this.config.getProjectsDir()}`
      );
      this.logger.info(`🎯 Target repositories: ${repos.join(", ")}`);
      this.logger.info(
        `🔧 Port assignments: ${Object.entries(ports)
          .map(([repo, port]) => `${repo}:${port}`)
          .join(", ")}`
      );

      // Step 1: Initialize environment
      this.logger.info("Environment Initialization");

      await initEnv();
      this.logger.stopProgress(true, "Environment configuration completed");

      // Step 2: Detect required infrastructure services (for unified compose)
      this.logger.info("Infrastructure Detection");

      const infraServices = getEnvManagerState().internalServices;
      result.infraServices = Array.from(getEnvManagerState().internalServices);

      this.logger.stopProgress(true, "Infrastructure detection completed");

      if (infraServices.size > 0) {
        this.logger.info(
          `📋 Required infrastructure services: ${Array.from(
            infraServices
          ).join(", ")}`
        );
      } else {
        this.logger.info("ℹ️ No infrastructure services required");
      }

      // Step 3: Start application services (includes infrastructure in unified compose)
      this.logger.info("Application Services");

      // Convert ports format for DockerComposeManager
      this.logger.info("📡 Using provided port assignments");
      const portsAssignments: Record<
        string,
        { internal: number; host: number }
      > = this.config.getPortAssignments();

      const {
        processes: appProcesses,
        failedServices: appFailedServices,
        installFailures: appInstallFailures,
      } = await this.appManager.startApplicationServices(repos);
      result.startedServices = appProcesses.map((p: any) => p.name);

      this.logger.stopProgress(true, "Application services startup completed");

      // Check if any npm install failures occurred
      if (appInstallFailures.length > 0) {
        const installFailureMessage = `Failed to install dependencies for: ${appInstallFailures.join(
          ", "
        )}`;
        result.warnings.push(installFailureMessage);
        this.logBuffer?.addSystemMessage(installFailureMessage, "warn");

        // Handle npm install failure - strict behavior
        const shouldContinue = await this.handleServiceFailure(
          "npm install",
          appInstallFailures
        );

        if (!shouldContinue) {
          const npmErrorMessage = `NPM install failed for: ${appInstallFailures.join(
            ", "
          )}`;
          result.success = false;
          result.errors.push(npmErrorMessage);
          this.logBuffer?.addSystemMessage(npmErrorMessage, "error");
          return result;
        }
      }

      if (appProcesses.length > 0) {
        const successMessage = `✅ Successfully started ${appProcesses.length} application service(s)`;
        this.logger.success(successMessage);
        this.logBuffer?.addSystemMessage(successMessage, "info");

        const runningMessage = `📋 Running services: ${result.startedServices.join(
          ", "
        )}`;
        this.logger.info(runningMessage);
        this.logBuffer?.addSystemMessage(runningMessage, "info");
      } else {
        const noServicesMessage = "⚠️ No application services were started";
        this.logger.warning(noServicesMessage);
        this.logBuffer?.addSystemMessage(noServicesMessage, "warn");
      }

      // Check if any application services failed
      if (appFailedServices.length > 0) {
        const serviceFailureMessage = `Some application services failed: ${appFailedServices.join(
          ", "
        )}`;
        result.warnings.push(serviceFailureMessage);
        this.logBuffer?.addSystemMessage(serviceFailureMessage, "warn");

        // Handle service failure - more strict behavior
        const shouldContinue = await this.handleServiceFailure(
          "application",
          appFailedServices
        );

        if (!shouldContinue) {
          const serviceErrorMessage = `Application services failed: ${appFailedServices.join(
            ", "
          )}`;
          result.success = false;
          result.errors.push(serviceErrorMessage);
          this.logBuffer?.addSystemMessage(serviceErrorMessage, "error");
          return result;
        }
      }

      // Step 4: Start log viewer if services are running
      if (appProcesses.length > 0) {
        if (this.config.isWebLoggingEnabled()) {
          await this.startWebMonitoring(
            appProcesses,
            portsAssignments,
            this.appManager
          );
        } else {
          this.logger.info("Log Monitoring");
          await this.startTerminalLogViewer(appProcesses);
        }
      }

      // Step 5: Handle cleanup on exit
      this.setupCleanupHandlers();

      // Final success summary
      this.logger.sectionHeader("Execution Complete");
      result.success = true;
      this.logger.success("🎉 Execution completed successfully!");
      this.logger.info("📊 Services are now running and ready for development");
      this.logger.info("💡 Press Ctrl+C to stop all services");

      // Start web UI after services are running
      const mode = (process.env.NODE_ENV || "development").toLowerCase();
      this.logger.info(
        `🌐 Starting web logging (${mode}) — UI and API will be available shortly`
      );

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : String(error)
      );

      this.logger.error("❌ Execution failed", error as Error);
      throw error;
    }
  }

  /**
   * Stop all execution and cleanup resources
   */
  async stopExecution(): Promise<void> {
    this.logger.info("🛑 Stopping execution");

    try {
      // Stop log viewer
      if (this.logViewer) {
        // Note: LogViewer cleanup is handled by the process manager
        this.logViewer = null;
      }

      // Stop application services
      await this.appManager.stopApplicationServices();
    } catch (error) {
      this.logger.error("Error during execution shutdown", error as Error);
    }
  }

  // ==================== SERVICE MANAGEMENT ====================

  /**
   * Start terminal-based log viewer
   */
  private async startTerminalLogViewer(processes: any[]): Promise<void> {
    try {
      // Pass the cleanup function to LogViewer so it can handle Ctrl+C properly
      this.logViewer = new LogViewer(async () => {
        await this.stopExecution();
        process.exit(0);
      });
      await this.logViewer.stream(processes);
    } catch (error) {
      this.logger.warning("Failed to start log viewer, continuing without it");
      this.logger.debug(`Log viewer error: ${error}`);
    }
  }

  /**
   * Start web-based monitoring interface
   */
  async startWebMonitoring(
    appProcesses: any[],
    ports: Record<string, { internal: number; host: number }>,
    appManager
  ): Promise<string | undefined> {
    try {
      // Use the port from logging configuration (user was already prompted for this)
      const apiPort = this.config.getWebLoggingPort();

      if (!this.ProcessExpressAPI) {
        this.ProcessExpressAPI = new ProcessExpressAPI(
          this.logger,
          apiPort,
          this.appManager,
          appProcesses,
          new Map(
            Object.entries(ports).map(([repo, port]) => [repo, port.host])
          ),
          this.config,
          appManager
        );
      }
      const clickableUrl = await this.ProcessExpressAPI.start();
      this.webUiUrl = clickableUrl || null;

      // Start the React app after the API has bound to a port
      try {
        const actualApiPort = this.ProcessExpressAPI.getPort();
        const isDevelopment =
          (process.env.NODE_ENV || "development") === "development";
        if (isDevelopment) {
          // Allow opting into preview mode (built assets) via env flag
          const reactMode = process.env.REACT_LOG_VIEWER_MODE;
          if (reactMode === "preview") {
            await this.buildReactApp(actualApiPort);
            await this.previewReactApp(actualApiPort);
          } else {
            await this.startReactApp(actualApiPort);
          }
        } else {
          this.logger.info(
            "Production mode detected. React UI will be served from built assets at /ui."
          );
        }
      } catch (error) {
        this.logger.warning(
          `Failed to start React app automatically: ${
            (error as Error)?.message || String(error)
          }`
        );
      }
      return clickableUrl;
    } catch (error) {
      this.logger.error(
        `Failed to start web monitoring API${
          (error as Error)?.message ? ": " + (error as Error).message : ""
        }`,
        error as Error
      );
      return undefined;
    }
  }

  /**
   * Start React app for web monitoring
   */
  private async startReactApp(apiPort: number): Promise<any> {
    try {
      this.logger.info("🌐 Starting React log viewer...");

      // Update React app configuration to use the API port
      await this.updateReactConfig(apiPort);

      // Start React app in development mode
      const projectRoot = path.resolve(__dirname, "../../..");
      const reactPath = path.join(projectRoot, "src", "react-log-viewer");
      if (!fsSync.existsSync(reactPath)) {
        this.logger.warning(
          `React app directory not found at ${reactPath}. Skipping web UI startup.`
        );
        return;
      }
      const { spawn } = await import("child_process");

      // Ensure dependencies are installed (first run)
      await this.ensureReactDependencies(reactPath);

      const childEnv = this.getEnhancedChildEnv({
        VITE_BACKEND_URL: `http://localhost:${apiPort}`,
      });

      let reactProcess = spawn("npm", ["run", "dev"], {
        cwd: reactPath,
        stdio: "pipe",
        shell: true,
        env: childEnv,
      });

      reactProcess.stdout?.on("data", (data) => {
        this.logger.info(`[React] ${data.toString().trim()}`);
      });

      reactProcess.stderr?.on("data", (data) => {
        this.logger.warning(`[React] ${data.toString().trim()}`);
      });

      reactProcess.on("error", async (error) => {
        this.logger.warning(
          `Failed to start React app using npm run dev: ${
            (error as Error)?.message || String(error)
          }`
        );
        this.logger.info("⚙️ Retrying with npx vite ...");
        try {
          reactProcess = spawn("npx", ["--yes", "vite"], {
            cwd: reactPath,
            stdio: "pipe",
            shell: true,
            env: childEnv,
          });
          reactProcess.stdout?.on("data", (data) => {
            this.logger.info(`[React] ${data.toString().trim()}`);
          });
          reactProcess.stderr?.on("data", (data) => {
            this.logger.warning(`[React] ${data.toString().trim()}`);
          });
        } catch (fallbackErr) {
          this.logger.error(
            "Failed to start React app (npx vite)",
            fallbackErr as Error
          );
        }
      });

      reactProcess.on("exit", (code) => {
        if (code !== 0) {
          this.logger.warning(`React app exited with code ${code}`);
        }
      });

      this.logger.success("✅ React log viewer started successfully!");
      this.logger.info(`🌐 React app available at: http://localhost:3002`);
      this.logger.info(`🔌 Connected to API at: http://localhost:${apiPort}`);
      return reactProcess;
    } catch (error) {
      this.logger.error("Failed to start React app", error as Error);
    }
  }

  /** Build a robust env for child processes, ensuring PATH has common macOS locations */
  private getEnhancedChildEnv(
    extra: Record<string, string> = {}
  ): NodeJS.ProcessEnv {
    const pathKey = (Object.keys(process.env).find(
      (k) => k.toLowerCase() === "path"
    ) || "PATH") as keyof NodeJS.ProcessEnv;
    const currentPath = (process.env[pathKey] as string) || "";
    const commonPaths = [
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ];
    const mergedPath = Array.from(
      new Set([...currentPath.split(":"), ...commonPaths])
    )
      .filter(Boolean)
      .join(":");

    return {
      ...process.env,
      [pathKey]: mergedPath,
      ...extra,
    } as NodeJS.ProcessEnv;
  }

  /** Ensure React dependencies are installed in the app folder */
  private async ensureReactDependencies(reactPath: string): Promise<void> {
    const fs = await import("fs/promises");
    const { spawn } = await import("child_process");
    try {
      // Check for node_modules existence
      await fs.access(path.join(reactPath, "node_modules"));
      return;
    } catch {
      this.logger.info("📦 Installing React app dependencies (first run)...");
      await new Promise<void>((resolve, reject) => {
        const proc = (spawn as any)(
          "npm",
          ["install", "--no-fund", "--loglevel", "error"],
          {
            cwd: reactPath,
            stdio: "pipe",
            shell: true,
            env: this.getEnhancedChildEnv(),
          }
        );
        proc.stdout?.on("data", (data: any) => {
          this.logger.info(`[React install] ${data.toString().trim()}`);
        });
        proc.stderr?.on("data", (data: any) => {
          this.logger.warning(`[React install] ${data.toString().trim()}`);
        });
        proc.on("exit", (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`npm install failed with code ${code}`));
        });
        proc.on("error", (err: Error) => reject(err));
      });
    }
  }

  /**
   * Build React app for production, injecting backend URL at build time
   */
  private async buildReactApp(apiPort: number): Promise<void> {
    const projectRoot = path.resolve(__dirname, "../../..");
    const reactPath = path.join(projectRoot, "src", "react-log-viewer");
    const { spawn } = await import("child_process");
    this.logger.info("🏗️ Building React log viewer for production...");
    await this.updateReactConfig(apiPort);
    await this.ensureReactDependencies(reactPath);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("npm", ["run", "build"], {
        cwd: reactPath,
        stdio: "pipe",
        shell: true,
        env: this.getEnhancedChildEnv({
          VITE_BACKEND_URL: `http://localhost:${apiPort}`,
        }),
      });
      proc.stdout?.on("data", (data) => {
        this.logger.info(`[React build] ${data.toString().trim()}`);
      });
      proc.stderr?.on("data", (data) => {
        this.logger.warning(`[React build] ${data.toString().trim()}`);
      });
      proc.on("exit", (code) => {
        if (code === 0) {
          this.logger.success("✅ React build completed");
          resolve();
        } else {
          reject(new Error(`React build failed with code ${code}`));
        }
      });
      proc.on("error", (err) => reject(err));
    });
  }

  /**
   * Preview built React app locally on port 3002 (or next free), using built assets
   */
  private async previewReactApp(apiPort: number): Promise<any> {
    const projectRoot = path.resolve(__dirname, "../../..");
    const reactPath = path.join(projectRoot, "src", "react-log-viewer");
    const { spawn } = await import("child_process");
    this.logger.info("👀 Previewing React build...");
    const reactPreview = spawn(
      "npm",
      ["run", "preview", "--", "--port", "3002"],
      {
        cwd: reactPath,
        stdio: "pipe",
        shell: true,
        env: this.getEnhancedChildEnv({
          // Note: preview serves the pre-built assets; VITE_* must be set at build time
          VITE_BACKEND_URL: `http://localhost:${apiPort}`,
        }),
      }
    );
    reactPreview.stdout?.on("data", (data) => {
      this.logger.info(`[React preview] ${data.toString().trim()}`);
    });
    reactPreview.stderr?.on("data", (data) => {
      this.logger.warning(`[React preview] ${data.toString().trim()}`);
    });
    reactPreview.on("error", (error) => {
      this.logger.error("Failed to preview React app", error);
    });
    return reactPreview;
  }

  // ==================== MONITORING & STATUS ====================

  /**
   * Generate repository status table on-demand
   * This allows building UI for repositories while they're running
   */
  generateRepositoryStatusTable(repos: string[] = []): Array<{
    name: string;
    status: "healthy" | "starting" | "unhealthy" | "stopped";
    port?: number;
    pid?: number;
    memory?: string;
    cpu?: string;
    uptime?: string;
    url?: string;
    runtime?: string;
  }> {
    // Get current state from app manager
    const startedServices = this.appManager.getRunningServices();

    // For now, we'll use empty arrays for failed services and install failures
    // These would need to be tracked separately if needed
    const failedServices: string[] = [];
    const installFailures: string[] = [];
    const appProcesses: any[] = [];

    // Get infrastructure services from env manager state
    const infraServices = Array.from(getEnvManagerState().internalServices);

    // Get ports from the current configuration
    const ports = this.getCurrentPorts();

    // Generate the status table
    return this.createServicesStatusTable(
      repos,
      appProcesses,
      Array.from(startedServices.keys()).map((key) => String(key)),
      infraServices,
      failedServices,
      installFailures,
      ports,
      this.config
    );
  }

  /**
   * Display repository status table on-demand
   */
  displayRepositoryStatusTable(repos: string[] = []): void {
    const servicesStatus = this.generateRepositoryStatusTable(repos);
    this.logger.servicesStatusTable(servicesStatus);
  }

  /**
   * Get enhanced repository information for WebUI
   */
  getEnhancedRepositoryInfo(): Promise<any[]> {
    // Fallback to basic status if WebUIManager is not available
    return Promise.resolve(this.generateRepositoryStatusTable());
  }

  // ==================== CONFIGURATION MANAGEMENT ====================

  /**
   * Get current configuration
   */
  getConfig(): UnifiedConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<UnifiedConfig>): void {
    // Apply updates to the existing config using setters
    if (updates.globalMode !== undefined)
      this.config.setGlobalMode(updates.globalMode);
    if (updates.projectsDir !== undefined)
      this.config.setProjectsDir(updates.projectsDir);
    if (updates.infraComposeFile !== undefined)
      this.config.setInfraComposeFile(updates.infraComposeFile);
    if (updates.globalInstallCommand !== undefined)
      this.config.setGlobalInstallCommand(updates.globalInstallCommand);
    if (updates.globalStartupCommand !== undefined)
      this.config.setGlobalStartupCommand(updates.globalStartupCommand);
    if (updates.skipInstall !== undefined)
      this.config.setSkipInstall(updates.skipInstall);
    if (updates.skipAzure !== undefined)
      this.config.setSkipAzure(updates.skipAzure);
    if (updates.repoConfigs !== undefined)
      this.config.setRepoConfigs(updates.repoConfigs);
    if (updates.loggingConfig !== undefined)
      this.config.setLoggingConfig(updates.loggingConfig);
    if (updates.enableHealthCheck !== undefined)
      this.config.setEnableHealthCheck(updates.enableHealthCheck);
    if (updates.healthCheckTimeout !== undefined)
      this.config.setHealthCheckTimeout(updates.healthCheckTimeout);
    if (updates.enableAutoStop !== undefined)
      this.config.setEnableAutoStop(updates.enableAutoStop);
    if (updates.stopInfraOnExit !== undefined)
      this.config.setStopInfraOnExit(updates.stopInfraOnExit);
    if (updates.logLevel !== undefined)
      this.config.setLogLevel(updates.logLevel);
    if (updates.serviceConfigs !== undefined)
      this.config.setServiceConfigs(updates.serviceConfigs);
    if (updates.infraServices !== undefined)
      this.config.setInfraServices(updates.infraServices);
    if (updates.dockerComposeConfig !== undefined)
      this.config.setDockerComposeConfig(updates.dockerComposeConfig);
    if (updates.logger !== undefined) this.config.setLogger(updates.logger);

    // Update managers with new config
    this.infraManager = new InfraServiceManager(this.config, this.logger);
    this.appManager = new AppServiceManager(this.config, this.logger);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get current port assignments
   */
  private getCurrentPorts(): Record<string, number> {
    // This would need to be enhanced to get actual current ports
    // For now, return empty object - this should be enhanced based on your port management system
    return {};
  }

  /**
   * Update React app configuration to use the correct API port
   */
  private async updateReactConfig(apiPort: number): Promise<void> {
    try {
      const fs = await import("fs/promises");

      // Update vite.config.ts
      const projectRoot = path.resolve(__dirname, "../../..");
      const viteConfigPath = path.join(
        projectRoot,
        "src/react-log-viewer",
        "vite.config.ts"
      );
      if (!fsSync.existsSync(viteConfigPath)) {
        this.logger.warning(
          `Vite config not found at ${viteConfigPath}. Skipping config update.`
        );
        return;
      }
      let viteConfig = await fs.readFile(viteConfigPath, "utf-8");

      // Update the proxy target to use the user-provided port
      viteConfig = viteConfig.replace(
        /target: process\.env\.VITE_BACKEND_URL \|\| "http:\/\/localhost:\d+"/g,
        `target: process.env.VITE_BACKEND_URL || "http://localhost:${apiPort}"`
      );

      await fs.writeFile(viteConfigPath, viteConfig);

      // Update urls.ts configuration
      const urlsConfigPath = path.join(
        projectRoot,
        "src/react-log-viewer",
        "src",
        "config",
        "urls.ts"
      );
      if (!fsSync.existsSync(urlsConfigPath)) {
        this.logger.warning(
          `URLs config not found at ${urlsConfigPath}. Skipping config update.`
        );
        return;
      }
      let urlsConfig = await fs.readFile(urlsConfigPath, "utf-8");

      // Update the BASE_URL to use the user-provided port
      urlsConfig = urlsConfig.replace(
        /BASE_URL: import\.meta\.env\.VITE_BACKEND_URL \|\| "http:\/\/localhost:\d+"/g,
        `BASE_URL: import.meta.env.VITE_BACKEND_URL || "http://localhost:${apiPort}"`
      );

      // Also update the DEFAULT_URLS.development
      urlsConfig = urlsConfig.replace(
        /development: "http:\/\/localhost:\d+"/g,
        `development: "http://localhost:${apiPort}"`
      );

      await fs.writeFile(urlsConfigPath, urlsConfig);

      this.logger.debug(
        `Updated React configuration to use API port ${apiPort}`
      );
    } catch (error) {
      this.logger.warning(`Failed to update React configuration: ${error}`);
    }
  }

  /**
   * Create services status table
   */
  private createServicesStatusTable(
    repos: string[],
    appProcesses: any[],
    startedServices: string[],
    infraServices: string[],
    failedServices: string[],
    installFailures: string[],
    ports: Record<string, number>,
    unifiedConfig: Record<string, any>
  ): Array<{
    name: string;
    status: "healthy" | "starting" | "unhealthy" | "stopped";
    port?: number;
    pid?: number;
    memory?: string;
    cpu?: string;
    uptime?: string;
    url?: string;
    runtime?: string;
  }> {
    const servicesStatus: Array<{
      name: string;
      status: "healthy" | "starting" | "unhealthy" | "stopped";
      port?: number;
      pid?: number;
      memory?: string;
      cpu?: string;
      uptime?: string;
      url?: string;
      runtime?: string;
    }> = [];

    // Add application services
    repos.forEach((repo) => {
      const isStarted = startedServices.includes(repo);
      const isFailed = failedServices.includes(repo);
      const hasInstallFailure = installFailures.includes(repo);
      const port = ports[repo];

      let status: "healthy" | "starting" | "unhealthy" | "stopped";
      if (hasInstallFailure) {
        status = "stopped";
      } else if (isFailed) {
        status = "unhealthy";
      } else if (isStarted) {
        status = "healthy";
      } else {
        status = "stopped";
      }

      // Find process info if available
      const process = appProcesses.find((p) => p.name === repo);
      const pid = process?.proc?.pid;

      // Determine runtime based on unified config
      let runtime = "Local";
      if (unifiedConfig[repo]) {
        switch (unifiedConfig[repo].mode) {
          case "docker":
            runtime = "Docker";
            break;
          case "local":
            runtime = "Local";
            break;
          case "custom":
            runtime = "Custom";
            break;
          default:
            runtime = "Local";
        }
      }

      servicesStatus.push({
        name: repo,
        status,
        port,
        pid,
        memory: "N/A", // Could be enhanced with actual memory monitoring
        cpu: "N/A", // Could be enhanced with actual CPU monitoring
        uptime: "N/A", // Could be enhanced with actual uptime tracking
        url: port ? `http://localhost:${port}` : "N/A",
        runtime,
      });
    });

    // Add infrastructure services
    infraServices.forEach((service) => {
      servicesStatus.push({
        name: `${service} (infra)`,
        status: "healthy", // Assume infrastructure services are healthy if running
        port: undefined,
        pid: undefined,
        memory: "N/A",
        cpu: "N/A",
        uptime: "N/A",
        url: "N/A",
        runtime: "Docker", // Infrastructure services run in Docker
      });
    });

    return servicesStatus;
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    let hasRun = false;
    const cleanup = async () => {
      if (hasRun) return;
      hasRun = true;
      this.logger.info("\n🛑 Received shutdown signal, cleaning up...");
      try {
        await this.stopExecution();
      } catch (e) {
        this.logger.warning?.(
          `Cleanup encountered an error: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGHUP", cleanup);
  }

  /**
   * Handle service failures with user interaction
   */
  private async handleServiceFailure(
    serviceType: "infrastructure" | "application" | "npm install",
    failedServices: string[],
    error?: any
  ): Promise<boolean> {
    const serviceList = failedServices.join(", ");
    const errorDetails = error ? `\nError: ${error.message || error}` : "";

    this.logger.error(
      `❌ ${serviceType} service(s) failed: ${serviceList}${errorDetails}`
    );

    try {
      // Ensure clean state before interactive prompts
      this.logger.ensureCleanState();

      const { continueAnyway } = await inquirer.prompt<{
        continueAnyway: boolean;
      }>([
        {
          type: "confirm",
          name: "continueAnyway",
          message: `🔧 Do you want to continue anyway or quit to debug?`,
          default: false,
        },
      ]);

      if (continueAnyway) {
        this.logger.info(
          `ℹ️ Continuing despite ${serviceType} service failures`
        );
        return true;
      } else {
        this.logger.info(`🛑 Quitting due to ${serviceType} service failures`);
        return false;
      }
    } catch (error) {
      this.logger.warning("Failed to prompt for service failure, quitting");
      return false;
    }
  }

  // ==================== PUBLIC ACCESSORS ====================

  /**
   * Get running application services
   */
  getRunningAppServices(): Map<string, ProcItem> {
    return this.appManager.getRunningServices();
  }

  /**
   * Check if application service is running
   */
  isAppServiceRunning(serviceName: string): boolean {
    return this.appManager.isServiceRunning(serviceName);
  }

  /**
   * Get application service manager
   */
  getAppManager(): AppServiceManager {
    return this.appManager;
  }

  /**
   * Get infrastructure service manager
   */
  getInfraManager(): InfraServiceManager {
    return this.infraManager;
  }

  /** Get the last started Web UI URL if available */
  getWebUiUrl(): string | null {
    return this.webUiUrl;
  }
}

// Factory function for easy creation
