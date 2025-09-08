#!/usr/bin/env node

/**
 * shikamaru CLI runtime.
 * Handles command parsing/routing, error handling, configuration wiring,
 * and process lifecycle for the CLI.
 */

import chalk from "chalk";
import fs from "fs";
import path from "path";
import { CliError } from "./errors/CliError";
import { Logger } from "./logger/Logger";
import { GlobalConfig } from "./config/GlobalConfig";
import type { CliConfig } from "./types";
import { Shikamaru } from "./shikamaru";

// Version and metadata
const NAME = "shikamaru";
function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    return pkg.version || process.env.npm_package_version || "unknown";
  } catch {
    return process.env.npm_package_version || "unknown";
  }
}
const VERSION = getVersion();

/** Install global process-level error handlers. */
function setupGlobalErrorHandlers(): void {
  // Handle unhandled rejections
  process.on("unhandledRejection", (reason, promise) => {
    console.error(chalk.red("❌ Unhandled Rejection at:"), promise);
    console.error(chalk.red("Reason:"), reason);
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error(chalk.red("❌ Uncaught Exception:"));
    console.error(chalk.red(error.stack || error.message));
    process.exit(1);
  });

  // Only set up basic signal handlers if we're not in a mode that needs custom cleanup
  // The hybrid and docker modes will set up their own cleanup handlers
  if (!process.argv.includes("start")) {
    // Graceful shutdown handlers for non-start commands
    process.on("SIGINT", () => {
      console.log(chalk.yellow("\n🛑 Shutting down gracefully..."));
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log(chalk.yellow("\n🛑 Received SIGTERM, shutting down..."));
      process.exit(0);
    });
  }
}

/** Build initial CLI configuration from argv and env. */
function initializeConfig(): CliConfig {
  const isVerbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");
  const skipCloud =
    process.argv.includes("--skip-cloud") ||
    process.argv.includes("--skip-azure");

  // Extract projects directory from arguments or environment
  let projectsDir = process.env.PROJECTS_DIR || process.cwd();
  const projectsDirIndex = process.argv.indexOf("--projects-dir");
  if (projectsDirIndex !== -1 && process.argv[projectsDirIndex + 1]) {
    projectsDir = process.argv[projectsDirIndex + 1];
  }

  return {
    verbose: isVerbose,
    projectsDir,
    skipCloud,
    skipInstall: false,
  };
}

/** Print a short startup banner when running via the packaged binary. */
function displayBanner(): void {
  if (process.env.shikamaru_CLI_BIN) {
    console.log(chalk.blue(`🚀 ${NAME} v${VERSION}`));
    console.log(chalk.gray("Multi-repository development environment\n"));
  }
}

/** Main CLI execution function. */
async function main(): Promise<void> {
  try {
    // Setup global error handlers
    setupGlobalErrorHandlers();

    // Display banner
    displayBanner();

    // Initialize configuration
    const config = initializeConfig();

    // Initialize global config
    GlobalConfig.getInstance().setConfig(config);

    // Create logger
    const logger = new Logger(config.verbose);

    // Create and run CLI
    const cli = new Shikamaru(config);
    await cli.run();
  } catch (error) {
    // Handle CLI errors
    if (error instanceof CliError) {
      console.error(chalk.red(`❌ ${error.message}`));
      if (error.suggestions && error.suggestions.length > 0) {
        console.error(chalk.yellow("\n💡 Suggestions:"));
        error.suggestions.forEach((suggestion) => {
          console.error(chalk.yellow(`  • ${suggestion}`));
        });
      }
      process.exit(1);
    }

    // Handle unexpected errors
    console.error(chalk.red("❌ Unexpected error:"));
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );

    if (process.env.NODE_ENV === "development") {
      console.error(chalk.red("\nStack trace:"));
      console.error(error instanceof Error ? error.stack : "");
    }

    process.exit(1);
  }
}

// Export for testing and external invocation
export { main, initializeConfig, setupGlobalErrorHandlers };
