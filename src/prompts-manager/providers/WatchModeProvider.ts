import chalk from "chalk";
import path from "path";
import {
  WatchMode,
  WatchModeOption,
  RepoSelection,
  WatchModeConfig,
  RepoExecutionConfig,
} from "../types";
import { PromptsError } from "../errors/PromptsError";
import { RepoClassifier } from "../../env-manager/classifiers/RepoClassifier";

export class WatchModeProvider {
  private repoClassifier: RepoClassifier;
  private classificationCache: Map<string, string> = new Map();

  constructor() {
    this.repoClassifier = RepoClassifier.getInstance();
  }

  private async getStartCommand(
    repo: string,
    projectsDir: string
  ): Promise<string> {
    // Check cache first
    const cacheKey = `${projectsDir}:${repo}`;
    if (this.classificationCache.has(cacheKey)) {
      return this.classificationCache.get(cacheKey)!;
    }

    try {
      const repoPath = path.join(projectsDir, repo);
      const classification = await this.repoClassifier.classify(repoPath);

      // Determine command based on classification
      const command =
        classification.type === "front" ? "npm run start" : "npm run start:dev";

      // Cache the result
      this.classificationCache.set(cacheKey, command);

      return command;
    } catch (error) {
      // Fallback to start:dev if classification fails
      const fallbackCommand = "npm run start:dev";
      this.classificationCache.set(cacheKey, fallbackCommand);
      return fallbackCommand;
    }
  }

