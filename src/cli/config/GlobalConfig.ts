import type { CliConfig } from "../types";

export class GlobalConfig {
  private static instance: GlobalConfig;
  private config: CliConfig | null = null;

  private constructor() {}

  static getInstance(): GlobalConfig {
    if (!GlobalConfig.instance) {
      GlobalConfig.instance = new GlobalConfig();
    }
    return GlobalConfig.instance;
  }

  // ==================== CONFIGURATION MANAGEMENT ====================

  /**
   * Set the entire configuration
   */
  setConfig(config: CliConfig): void {
    this.config = config;
  }

  /**
   * Get the entire configuration
   */
  getConfig(): CliConfig | null {
    return this.config;
  }

  /**
   * Clear the configuration
   */
  clearConfig(): void {
    this.config = null;
  }

  // ==================== INDIVIDUAL FIELD GETTERS ====================

  /**
   * Get projects directory
   */
  getProjectsDir(): string | undefined {
    return this.config?.projectsDir;
  }

  /**
   * Get verbose flag
   */
  getVerbose(): boolean | undefined {
    return this.config?.verbose;
  }

  // removed: getDryRun, getForce

  /**
   * Get skip cloud flag
   */
  getSkipCloud(): boolean | undefined {
    return this.config?.skipCloud;
  }

  /**
   * Get skip install flag
   */
  getSkipInstall(): boolean | undefined {
    return this.config?.skipInstall;
  }

  // removed: getCloudProviders

  /**
   * Get profile name
   */
  getProfile(): string | undefined {
    return this.config?.profile;
  }

  // ==================== INDIVIDUAL FIELD SETTERS ====================

  /**
   * Set projects directory
   */
  setProjectsDir(projectsDir: string): void {
    if (this.config) {
      this.config.projectsDir = projectsDir;
    } else {
      this.config = {
        projectsDir,
        verbose: false,
        skipCloud: false,
        skipInstall: false,
      };
    }
  }

  /**
   * Set verbose flag
   */
  setVerbose(verbose: boolean): void {
    if (this.config) {
      this.config.verbose = verbose;
    } else {
      this.config = {
        projectsDir: "",
        verbose,
        skipCloud: false,
        skipInstall: false,
      };
    }
  }

  // removed: setDryRun, setForce

  /**
   * Set skip cloud flag
   */
  setSkipCloud(skipCloud: boolean): void {
    if (this.config) {
      this.config.skipCloud = skipCloud;
    } else {
      this.config = {
        projectsDir: "",
        verbose: false,
        skipCloud,
        skipInstall: false,
      };
    }
  }

  /**
   * Set skip install flag
   */
  setSkipInstall(skipInstall: boolean): void {
    if (this.config) {
      this.config.skipInstall = skipInstall;
    } else {
      this.config = {
        projectsDir: "",
        verbose: false,
        skipCloud: false,
        skipInstall,
      };
    }
  }

  // removed: setCloudProviders

  /**
   * Set profile name
   */
  setProfile(profile: string): void {
    if (this.config) {
      this.config.profile = profile;
    } else {
      this.config = {
        projectsDir: "",
        verbose: false,
        skipCloud: false,
        skipInstall: false,
        profile,
      };
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if configuration is set
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get configuration as object
   */
  toObject(): CliConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Update configuration with partial updates
   */
  updateConfig(updates: Partial<CliConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...updates };
    } else {
      this.config = {
        projectsDir: "",
        verbose: false,
        skipCloud: false,
        skipInstall: false,
        ...updates,
      };
    }
  }

  /**
   * Reset configuration to default values
   */
  resetConfig(): void {
    this.config = {
      projectsDir: "",
      verbose: false,
      skipCloud: false,
      skipInstall: false,
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config) {
      errors.push("Configuration is not set");
      return { valid: false, errors, warnings };
    }

    if (!this.config.projectsDir) {
      errors.push("Projects directory is required");
    }

    if (this.config.projectsDir && !this.config.projectsDir.trim()) {
      warnings.push("Projects directory is empty");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
