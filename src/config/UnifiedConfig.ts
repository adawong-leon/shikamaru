// Unified Configuration Class - Consolidates all configuration properties

import type { Logger } from "../cli/logger/Logger";
import type { LoggingConfig, RepoConfig } from "../prompts-manager/types";

export interface ServiceConfig {
  name: string;
  type: "app" | "infra";
  port?: number;
  healthCheck?: boolean;
  autoRestart?: boolean;
}

export interface InfraService {
  name: string;
  image: string;
  environment: Record<string, string>;
  ports: string[];
  volumes?: string[];
  networks?: string[];
  restart?: string;
}

export interface HealthCheckResult {
  service: string;
  status: "healthy" | "unhealthy" | "timeout" | "error";
  message?: string;
  duration?: number;
}

export interface ExecutionResult {
  success: boolean;
  startedServices: string[];
  infraServices: string[];
  errors: string[];
  warnings: string[];
  healthCheckResults: HealthCheckResult[];
}

export interface ServiceStartOptions {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  port?: number;
}

export type InfraServiceType =
  | "postgres"
  | "timescaledb"
  | "redis"
  | "rabbitmq";

export interface DockerComposeConfig {
  version: string;
  services: Record<string, any>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
}

/**
 * Unified Configuration Class
 * Consolidates all configuration properties from different sources
 */
export class UnifiedConfig {
  // ==================== SINGLETON PATTERN ====================

  private static instance: UnifiedConfig | null = null;

  /**
   * Get the singleton instance of UnifiedConfig
   * @param options Optional configuration options for initialization
   * @returns The singleton instance
   */
  public static getInstance(
    options: Partial<UnifiedConfig> = {}
  ): UnifiedConfig {
    if (!UnifiedConfig.instance) {
      UnifiedConfig.instance = new UnifiedConfig(options);
    }
    return UnifiedConfig.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    UnifiedConfig.instance = null;
  }

  // ==================== CORE PROPERTIES ====================

  // Global execution mode
  public globalMode: "local" | "docker" | "hybrid";

  // Project and directory settings
  public projectsDir: string;
  public infraComposeFile: string;

  // Installation and startup settings
  public globalInstallCommand?: string;
  public globalStartupCommand?: string;
  public skipInstall?: boolean;

  // Azure and cloud settings
  public skipAzure?: boolean;

  // Environment generation settings
  public useExistingEnvFiles?: boolean;
  public skipEnvGeneration?: boolean;

  // Repository configurations
  public repoConfigs: RepoConfig[];

  // Logging configuration
  public loggingConfig?: LoggingConfig;

  // Health check settings
  public enableHealthCheck: boolean;
  public healthCheckTimeout: number;

  // Auto-stop settings
  public enableAutoStop: boolean;
  public stopInfraOnExit: boolean;

  // Logging level
  public logLevel: "info" | "debug" | "warn" | "error";

  // Service configurations
  public serviceConfigs: ServiceConfig[];
  public infraServices: string[];

  // Docker compose configuration
  public dockerComposeConfig?: DockerComposeConfig;

  // Port assignments
  public portAssignments: Record<string, { internal: number; host: number }>;

  // Logger instance
  public logger?: Logger;

  constructor(options: Partial<UnifiedConfig> = {}) {
    // Set default values
    this.globalMode = options.globalMode || "hybrid";
    this.projectsDir = options.projectsDir || process.cwd();
    this.infraComposeFile =
      options.infraComposeFile || "docker-compose.infra.yml";
    this.globalInstallCommand = options.globalInstallCommand;
    this.globalStartupCommand = options.globalStartupCommand;
    this.skipInstall = options.skipInstall || false;
    this.skipAzure = options.skipAzure || false;
    this.useExistingEnvFiles = options.useExistingEnvFiles || false;
    this.skipEnvGeneration = options.skipEnvGeneration || false;
    this.repoConfigs = options.repoConfigs || [];
    this.loggingConfig = options.loggingConfig || { mode: "terminal" };
    this.enableHealthCheck = options.enableHealthCheck ?? true;
    this.healthCheckTimeout = options.healthCheckTimeout || 30000;
    this.enableAutoStop = options.enableAutoStop ?? true;
    this.stopInfraOnExit = options.stopInfraOnExit ?? true;
    this.logLevel = options.logLevel || "info";
    this.serviceConfigs = options.serviceConfigs || [];
    this.infraServices = options.infraServices || [];
    this.dockerComposeConfig = options.dockerComposeConfig;
    this.portAssignments = options.portAssignments || {};
    this.logger = options.logger;
  }