  /**
   * Clear the classification cache
   * Useful when repositories might have changed or for testing
   */
  clearClassificationCache(): void {
    this.classificationCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.classificationCache.size,
      keys: Array.from(this.classificationCache.keys()),
    };
  }

  /**
   * Check if a repository is an Angular app by looking for Angular-specific files
   */
  private async isAngularApp(repoPath: string): Promise<boolean> {
    try {
      const fs = await import("fs");
      const path = await import("path");

      // Check for Angular CLI configuration file
      const angularJsonPath = path.join(repoPath, "angular.json");
      if (fs.existsSync(angularJsonPath)) {
        return true;
      }

      // Check for Angular dependencies in package.json
      const packageJsonPath = path.join(repoPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );
        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        // Check for Angular core packages
        const angularPackages = [
          "@angular/core",
          "@angular/common",
          "@angular/platform-browser",
          "@angular/platform-browser-dynamic",
          "@angular/compiler",
          "@angular/compiler-cli",
          "@angular/cli",
        ];

        return angularPackages.some((pkg) => dependencies[pkg]);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Pre-classify multiple repositories in batch
   * This is more efficient than classifying them one by one
   */
  async preClassifyRepos(repos: string[], projectsDir: string): Promise<void> {
    const classificationPromises = repos.map(async (repo) => {
      const cacheKey = `${projectsDir}:${repo}`;
      if (!this.classificationCache.has(cacheKey)) {
        try {
          const repoPath = path.join(projectsDir, repo);
          const classification = await this.repoClassifier.classify(repoPath);

          // Check if it's an Angular app
          const isAngularApp = await this.isAngularApp(repoPath);

          // Determine command based on classification and app type
          let command: string;
          if (classification.type === "front") {
            command = "npm run start";
          } else {
            command = "npm run start:dev";
          }

          this.classificationCache.set(cacheKey, command);
        } catch (error) {
          // Cache fallback command
          this.classificationCache.set(cacheKey, "npm run start:dev");
        }
      }
    });

    await Promise.all(classificationPromises);
  }

  async promptForWatchMode(
    selectedRepos: RepoSelection,
    projectsDir?: string
  ): Promise<WatchModeConfig> {
    try {
      const inquirer = await import("inquirer");
      const options = this.getWatchModeOptions(selectedRepos);

      // First, prompt for the overall watch mode
      const { watchMode } = await inquirer.default.prompt<{
        watchMode: WatchMode;
      }>([
        {
          type: "list",
          name: "watchMode",
          message: "Select watch mode:",
          choices: options.map((option) => ({
            name: this.formatWatchModeOption(option),
            value: option.value,
          })),
          default: options.find((opt) => opt.recommended)?.value || "local",
        },
      ]);

      // Validate the selected mode
      if (!this.validateWatchMode(watchMode, selectedRepos)) {
        throw PromptsError.fromWatchModeError(watchMode, selectedRepos);
      }

      // Generate the execution configuration based on the selected mode
      const config = await this.generateExecutionConfig(
        watchMode,
        selectedRepos,
        projectsDir
      );

      // If it's hybrid mode, let the user choose which repos run in watch mode
      if (watchMode === "hybrid") {
        await this.promptForRepoDistribution(
          config,
          selectedRepos,
          projectsDir
        );
      }

      return config;
    } catch (error) {
      if (error instanceof PromptsError) {
        throw error;
      }
      throw PromptsError.fromPromptError(error, "watch mode");
    }
  }

  private async generateExecutionConfig(
    watchMode: WatchMode,
    selectedRepos: RepoSelection,
    projectsDir?: string
  ): Promise<WatchModeConfig> {
    const executionConfigs: RepoExecutionConfig[] = [];

    // Pre-classify all repositories for better performance
    if (projectsDir) {
      await this.preClassifyRepos(selectedRepos, projectsDir);
    }

    switch (watchMode) {
      case "local":
        // All repos run locally with appropriate start command based on repo type
        for (const repo of selectedRepos) {
          const command = projectsDir
            ? await this.getStartCommand(repo, projectsDir)
            : "npm run start:dev";

          executionConfigs.push({
            repo,
            mode: "local",
            command: command as "npm run start" | "npm run start:dev",
            port: this.suggestPort(repo),
          });
        }
        return {
          mode: "local",
          localRepos: selectedRepos,
          watchRepos: [],
          executionConfigs,
        };

      case "docker":
        // All repos run in Docker
        selectedRepos.forEach((repo: string) => {
          executionConfigs.push({
            repo,
            mode: "docker",
            command: "docker-compose up",
            port: this.suggestPort(repo),
          });
        });
        return {
          mode: "docker",
          localRepos: [],
          dockerRepos: selectedRepos,
          executionConfigs,
        };

      case "hybrid":
        // Default hybrid distribution - can be customized by user
        const localRepos: string[] = [];
        const watchRepos: string[] = [];
        if (selectedRepos.length > 1) {
          localRepos.push(...selectedRepos.slice(1));
          watchRepos.push(selectedRepos[0]);

          for (const repo of localRepos) {
            const command = projectsDir
              ? await this.getStartCommand(repo, projectsDir)
              : "npm run start";

            executionConfigs.push({
              repo,
              mode: "local",
              command: command as "npm run start" | "npm run start:dev",
              port: this.suggestPort(repo),
            });
          }

          for (const repo of watchRepos) {
            const command = projectsDir
              ? await this.getStartCommand(repo, projectsDir)
              : "npm run start:dev";

            executionConfigs.push({
              repo,
              mode: "local",
              command: command as "npm run start" | "npm run start:dev",
              port: this.suggestPort(repo),
            });
          }
        } else {
          watchRepos.push(selectedRepos[0]);
          const command = projectsDir
            ? await this.getStartCommand(selectedRepos[0], projectsDir)
            : "npm run start:dev";

          executionConfigs.push({
            repo: selectedRepos[0],
            mode: "local",
            command: command as "npm run start" | "npm run start:dev",
            port: this.suggestPort(selectedRepos[0]),
          });
        }

        return {
          mode: "hybrid",
          localRepos,
          watchRepos,
          executionConfigs,
        };

      default:
        throw new PromptsError(
          `Invalid watch mode: ${watchMode}`,
          null,
          "INVALID_WATCH_MODE"
        );
    }
  }

  private async promptForRepoDistribution(
    config: WatchModeConfig,
    selectedRepos: RepoSelection,
    projectsDir?: string
  ): Promise<void> {
    const inquirer = await import("inquirer");

    // Pre-classify repositories for better performance
    if (projectsDir) {
      await this.preClassifyRepos(selectedRepos, projectsDir);
    }

    console.log(chalk.blue("\n📋 Repository Distribution"));
    console.log(
      chalk.gray("Choose which repositories will run in watch mode:")
    );

    const { repoDistribution } = await inquirer.default.prompt<{
      repoDistribution: string[];
    }>([
      {
        type: "checkbox",
        name: "repoDistribution",
        message: "Select repositories to run locally (with npm run start:dev):",
        choices: selectedRepos.map((repo: string) => ({
          name: `${repo} (${this.getRepoType(repo)})`,
          value: repo,
          checked: config.localRepos.includes(repo),
        })),
        pageSize: 10,
      },
    ]);

    // Update the configuration based on user selection
    config.watchRepos = repoDistribution;
    config.localRepos = selectedRepos.filter(
      (repo: string) => !repoDistribution.includes(repo)
    );

    // Update execution configs
    config.executionConfigs = [];

    for (const repo of config.localRepos) {
      const command = projectsDir
        ? await this.getStartCommand(repo, projectsDir)
        : "npm run start";

      config.executionConfigs.push({
        repo,
        mode: "local",
        command: command as "npm run start" | "npm run start:dev",
        port: this.suggestPort(repo),
      });
    }

    for (const repo of config.watchRepos) {
      const command = projectsDir
        ? await this.getStartCommand(repo, projectsDir)
        : "npm run start:dev";

      config.executionConfigs.push({
        repo,
        mode: "local",
        command: command as "npm run start" | "npm run start:dev",
        port: this.suggestPort(repo),
      });
    }
  }

  private getRepoType(repo: string): string {
    if (
      repo.toLowerCase().includes("frontend") ||
      repo.toLowerCase().includes("ui")
    ) {
      return "Frontend";
    } else if (
      repo.toLowerCase().includes("api") ||
      repo.toLowerCase().includes("backend")
    ) {
      return "Backend";
    } else if (
      repo.toLowerCase().includes("database") ||
      repo.toLowerCase().includes("db")
    ) {
      return "Database";
    } else if (repo.toLowerCase().includes("service")) {
      return "Service";
    }
    return "App";
  }

  private suggestPort(repo: string): number {
    // Simple port suggestion based on repo name
    const basePort = 3000;
    const hash = repo.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return basePort + (Math.abs(hash) % 1000);
  }

  getWatchModeOptions(selectedRepos: RepoSelection): WatchModeOption[] {
    const repoCount = selectedRepos.length;
    const hasDockerFiles = this.hasDockerFiles(selectedRepos);
    const hasPackageJson = this.hasPackageJson(selectedRepos);

    const options: WatchModeOption[] = [
      {
        name: "Local Development",
        value: "local",
        description: "Run services locally with direct file system access",
        recommended: repoCount <= 3 && hasPackageJson,
      },
      {
        name: "Docker Containers",
        value: "docker",
        description: "Run services in isolated Docker containers",
        recommended: repoCount > 3 || hasDockerFiles,
      },
      {
        name: "Hybrid Mode",
        value: "hybrid",
        description: "Mix of local and Docker services based on configuration",
        recommended: repoCount > 5 && hasDockerFiles && hasPackageJson,
      },
    ];

    // Adjust recommendations based on repo analysis
    this.adjustRecommendations(options, selectedRepos);

    return options;
  }

  validateWatchMode(mode: WatchMode, selectedRepos: RepoSelection): boolean {
    const validModes: WatchMode[] = ["local", "docker", "hybrid"];

    if (!validModes.includes(mode)) {
      return false;
    }

    // Additional validation based on mode and repos
    switch (mode) {
      case "local":
        return this.validateLocalMode(selectedRepos);
      case "docker":
        return this.validateDockerMode(selectedRepos);
      case "hybrid":
        return this.validateHybridMode(selectedRepos);
      default:
        return false;
    }
  }

  private formatWatchModeOption(option: WatchModeOption): string {
    const baseName = option.name;
    const description = option.description;
    const recommended = option.recommended ? chalk.green("★ Recommended") : "";

    if (recommended) {
      return `${baseName} ${recommended}\n  ${chalk.gray(description)}`;
    }

    return `${baseName}\n  ${chalk.gray(description)}`;
  }

  private adjustRecommendations(
    options: WatchModeOption[],
    selectedRepos: RepoSelection
  ): void {
    const repoCount = selectedRepos.length;
    const hasDockerFiles = this.hasDockerFiles(selectedRepos);
    const hasPackageJson = this.hasPackageJson(selectedRepos);
    const hasComplexDeps = this.hasComplexDependencies(selectedRepos);

    // Clear existing recommendations
    options.forEach((opt) => (opt.recommended = false));

    // Set recommendations based on analysis
    if (repoCount <= 2 && hasPackageJson && !hasDockerFiles) {
      options.find((opt) => opt.value === "local")!.recommended = true;
    } else if (repoCount >= 5 || hasComplexDeps) {
      options.find((opt) => opt.value === "docker")!.recommended = true;
    } else if (
      repoCount > 2 &&
      repoCount < 5 &&
      (hasDockerFiles || hasComplexDeps)
    ) {
      options.find((opt) => opt.value === "hybrid")!.recommended = true;
    } else {
      // Default recommendation
      options.find((opt) => opt.value === "local")!.recommended = true;
    }
  }

  private hasDockerFiles(repos: RepoSelection): boolean {
    // This would need to be implemented with actual file system checks
    // For now, we'll use a simple heuristic
    return repos.some(
      (repo: string) =>
        repo.toLowerCase().includes("docker") ||
        repo.toLowerCase().includes("container") ||
        repo.toLowerCase().includes("microservice")
    );
  }

  private hasPackageJson(repos: RepoSelection): boolean {
    // This would need to be implemented with actual file system checks
    // For now, we'll use a simple heuristic
    return repos.some(
      (repo: string) =>
        repo.toLowerCase().includes("node") ||
        repo.toLowerCase().includes("js") ||
        repo.toLowerCase().includes("ts") ||
        repo.toLowerCase().includes("react") ||
        repo.toLowerCase().includes("vue") ||
        repo.toLowerCase().includes("angular")
    );
  }

  private hasComplexDependencies(repos: RepoSelection): boolean {
    // This would need to be implemented with actual dependency analysis
    // For now, we'll use a simple heuristic based on repo names
    const complexKeywords = [
      "database",
      "db",
      "redis",
      "postgres",
      "mysql",
      "mongodb",
      "queue",
      "kafka",
      "rabbitmq",
      "elasticsearch",
      "kibana",
      "monitoring",
      "logging",
      "metrics",
      "tracing",
      "auth",
      "authentication",
      "authorization",
      "api",
      "gateway",
      "service",
      "microservice",
    ];

    return repos.some((repo: string) =>
      complexKeywords.some((keyword) => repo.toLowerCase().includes(keyword))
    );
  }

  private validateLocalMode(selectedRepos: RepoSelection): boolean {
    // Local mode is generally valid for any selection
    // but we might want to warn about large numbers
    return selectedRepos.length <= 10;
  }

  private validateDockerMode(selectedRepos: RepoSelection): boolean {
    // Docker mode is valid for any selection
    return true;
  }

  private validateHybridMode(selectedRepos: RepoSelection): boolean {
    return selectedRepos.length >= 1;
  }

  // Method to get watch mode description
  getWatchModeDescription(mode: WatchMode): string {
    const descriptions: Record<WatchMode, string> = {
      local:
        "Services run directly on your local machine with file system access",
      docker: "Services run in isolated Docker containers for consistency",
      hybrid: "Mix of local and containerized services based on configuration",
    };

    return descriptions[mode] || "Unknown watch mode";
  }

  // Method to get watch mode requirements
  getWatchModeRequirements(mode: WatchMode): string[] {
    const requirements: Record<WatchMode, string[]> = {
      local: [
        "Node.js installed locally",
        "Direct file system access",
        "Port availability on localhost",
      ],
      docker: [
        "Docker installed and running",
        "Docker Compose (for multi-service setups)",
        "Sufficient system resources",
      ],
      hybrid: [
        "Both local and Docker environments",
        "Configuration for service distribution",
        "Port management across environments",
      ],
    };

    return requirements[mode] || [];
  }
}
