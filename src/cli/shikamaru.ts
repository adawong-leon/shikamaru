// Main CLI Class

import chalk from "chalk";
import { Logger } from "./logger/Logger";
import { ArgumentParser } from "./parsers/ArgumentParser";
import { StartCommand } from "./commands/StartCommand";
import { HelpCommand } from "./commands/HelpCommand";
import { VersionCommand } from "./commands/VersionCommand";
import { ProfileCommand } from "./commands/ProfileCommand";
import { CliError } from "./errors/CliError";
import { GlobalConfig } from "./config/GlobalConfig";
import type { CliConfig, ParsedArgs } from "./types";

export class Shikamaru {
  private logger: Logger;
  private config: CliConfig;

  constructor(config: CliConfig) {
    this.config = config;
    this.logger = new Logger(config.verbose);
  }

  async run(): Promise<void> {
    try {
      // Parse command line arguments
      const { command, options } = ArgumentParser.parse();

      // Validate command
      if (!ArgumentParser.validateCommand(command)) {
        throw new CliError(`Unknown command: ${command}`, "UNKNOWN_COMMAND", [
          "Use 'shikamaru help' for usage information",
        ]);
      }

      // Merge options with defaults, prioritizing command-line arguments
      const defaultOptions = ArgumentParser.getDefaultOptions();
      const mergedOptions = {
        ...defaultOptions,
        ...options,
      };
      console.log("projectsDir", options.projectsDir);

      // Ensure projectsDir is properly resolved from arguments, env, or defaults
      if (options.projectsDir) {
        console.log("projectsDir", options.projectsDir);
        mergedOptions.projectsDir = options.projectsDir;
      } else if (process.env.PROJECTS_DIR) {
        mergedOptions.projectsDir = process.env.PROJECTS_DIR;
      } else {
        mergedOptions.projectsDir = defaultOptions.projectsDir;
      }

      this.config = { ...this.config, ...mergedOptions };
      this.logger.setVerbose(this.config.verbose);

      // Set global config for access from other modules
      GlobalConfig.getInstance().setConfig(this.config);

      // Execute command
      await this.executeCommand(command);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async executeCommand(command: string): Promise<void> {
    switch (command) {
      case "start":
        const startCommand = new StartCommand(this.logger, this.config);
        await startCommand.execute();
        break;

      case "help":
        HelpCommand.execute();
        break;

      case "version":
        VersionCommand.execute();
        break;

      case "profile":
        const profileCommand = new ProfileCommand(this.logger, this.config);
        await profileCommand.execute();
        break;

      default:
        throw new CliError(`Unknown command: ${command}`, "UNKNOWN_COMMAND", [
          "Use 'shikamaru help' for usage information",
        ]);
    }
  }

  private handleError(error: any): void {
    if (error instanceof CliError) {
      this.logger.error(error.message);
      if (error.suggestions && error.suggestions.length > 0) {
        this.logger.info("Suggestions:");
        error.suggestions.forEach((suggestion) => {
          console.log(chalk.gray(`  • ${suggestion}`));
        });
      }
    } else {
      this.logger.error("An unexpected error occurred", error as Error);
    }

    process.exit(1);
  }

  // Public methods for external use
  getLogger(): Logger {
    return this.logger;
  }

  getConfig(): CliConfig {
    return this.config;
  }

  setConfig(config: Partial<CliConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.setVerbose(this.config.verbose);
  }
}
