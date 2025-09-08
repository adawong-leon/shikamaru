// Environment Validator

import { CliError } from "../errors/CliError";
import type { ValidationResult } from "../types";

export class EnvironmentValidator {
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  async validateEnvironment(config: {
    projectsDir: string;
  }): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Validate Node.js version
      const nodeValidation = this.validateNodeVersion();
      if (!nodeValidation.valid) {
        result.valid = false;
        result.errors.push(...nodeValidation.errors);
      }

      // Validate projects directory
      const dirValidation = await this.validateProjectsDirectory(
        config.projectsDir
      );
      if (!dirValidation.valid) {
        result.valid = false;
        result.errors.push(...dirValidation.errors);
      }

      // Validate system requirements
      const systemValidation = await this.validateSystemRequirements(
        config.projectsDir
      );
      if (!systemValidation.valid) {
        result.warnings.push(...systemValidation.warnings);
      }

      return result;
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return result;
    }
  }

  private validateNodeVersion(): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);

      if (majorVersion < 18) {
        result.valid = false;
        result.errors.push(
          `Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`
        );
      } else if (majorVersion < 20) {
        result.warnings.push(
          `Node.js version ${nodeVersion} is supported but version 20+ is recommended for better performance.`
        );
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Failed to parse Node.js version: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return result;
  }

  private async validateProjectsDirectory(
    projectsDir: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      const fs = await import("fs");
      const path = await import("path");
      const projectsPath = path.resolve(projectsDir);

      if (!fs.existsSync(projectsPath)) {
        result.valid = false;
        result.errors.push(`Projects directory not found: ${projectsPath}`);
        return result;
      }

      const stats = fs.statSync(projectsPath);
      if (!stats.isDirectory()) {
        result.valid = false;
        result.errors.push(
          `Projects directory is not a directory: ${projectsPath}`
        );
        return result;
      }

      // Check if directory is readable
      try {
        fs.accessSync(projectsPath, fs.constants.R_OK);
      } catch {
        result.valid = false;
        result.errors.push(
          `Projects directory is not readable: ${projectsPath}`
        );
        return result;
      }

      // Check for repositories with .env.example files
      const repos = await this.findRepositoriesWithEnvExample(projectsPath);
      if (repos.length === 0) {
        result.warnings.push(
          "No repositories with .env.example files found in projects directory"
        );
      } else {
        this.logger.debug(
          `Found ${repos.length} repositories with .env.example files`
        );
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(
        `Failed to validate projects directory: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return result;
  }

  private async validateSystemRequirements(
    projectsDir: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Check available memory
      const os = await import("os");
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const memoryUsagePercent =
        ((totalMemory - freeMemory) / totalMemory) * 100;

      if (memoryUsagePercent > 90) {
        result.warnings.push(
          "High memory usage detected. Consider closing other applications."
        );
      }

      // Check available disk space
      const fs = await import("fs");
      const path = await import("path");
      const projectsPath = path.resolve(projectsDir);

      try {
        const stats = fs.statSync(projectsPath);
        // Note: This is a simplified check. In production, you might want to use a more robust disk space checking library
        if (stats.size > 0) {
          // Basic check passed
        }
      } catch {
        result.warnings.push("Unable to check disk space availability");
      }

      // Check for Docker (if needed)
      try {
        const { execSync } = await import("child_process");
        execSync("docker --version", { stdio: "ignore" });
      } catch {
        result.warnings.push(
          "Docker not found. Docker mode will not be available."
        );
      }
    } catch (error) {
      result.warnings.push(
        `System validation warning: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return result;
  }

  private async findRepositoriesWithEnvExample(
    projectsPath: string
  ): Promise<string[]> {
    try {
      const fs = await import("fs");
      const path = await import("path");

      const repos: string[] = [];
      const items = fs.readdirSync(projectsPath);

      for (const item of items) {
        const itemPath = path.join(projectsPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          const envExamplePath = path.join(itemPath, ".env.example");
          if (fs.existsSync(envExamplePath)) {
            repos.push(item);
          }
        }
      }

      return repos;
    } catch (error) {
      this.logger.debug(
        `Failed to scan for repositories: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }
}
