// Env Command - generate only .env files for selected repos (local mode only)
import { Logger } from "../logger/Logger";
import type { CliConfig, PortsMap } from "../types";
import { loadOrGeneratePorts } from "@/ports-manager";
import { EnvManager } from "@/env-manager/EnvManager";
import { selectRepos } from "@/prompts-manager";

export class EnvCommand {
  private logger: Logger;
  private cliConfig: CliConfig;

  constructor(logger: Logger, config: CliConfig) {
    this.logger = logger;
    this.cliConfig = config;
  }

  async execute(): Promise<void> {
    try {
      this.logger.sectionHeader("Generate .env files");
      this.logger.info(
        "🧩 Discover repositories and select which to generate..."
      );

      const repos = await selectRepos();
      if (!repos || repos.length === 0) {
        this.logger.warning("No repositories selected.");
        return;
      }

      // Load or generate ports in local mode (non-interactive)
      this.logger.info("🔌 Loading ports map (or generating if missing)...");
      const assignments = await loadOrGeneratePorts(
        repos,
        "local",
        this.cliConfig.projectsDir,
        false
      );
      const ports = this.convertPortsAssignments(assignments);

      // Initialize EnvManager (local mode only)
      EnvManager.resetInstance();
      const envManager = EnvManager.getInstance({
        projectsDir: this.cliConfig.projectsDir,
        ports,
        skipCloud: Boolean(this.cliConfig.skipCloud),
      });

      await envManager.initialize(repos);
      await envManager.generateEnvFiles();

      if (envManager.hasErrors()) {
        const errors = envManager.getErrors();
        this.logger.errorWithDetails(
          "Environment generation completed with errors",
          errors
        );
        process.exitCode = 1;
      } else {
        this.logger.success("✅ .env generation complete");
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to generate .env files: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exit(1);
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
}
