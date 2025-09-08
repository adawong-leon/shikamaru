#!/usr/bin/env node

/**
 * shikamaru CLI - Production Entry Point
 *
 * This is the executable entry point for the shikamaru-cli package.
 * It handles Node.js version checking, error handling, and proper execution.
 */

import { spawn } from "child_process";
import path from "path";

// Version requirements
const MIN_NODE_VERSION = "16.0.0";
const MIN_NPM_VERSION = "8.0.0";

/**
 * Check if Node.js version meets minimum requirements
 */
function checkNodeVersion(): void {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0]);
  const minor = parseInt(version.slice(1).split(".")[1]);

  const [minMajor, minMinor] = MIN_NODE_VERSION.split(".").map(Number);

  if (major < minMajor || (major === minMajor && minor < minMinor)) {
    console.error(
      `❌ Node.js ${MIN_NODE_VERSION} or higher is required. Current version: ${version}`
    );
    console.error(`Please update Node.js: https://nodejs.org/`);
    process.exit(1);
  }
}

/**
 * Handle process signals for graceful shutdown
 */
function setupProcessHandlers(): void {
  // Only set up basic signal handlers if we're not in a mode that needs custom cleanup
  // The hybrid and docker modes will set up their own cleanup handlers
  if (!process.argv.includes("start")) {
    const cleanup = () => {
      console.log("\n🛑 Shutting down gracefully...");
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGHUP", cleanup);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    // Check Node.js version
    checkNodeVersion();

    // Setup process handlers
    setupProcessHandlers();

    // Path to the main entry point (relative to this bin file)
    const mainEntryPath = path.join(__dirname, "..", "index.js");

    // Execute the main entry point with all arguments passed to this script
    const child = spawn("node", [mainEntryPath, ...process.argv.slice(2)], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: {
        ...process.env,
        shikamaru_CLI_BIN: "true", // Flag to indicate we're running from bin
      },
    });

    // Forward the exit code
    child.on("close", (code) => {
      process.exit(code || 0);
    });

    // Handle spawn errors
    child.on("error", (error) => {
      console.error("❌ Failed to start shikamaru CLI:", error.message);
      console.error("Please ensure the package is properly installed.");
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Fatal error in shikamaru CLI:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