  // ==================== GETTERS AND SETTERS ====================

  // Global Mode
  getGlobalMode(): "local" | "docker" | "hybrid" {
    return this.globalMode;
  }

  setGlobalMode(mode: "local" | "docker" | "hybrid"): void {
    this.globalMode = mode;
  }

  // Projects Directory
  getProjectsDir(): string {
    return this.projectsDir;
  }

  setProjectsDir(dir: string): void {
    this.projectsDir = dir;
  }

  // Infrastructure Compose File
  getInfraComposeFile(): string {
    return this.infraComposeFile;
  }

  setInfraComposeFile(file: string): void {
    this.infraComposeFile = file;
  }

  // Global Install Command
  getGlobalInstallCommand(): string | undefined {
    return this.globalInstallCommand;
  }

  setGlobalInstallCommand(command: string | undefined): void {
    this.globalInstallCommand = command;
  }

  // Global Startup Command
  getGlobalStartupCommand(): string | undefined {
    return this.globalStartupCommand;
  }

  setGlobalStartupCommand(command: string | undefined): void {
    this.globalStartupCommand = command;
  }

  // Skip Install
  getSkipInstall(): boolean {
    return this.skipInstall || false;
  }

  setSkipInstall(skip: boolean): void {
    this.skipInstall = skip;
  }

  // Skip Azure
  getSkipAzure(): boolean {
    return this.skipAzure || false;
  }

  setSkipAzure(skip: boolean): void {
    this.skipAzure = skip;
  }

  // Use Existing Env Files
  getUseExistingEnvFiles(): boolean {
    return this.useExistingEnvFiles || false;
  }

  setUseExistingEnvFiles(useExisting: boolean): void {
    this.useExistingEnvFiles = useExisting;
  }

  // Skip Env Generation (e.g., user runs DB themselves)
  getSkipEnvGeneration(): boolean {
    return this.skipEnvGeneration || false;
  }

  setSkipEnvGeneration(skip: boolean): void {
    this.skipEnvGeneration = skip;
  }

  // Repository Configurations
  getRepoConfigs(): RepoConfig[] {
    return this.repoConfigs;
  }

  setRepoConfigs(configs: RepoConfig[]): void {
    this.repoConfigs = configs;
  }

  // Logging Configuration
  getLoggingConfig(): LoggingConfig | undefined {
    return this.loggingConfig;
  }

  setLoggingConfig(config: LoggingConfig | undefined): void {
    this.loggingConfig = config;
  }

  // Enable Health Check
  getEnableHealthCheck(): boolean {
    return this.enableHealthCheck;
  }

  setEnableHealthCheck(enable: boolean): void {
    this.enableHealthCheck = enable;
  }

  // Health Check Timeout
  getHealthCheckTimeout(): number {
    return this.healthCheckTimeout;
  }

  setHealthCheckTimeout(timeout: number): void {
    this.healthCheckTimeout = timeout;
  }

  // Enable Auto Stop
  getEnableAutoStop(): boolean {
    return this.enableAutoStop;
  }

  setEnableAutoStop(enable: boolean): void {
    this.enableAutoStop = enable;
  }

  // Stop Infrastructure on Exit
  getStopInfraOnExit(): boolean {
    return this.stopInfraOnExit;
  }

  setStopInfraOnExit(stop: boolean): void {
    this.stopInfraOnExit = stop;
  }

  // Log Level
  getLogLevel(): "info" | "debug" | "warn" | "error" {
    return this.logLevel;
  }

  setLogLevel(level: "info" | "debug" | "warn" | "error"): void {
    this.logLevel = level;
  }

  // Service Configurations
  getServiceConfigs(): ServiceConfig[] {
    return this.serviceConfigs;
  }

  setServiceConfigs(configs: ServiceConfig[]): void {
    this.serviceConfigs = configs;
  }

  // Infrastructure Services
  getInfraServices(): string[] {
    return this.infraServices;
  }

