/**
 * shikamaru CLI - Module Exports
 *
 * This file exports all public APIs from the CLI module.
 */

import { Shikamaru } from "./shikamaru";

// Main CLI class
export { Shikamaru } from "./shikamaru";
// Types and interfaces
export type {
  CliConfig,
  CliOptions,
  ParsedArgs,
  ValidationResult,
  ServiceStatus,
  LogLevelType,
  Repo,
  WatchMode,
  PortsMap,
} from "./types";

// Error handling
export { CliError } from "./errors/CliError";

// Logging
export { Logger } from "./logger/Logger";

// Commands
export { StartCommand } from "./commands/StartCommand";
export { HelpCommand } from "./commands/HelpCommand";
export { VersionCommand } from "./commands/VersionCommand";

// Validators
export { EnvironmentValidator } from "./validators/EnvironmentValidator";

// Parsers
export { ArgumentParser } from "./parsers/ArgumentParser";

// Configuration
export { GlobalConfig } from "./config/GlobalConfig";

// Factory function for easy CLI creation
export function createCli(config?: Partial<import("./types").CliConfig>) {
  const defaultConfig: import("./types").CliConfig = {
    projectsDir: process.env.PROJECTS_DIR || process.cwd(),
    verbose: false,
    skipCloud: false,
    skipInstall: false,
  };

  // Merge config, prioritizing provided config over defaults
  const finalConfig = { ...defaultConfig, ...config };

  // Ensure projectsDir is properly resolved
  if (config?.projectsDir) {
    finalConfig.projectsDir = config.projectsDir;
  } else if (process.env.PROJECTS_DIR) {
    finalConfig.projectsDir = process.env.PROJECTS_DIR;
  }

  return new Shikamaru(finalConfig);
}
