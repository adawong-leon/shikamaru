// Argument Parser

import type { ParsedArgs, CliOptions } from "../types";

export class ArgumentParser {
  static parse(): ParsedArgs {
    const args = process.argv.slice(2);
    const command = args[0] || "start";
    const options: CliOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case "-v":
        case "--verbose":
          options.verbose = true;
          break;

        // removed: --dry-run, --force

        case "--skip-cloud":
          options.skipCloud = true;
          break;

        case "--skip-azure":
          options.skipCloud = true;
          console.warn(
            "⚠️ --skip-azure is deprecated, use --skip-cloud instead"
          );
          break;

        case "--projects-dir":
          if (i + 1 < args.length) {
            options.projectsDir = args[++i];
          } else {
            throw new Error("--projects-dir requires a path argument");
          }
          break;

        case "-p":
        case "--profile":
          if (i + 1 < args.length) {
            options.profile = args[++i];
          } else {
            throw new Error("--profile requires a profile name argument");
          }
          break;

        case "--help":
        case "-h":
          return { command: "help", options: {} };

        case "--version":
        case "-V":
          return { command: "version", options: {} };

        default:
          if (arg.startsWith("-")) {
            throw new Error(`Unknown option: ${arg}`);
          }
          break;
      }
    }

    return { command, options };
  }

  static validateCommand(command: string): boolean {
    const validCommands = ["start", "help", "version", "profile"];
    return validCommands.includes(command);
  }

  static getDefaultOptions(): CliOptions {
    // Default to current working directory, can be overridden by env or CLI option
    const projectsDir = process.env.PROJECTS_DIR || process.cwd();

    return {
      verbose: false,
      skipCloud: false,
      projectsDir,
    };
  }

  static parseProjectsDir(args: string[]): string | undefined {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--projects-dir" && i + 1 < args.length) {
        return args[i + 1];
      }
    }
    return undefined;
  }
}