  setInfraServices(services: string[]): void {
    this.infraServices = services;
  }

  // Docker Compose Configuration
  getDockerComposeConfig(): DockerComposeConfig | undefined {
    return this.dockerComposeConfig;
  }

  setDockerComposeConfig(config: DockerComposeConfig | undefined): void {
    this.dockerComposeConfig = config;
  }

  // Port Assignments
  getPortAssignments(): Record<string, { internal: number; host: number }> {
    return this.portAssignments;
  }

  setPortAssignments(
    assignments: Record<string, { internal: number; host: number }>
  ): void {
    this.portAssignments = assignments;
  }

  // Logger
  getLogger(): Logger | undefined {
    return this.logger;
  }

  setLogger(logger: Logger | undefined): void {
    this.logger = logger;
  }

  // ==================== VALIDATION METHODS ====================

  /**
   * Validate the configuration
   */
  validate(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!this.getProjectsDir()) {
      errors.push("projectsDir is required");
    }

    if (!this.getGlobalMode()) {
      errors.push("globalMode is required");
    }

    if (!["local", "docker", "hybrid"].includes(this.getGlobalMode())) {
      errors.push("globalMode must be one of: local, docker, hybrid");
    }

    // Warning checks
    if (this.getGlobalMode() === "docker" && !this.getInfraComposeFile()) {
      warnings.push("infraComposeFile is recommended for docker mode");
    }

