// Start Command

import { loadOrGeneratePorts } from "@/ports-manager";
import { UnifiedConfig } from "@/config/UnifiedConfig";

import { CliError } from "../errors/CliError";
import { EnvironmentValidator } from "../validators/EnvironmentValidator";
import { Logger } from "../logger/Logger";
import type { CliConfig, WatchMode, PortsMap } from "../types";
import { execute } from "@/modes/execution";
import { selectReposAndWatchMode } from "@/prompts-manager";

export class StartCommand {
  private logger: Logger;
  private cliConfig: CliConfig;
  private validator: EnvironmentValidator;

  constructor(logger: any, config: CliConfig) {
    this.logger = logger;
    this.cliConfig = config;
    this.validator = new EnvironmentValidator(logger);
  }

  async execute(): Promise<void> {
    try {
      this.logger.sectionHeader("shikamaru");
      this.logger.info(
        "🚀 shikamaru - Multi-repository development environment"
      );
      this.logger.debug(
        `Configuration: ${JSON.stringify(this.cliConfig, null, 2)}`
      );

      // Step 1: Validate environment
      this.logger.info("Environment Validation");
      await this.validateEnvironment();

      // Step 2: Interactive repository and mode selection
      this.logger.info("Repository Selection");
      const result = await this.selectRepositoriesAndMode();

      // Step 3: Load or generate ports (skip if using existing env files)
      if (result.unifiedConfig.getUseExistingEnvFiles()) {
        this.logger.info("Port Configuration");
        this.logger.info(
          "🔌 Using existing .env files, skipping port reuse and assignment"
        );
      } else {
        this.logger.info("Port Configuration");
        await this.configurePorts(
          result.repos,
          result.unifiedConfig.getGlobalMode(),
          result.portReusePreference
        );
      }

      // Step 4: Handle logging configuration
      this.logger.info("Logging Configuration");
      if (result.unifiedConfig.getLoggingConfig()?.mode === "web") {
        this.logger.info("🌐 Web logging interface enabled");
      } else {
        this.logger.info("💻 Terminal logging mode selected");
      }

      // Step 5: Execute services
      this.logger.info("Service Execution");
      const url = await execute();

      // Final success message
      this.logger.sectionHeader("Startup Complete");
      this.logger.success("shikamaru started successfully!");
      this.logger.info("Press Ctrl+C to stop all services");
      if (url) {
        const clickable = this.logger.asHyperlink(url);
        this.logger.info(`🌐 Web logging interface available at: ${clickable}`);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private async validateEnvironment(): Promise<void> {
    try {
      const result = await this.validator.validateEnvironment({
        projectsDir: this.cliConfig.projectsDir,
      });

      if (!result.valid) {
        this.logger.stopProgress(false, "Environment validation failed");
        this.logger.errorWithDetails(
          "Environment validation failed",
          result.errors,
          result.warnings.length > 0 ? result.warnings : undefined
        );
        throw new CliError(
          "Environment validation failed",
          "VALIDATION_ERROR",
          undefined,
          { errors: result.errors, warnings: result.warnings }
        );
      }

      // Log warnings if any
      if (result.warnings.length > 0) {
        this.logger.warningWithSuggestions(
          "Environment validation completed with warnings",
          result.warnings
        );
      }

      this.logger.stopProgress(true, "Environment validation passed");
    } catch (error) {
      this.logger.stopProgress(false, "Environment validation failed");
      throw error;
    }
  }

  private async selectRepositoriesAndMode() {
    try {
      // Ensure clean state before interactive prompts
      this.logger.ensureCleanState();

      const result = await selectReposAndWatchMode();
      this.logger.stopProgress(
        true,
        `✅ Discovered ${result.repos.length} repositories`
      );

      this.logger.info(`📋 Selected repositories: ${result.repos.join(", ")}`);

      if (result.skipCloud) {
        this.logger.info("☁️ Cloud configuration: Skipped");
      } else if (result.cloudProviders && result.cloudProviders.length > 0) {
        this.logger.info(
          `☁️ Cloud providers: ${result.cloudProviders.join(", ")}`
        );
      }

      if (result.skipInstall) {
        this.logger.info("📦 Dependency installation: Skipped");
      } else {
        this.logger.info("📦 Dependency installation: Enabled");
      }

      return result;
    } catch (error) {
      this.logger.stopProgress(false, "❌ Repository discovery failed");
      throw new CliError(
        "Failed to discover and select repositories",
        "REPOSITORY_DISCOVERY_ERROR",
        undefined,
        error
      );
    }
  }

  private async configurePorts(
    repos: string[],
    watchMode: WatchMode,
    portReusePreference?: boolean
  ): Promise<PortsMap> {
    try {
      const portsAssignments = await loadOrGeneratePorts(
        repos,
        watchMode,
        undefined,
        portReusePreference
      );
      const ports = this.convertPortsAssignments(portsAssignments);

      // Set port assignments in UnifiedConfig
      const unifiedConfig = UnifiedConfig.getInstance();
      unifiedConfig.setPortAssignments(portsAssignments);

      this.logger.stopProgress(true, "✅ Ports configured successfully");
      this.logger.debug(`Port assignments: ${JSON.stringify(ports, null, 2)}`);

      // Display port assignments in a table format
      const portData = Object.entries(ports).map(([repo, port]) => ({
        Repository: repo,
        Port: port.toString(),
        URL: `http://localhost:${port}`,
      }));

      this.logger.info("📋 Port assignments:");
      this.logger.table(portData);

      return ports;
    } catch (error) {
      this.logger.stopProgress(false, "❌ Port configuration failed");
      throw new CliError(
        "Failed to configure ports",
        "PORT_CONFIGURATION_ERROR",
        undefined,
        error
      );
    } finally {
      // Ensure progress indicator is always stopped, even if there's an unhandled error
      this.logger.ensureCleanState();
    }
  }

  private convertPortsAssignments(portsAssignments: any): PortsMap {
    const ports: PortsMap = {};
    for (const [service, assignment] of Object.entries(portsAssignments)) {
      if (
        assignment &&
        typeof assignment === "object" &&
        "host" in assignment
      ) {
        ports[service] = (assignment as any).host;
      }
    }
    return ports;
  }

  private handleError(error: any): void {
    this.logger.sectionHeader("Error Summary");

    if (error instanceof CliError) {
      this.logger.errorWithDetails(
        error.message,
        [error.code || "Unknown error code"],
        error.suggestions
      );
    } else {
      this.logger.errorWithDetails(
        "An unexpected error occurred",
        [error instanceof Error ? error.message : String(error)],
        [
          "Check your environment configuration",
          "Verify all required tools are installed",
          "Ensure you have proper permissions",
          "Review the logs for more details",
        ]
      );
    }

    process.exit(1);
  }
}