    if (this.getRepoConfigs().length === 0) {
      warnings.push("No repository configurations provided");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get repository names
   */
  getRepositoryNames(): string[] {
    return this.getRepoConfigs().map((config) => config.repo);
  }

  /**
   * Get repositories by mode
   */
  getRepositoriesByMode(mode: "local" | "docker"): string[] {
    return this.getRepoConfigs()
      .filter((config) => config.mode === mode)
      .map((config) => config.repo);
  }

  /**
   * Check if web logging is enabled
   */
  isWebLoggingEnabled(): boolean {
    return this.getLoggingConfig()?.mode === "web";
  }

  /**
   * Get web logging port
   */
  getWebLoggingPort(): number {
    return 3001;
  }

  /**
   * Check if health checks are enabled
   */
  isHealthCheckEnabled(): boolean {
    return this.getEnableHealthCheck();
  }

  /**
   * Check if auto-stop is enabled
   */
  isAutoStopEnabled(): boolean {
    return this.getEnableAutoStop();
  }

  /**
   * Check if Azure should be skipped
   */
  shouldSkipAzure(): boolean {
    return this.getSkipAzure();
  }

  /**
   * Check if installation should be skipped
   */
  shouldSkipInstall(): boolean {
    return this.getSkipInstall();
  }

  /**
   * Get service configuration by name
   */
  getServiceConfigByName(serviceName: string): ServiceConfig | undefined {
    return this.getServiceConfigs().find(
      (config) => config.name === serviceName
    );
  }

  /**
   * Get infrastructure service by name
   */
  getInfraServiceByName(serviceName: string): string | undefined {
    return this.getInfraServices().find((service) => service === serviceName);
  }

  /**
   * Add service configuration
   */
  addServiceConfig(config: ServiceConfig): void {
    const currentConfigs = this.getServiceConfigs();
    currentConfigs.push(config);
    this.setServiceConfigs(currentConfigs);
  }

  /**
   * Add infrastructure service
   */
  addInfraService(service: string): void {
    const currentServices = this.getInfraServices();
    currentServices.push(service);
    this.setInfraServices(currentServices);
  }

  /**
   * Remove service configuration by name
   */
  removeServiceConfig(serviceName: string): boolean {
    const currentConfigs = this.getServiceConfigs();
    const index = currentConfigs.findIndex(
      (config) => config.name === serviceName
    );
    if (index !== -1) {
      currentConfigs.splice(index, 1);
      this.setServiceConfigs(currentConfigs);
      return true;
    }
    return false;
  }

  /**
   * Remove infrastructure service by name
   */
  removeInfraService(serviceName: string): boolean {
    const currentServices = this.getInfraServices();
    const index = currentServices.findIndex(
      (service) => service === serviceName
    );
    if (index !== -1) {
      currentServices.splice(index, 1);
      this.setInfraServices(currentServices);
      return true;
    }
    return false;
  }

  /**
   * Update service configuration
   */
  updateServiceConfig(
    serviceName: string,
    updates: Partial<ServiceConfig>
  ): boolean {
    const currentConfigs = this.getServiceConfigs();
    const index = currentConfigs.findIndex(
      (config) => config.name === serviceName
    );
    if (index !== -1) {
      currentConfigs[index] = { ...currentConfigs[index], ...updates };
      this.setServiceConfigs(currentConfigs);
      return true;
    }
    return false;
  }

  /**
   * Update infrastructure service
   */
  updateInfraService(serviceName: string, updates: Partial<string>): boolean {
    const currentServices = this.getInfraServices();
    const index = currentServices.findIndex(
      (service) => service === serviceName
    );
    if (index !== -1) {
      currentServices[index] = updates as string;
      this.setInfraServices(currentServices);
      return true;
    }
    return false;
  }

  /**
   * Add repository configuration
   */
  addRepoConfig(repo: string, mode: "local" | "docker"): void {
    const currentConfigs = this.getRepoConfigs();
    currentConfigs.push({ repo, mode });
    this.setRepoConfigs(currentConfigs);
  }

  /**
   * Remove repository configuration
   */
  removeRepoConfig(repo: string): boolean {
    const currentConfigs = this.getRepoConfigs();
    const index = currentConfigs.findIndex((config) => config.repo === repo);
    if (index !== -1) {
      currentConfigs.splice(index, 1);
      this.setRepoConfigs(currentConfigs);
      return true;
    }
    return false;
  }

  /**
   * Update repository configuration
   */
  updateRepoConfig(repo: string, updates: Partial<RepoConfig>): boolean {
    const currentConfigs = this.getRepoConfigs();
    const index = currentConfigs.findIndex((config) => config.repo === repo);
    if (index !== -1) {
      currentConfigs[index] = { ...currentConfigs[index], ...updates };
      this.setRepoConfigs(currentConfigs);
      return true;
    }
    return false;
  }

  /**
   * Check if repository exists
   */
  hasRepo(repo: string): boolean {
    return this.getRepoConfigs().some((config) => config.repo === repo);
  }

  /**
   * Check if service exists
   */
  hasService(serviceName: string): boolean {
    return this.getServiceConfigs().some(
      (config) => config.name === serviceName
    );
  }

  /**
   * Check if infrastructure service exists
   */
  hasInfraService(serviceName: string): boolean {
    return this.getInfraServices().some((service) => service === serviceName);
  }

  /**
   * Get all repository names as a set
   */
  getRepositorySet(): Set<string> {
    return new Set(this.getRepositoryNames());
  }

  /**
   * Get all service names as a set
   */
  getServiceNames(): Set<string> {
    return new Set(this.getServiceConfigs().map((config) => config.name));
  }

  /**
   * Get all infrastructure service names as a set
   */
  getInfraServiceNames(): Set<string> {
    return new Set(this.getInfraServices().map((service) => service));
  }

  /**
   * Clear all configurations
   */
  clear(): void {
    this.setRepoConfigs([]);
    this.setServiceConfigs([]);
    this.setInfraServices([]);
    this.setLoggingConfig(undefined);
    this.setDockerComposeConfig(undefined);
  }

  /**
   * Reset to default values
   */
  reset(): void {
    this.setGlobalMode("hybrid");
    this.setProjectsDir(process.cwd());
    this.setInfraComposeFile("docker-compose.infra.yml");
    this.setGlobalInstallCommand(undefined);
    this.setGlobalStartupCommand(undefined);
    this.setSkipInstall(false);
    this.setSkipAzure(false);
    this.setUseExistingEnvFiles(false);
    this.setSkipEnvGeneration(false);
    this.setRepoConfigs([]);
    this.setLoggingConfig({ mode: "terminal" });
    this.setEnableHealthCheck(true);
    this.setHealthCheckTimeout(30000);
    this.setEnableAutoStop(true);
    this.setStopInfraOnExit(true);
    this.setLogLevel("info");
    this.setServiceConfigs([]);
    this.setInfraServices([]);
    this.setDockerComposeConfig(undefined);
    this.setPortAssignments({});
    this.setLogger(undefined);
  }

  /**
   * Clone the configuration
   */
  clone(): UnifiedConfig {
    return new UnifiedConfig({
      globalMode: this.getGlobalMode(),
      projectsDir: this.getProjectsDir(),
      infraComposeFile: this.getInfraComposeFile(),
      globalInstallCommand: this.getGlobalInstallCommand(),
      globalStartupCommand: this.getGlobalStartupCommand(),
      skipInstall: this.getSkipInstall(),
      skipAzure: this.getSkipAzure(),
      useExistingEnvFiles: this.getUseExistingEnvFiles(),
      skipEnvGeneration: this.getSkipEnvGeneration(),
      repoConfigs: [...this.getRepoConfigs()],
      loggingConfig: this.getLoggingConfig()
        ? { ...this.getLoggingConfig()! }
        : undefined,
      enableHealthCheck: this.getEnableHealthCheck(),
      healthCheckTimeout: this.getHealthCheckTimeout(),
      enableAutoStop: this.getEnableAutoStop(),
      stopInfraOnExit: this.getStopInfraOnExit(),
      logLevel: this.getLogLevel(),
      serviceConfigs: [...this.getServiceConfigs()],
      infraServices: [...this.getInfraServices()],
      dockerComposeConfig: this.getDockerComposeConfig(),
      portAssignments: { ...this.getPortAssignments() },
      logger: this.getLogger(),
    });
  }

  /**
   * Merge with another configuration
   */
  merge(other: Partial<UnifiedConfig>): UnifiedConfig {
    const merged = this.clone();

    // Merge properties
    Object.assign(merged, other);

    // Merge arrays
    if (other.repoConfigs) {
      merged.setRepoConfigs([...this.getRepoConfigs(), ...other.repoConfigs]);
    }
    if (other.serviceConfigs) {
      merged.setServiceConfigs([
        ...this.getServiceConfigs(),
        ...other.serviceConfigs,
      ]);
    }
    if (other.infraServices) {
      merged.setInfraServices([
        ...this.getInfraServices(),
        ...other.infraServices,
      ]);
    }

    return merged;
  }

  /**
   * Convert to plain object
   */
  toObject(): Record<string, any> {
    return {
      globalMode: this.getGlobalMode(),
      projectsDir: this.getProjectsDir(),
      infraComposeFile: this.getInfraComposeFile(),
      globalInstallCommand: this.getGlobalInstallCommand(),
      globalStartupCommand: this.getGlobalStartupCommand(),
      skipInstall: this.getSkipInstall(),
      skipAzure: this.getSkipAzure(),
      useExistingEnvFiles: this.getUseExistingEnvFiles(),
      skipEnvGeneration: this.getSkipEnvGeneration(),
      repoConfigs: this.getRepoConfigs(),
      loggingConfig: this.getLoggingConfig(),
      enableHealthCheck: this.getEnableHealthCheck(),
      healthCheckTimeout: this.getHealthCheckTimeout(),
      enableAutoStop: this.getEnableAutoStop(),
      stopInfraOnExit: this.getStopInfraOnExit(),
      logLevel: this.getLogLevel(),
      serviceConfigs: this.getServiceConfigs(),
      infraServices: this.getInfraServices(),
      dockerComposeConfig: this.getDockerComposeConfig(),
      portAssignments: this.getPortAssignments(),
    };
  }

  /**
   * Get port map from port assignments
   * Returns a map of repository names to host ports (for display and logging)
   */
  getPortMap(): Record<string, number> {
    const portMap: Record<string, number> = {};

    // Convert port assignments to simple port map
    Object.entries(this.getPortAssignments()).forEach(
      ([serviceName, portEntry]) => {
        // Convert service name back to repo name (remove any service name transformations)
        const repoName = this.getRepositoryNames().find(
          (repo) =>
            this.generateServiceName(repo) === serviceName ||
            repo === serviceName
        );

        if (repoName) {
          portMap[repoName] = portEntry.host;
        } else {
          // If we can't find the repo name, use the service name as fallback
          portMap[serviceName] = portEntry.host;
        }
      }
    );

    return portMap;
  }

  /**
   * Generate service name from repo name (matching ports manager logic)
   */
  private generateServiceName(repo: string): string {
    return repo.toLowerCase().replace(/[^a-z0-9]/g, "-");
  }
}
