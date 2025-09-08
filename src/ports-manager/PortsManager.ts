import { PortsFileManager } from "./managers/PortsFileManager";
import { PortsGenerator } from "./generators/PortsGenerator";
import { PortsValidator } from "./validators/PortsValidator";
import { PortsConflictResolver } from "./resolvers/PortsConflictResolver";
import { PortsState, PortsConfig } from "./types";
import { PortsError } from "./errors/PortsError";

export interface PortsManagerConfig {
  projectsDir: string;
  portsFile?: string;
  portRange?: { min: number; max: number };
  defaultInternalPort?: number;
  enableValidation?: boolean;
  enableConflictResolution?: boolean;
  enableMetrics?: boolean;
}

export interface PortsManagerMetrics {
  startTime: number;
  endTime?: number;
  reposProcessed: number;
  portsGenerated: number;
  conflictsResolved: number;
  errors: number;
  warnings: number;
  fileOperations: number;
}

export class PortsManager {
  private state: PortsState;
  private config: PortsManagerConfig;
  private metrics: PortsManagerMetrics;
  private fileManager: PortsFileManager;
  private generator: PortsGenerator;
  private validator: PortsValidator;
  private conflictResolver: PortsConflictResolver;
  private isInitialized = false;

  constructor(config: PortsManagerConfig) {
    this.config = {
      portRange: { min: 4000, max: 5000 },
      defaultInternalPort: 3000,
      enableValidation: true,
      enableConflictResolution: true,
      enableMetrics: true,
      ...config,
    };

    this.state = {
      mode: null,
      repos: [],
      assignments: {},
      conflicts: [],
      errors: [],
      warnings: [],
    };

    this.metrics = {
      startTime: Date.now(),
      reposProcessed: 0,
      portsGenerated: 0,
      conflictsResolved: 0,
      errors: 0,
      warnings: 0,
      fileOperations: 0,
    };

    // Convert PortsManagerConfig to PortsConfig for the components
    const portsConfig: PortsConfig = {
      portRange: this.config.portRange || { min: 3000, max: 4000 },
      defaultInternalPort: this.config.defaultInternalPort || 3000,
      enableValidation: this.config.enableValidation ?? true,
      enableConflictResolution: this.config.enableConflictResolution ?? true,
      enableMetrics: this.config.enableMetrics ?? true,
    };

    this.fileManager = new PortsFileManager(this.config);
    this.generator = new PortsGenerator(portsConfig);
    this.validator = new PortsValidator(portsConfig);
    this.conflictResolver = new PortsConflictResolver(portsConfig);
  }

  async initialize(
    repos: string[],
    mode: "local" | "docker" | "hybrid",
    portReusePreference?: boolean
  ): Promise<void> {
    if (this.isInitialized) {
      throw new PortsError(
        "PortsManager already initialized",
        null,
        "ALREADY_INITIALIZED"
      );
    }

    try {
      this.validateInput(repos, mode);
      this.state.repos = repos;
      this.state.mode = mode;

      // Load existing ports or generate new ones
      await this.loadOrGeneratePorts(portReusePreference);

      // Validate assignments
      if (this.config.enableValidation) {
        await this.validatePorts();
      }

      // Resolve conflicts if enabled
      if (
        this.config.enableConflictResolution &&
        this.state.conflicts.length > 0
      ) {
        await this.resolveConflicts();
      }

      // Ensure all repos have port assignments
      await this.ensureAllReposHavePorts();

      this.isInitialized = true;
    } catch (error) {
      this.recordError("Failed to initialize ports manager", error);
      throw error;
    }
  }

  private validateInput(repos: string[], mode: string): void {
    if (!Array.isArray(repos) || repos.length === 0) {
      throw new PortsError(
        "Repos must be a non-empty array",
        null,
        "INVALID_INPUT"
      );
    }

    if (!["local", "docker", "hybrid"].includes(mode)) {
      throw new PortsError(`Invalid mode: ${mode}`, null, "INVALID_MODE");
    }

    // Validate repo names
    const invalidRepos = repos.filter(
      (repo) => !repo || typeof repo !== "string"
    );
    if (invalidRepos.length > 0) {
      throw new PortsError(
        `Invalid repo names: ${invalidRepos.join(", ")}`,
        null,
        "INVALID_REPO_NAMES"
      );
    }

    // Validate port range
    const { min, max } = this.config.portRange!;
    if (min >= max || min < 1024 || max > 65535) {
      throw new PortsError(
        `Invalid port range: ${min}-${max}`,
        null,
        "INVALID_PORT_RANGE"
      );
    }
  }

  private findMissingRepos(existingPorts: any): string[] {
    const existingServiceNames = Object.keys(existingPorts);
    const currentServiceNames = this.state.repos.map((repo) =>
      this.generator.generateServiceName(repo)
    );

    return this.state.repos.filter((repo) => {
      const serviceName = this.generator.generateServiceName(repo);
      return !existingServiceNames.includes(serviceName);
    });
  }

  private async loadOrGeneratePorts(
    portReusePreference?: boolean
  ): Promise<void> {
    try {
      // Try to load existing ports
      const existingPorts = await this.fileManager.loadPorts();

      if (existingPorts && Object.keys(existingPorts).length > 0) {
        const shouldReuse =
          portReusePreference !== undefined
            ? portReusePreference
            : await this.promptForReuse();

        if (shouldReuse) {
          // Check for missing repos and generate ports for them
          const missingRepos = this.findMissingRepos(existingPorts);

          if (missingRepos.length > 0) {
            console.log(
              `🔧 Generating ports for ${
                missingRepos.length
              } missing repos: ${missingRepos.join(", ")}`
            );
            const missingPorts = await this.generator.generatePorts(
              missingRepos,
              this.state.mode!
            );

            // Merge existing and new port assignments
            this.state.assignments = { ...existingPorts, ...missingPorts };

            // Save updated assignments
            await this.fileManager.savePorts(
              this.state.assignments,
              this.state.mode!
            );
            this.metrics.fileOperations++;

            console.log(
              `✅ Loaded existing ports and generated ${missingRepos.length} new port assignments`
            );
            return;
          } else {
            this.state.assignments = existingPorts;
            this.metrics.fileOperations++;
            console.log("✅ Loaded existing port assignments");
            return;
          }
        }
      }

      // Generate new ports for all repos
      await this.generateNewPorts();
    } catch (error) {
      throw new PortsError("Failed to load or generate ports", error);
    }
  }

  private async ensureAllReposHavePorts(): Promise<void> {
    // Double-check that all repos have port assignments
    const missingRepos = this.findMissingRepos(this.state.assignments);

    if (missingRepos.length > 0) {
      console.log(
        `🔧 Ensuring ports for ${
          missingRepos.length
        } repos: ${missingRepos.join(", ")}`
      );
      const missingPorts = await this.generator.generatePorts(
        missingRepos,
        this.state.mode!
      );

      // Merge with existing assignments
      this.state.assignments = { ...this.state.assignments, ...missingPorts };

      // Save updated assignments
      await this.fileManager.savePorts(
        this.state.assignments,
        this.state.mode!
      );
      this.metrics.fileOperations++;

      console.log(
        `✅ Generated ports for ${missingRepos.length} missing repos`
      );
    }
  }

  private async promptForReuse(): Promise<boolean> {
    try {
      const inquirer = await import("inquirer");
      const { reuse } = await inquirer.default.prompt<{ reuse: boolean }>([
        {
          type: "confirm",
          name: "reuse",
          message: "Reuse existing ports?",
          default: true,
        },
      ]);
      return reuse;
    } catch (error) {
      this.recordWarning("Failed to prompt for reuse, defaulting to false");
      return false;
    }
  }

  private async generateNewPorts(): Promise<void> {
    try {
      const assignments = await this.generator.generatePorts(
        this.state.repos,
        this.state.mode!
      );

      // Check for conflicts
      const conflicts = this.conflictResolver.detectConflicts(assignments);
      this.state.conflicts = conflicts;

      if (conflicts.length > 0) {
        this.recordWarning(`Found ${conflicts.length} port conflicts`);
      }

      this.state.assignments = assignments;
      this.metrics.portsGenerated = Object.keys(assignments).length;

      // Save to file
      await this.fileManager.savePorts(assignments, this.state.mode!);
      this.metrics.fileOperations++;

      console.log(
        `✅ Generated ${this.metrics.portsGenerated} port assignments`
      );
    } catch (error) {
      throw new PortsError("Failed to generate new ports", error);
    }
  }

  private async validatePorts(): Promise<void> {
    try {
      const validationResult = await this.validator.validateAssignments(
        this.state.assignments,
        this.state.repos,
        this.state.mode!
      );

      if (validationResult.errors.length > 0) {
        validationResult.errors.forEach((error) =>
          this.recordError(error, null)
        );
      }

      if (validationResult.warnings.length > 0) {
        validationResult.warnings.forEach((warning) =>
          this.recordWarning(warning)
        );
      }

      this.metrics.reposProcessed = this.state.repos.length;
    } catch (error) {
      throw new PortsError("Failed to validate ports", error);
    }
  }

  private async resolveConflicts(): Promise<void> {
    try {
      const resolvedAssignments = await this.conflictResolver.resolveConflicts(
        this.state.assignments,
        this.state.conflicts
      );

      this.state.assignments = resolvedAssignments;
      this.state.conflicts = [];
      this.metrics.conflictsResolved = this.state.conflicts.length;

      // Save resolved assignments
      await this.fileManager.savePorts(resolvedAssignments, this.state.mode!);
      this.metrics.fileOperations++;

      console.log(
        `✅ Resolved ${this.metrics.conflictsResolved} port conflicts`
      );
    } catch (error) {
      throw new PortsError("Failed to resolve port conflicts", error);
    }
  }

  private recordError(message: string, error?: any): void {
    const errorMessage = error ? `${message}: ${error}` : message;
    this.state.errors.push(errorMessage);
    this.metrics.errors++;
  }

  private recordWarning(message: string): void {
    this.state.warnings.push(message);
    this.metrics.warnings++;
  }

  // Public API methods
  getAssignments(): Record<string, { internal: number; host: number }> {
    // Ensure all repos have port assignments before returning
    const missingRepos = this.findMissingRepos(this.state.assignments);

    if (missingRepos.length > 0) {
      console.log(
        `🔧 Auto-generating ports for ${
          missingRepos.length
        } missing repos: ${missingRepos.join(", ")}`
      );

      // Generate ports for missing repos synchronously
      missingRepos.forEach((repo) => {
        const serviceName = this.generator.generateServiceName(repo);
        const hostPort = this.generator.generateRandomPort();
        const internalPort = this.config.defaultInternalPort || 3000;

        this.state.assignments[serviceName] = {
          internal: internalPort,
          host: hostPort,
        };
      });

      // Save updated assignments
      this.fileManager
        .savePorts(this.state.assignments, this.state.mode!)
        .catch((error) => {
          console.warn(`⚠️ Failed to save auto-generated ports: ${error}`);
        });
    }

    return { ...this.state.assignments };
  }

  getState(): PortsState {
    return { ...this.state };
  }

  getMetrics(): PortsManagerMetrics {
    return { ...this.metrics };
  }

  getErrors(): string[] {
    return [...this.state.errors];
  }

  getWarnings(): string[] {
    return [...this.state.warnings];
  }

  hasErrors(): boolean {
    return this.state.errors.length > 0;
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  // Method to get port for a specific service
  getPortForService(
    serviceName: string
  ): { internal: number; host: number } | null {
    return this.state.assignments[serviceName] || null;
  }

  // Method to check if a port is available
  isPortAvailable(port: number): boolean {
    const usedPorts = Object.values(this.state.assignments).map(
      (assignment) => assignment.host
    );
    return !usedPorts.includes(port);
  }

  // Method to add a custom port assignment
  addPortAssignment(serviceName: string, internal: number, host: number): void {
    if (!this.isInitialized) {
      throw new PortsError(
        "PortsManager must be initialized before adding assignments",
        null,
        "NOT_INITIALIZED"
      );
    }

    if (!this.isPortAvailable(host)) {
      throw new PortsError(
        `Port ${host} is already in use`,
        null,
        "PORT_IN_USE"
      );
    }

    this.state.assignments[serviceName] = { internal, host };
    this.metrics.portsGenerated++;
  }

  // Method to remove a port assignment
  removePortAssignment(serviceName: string): void {
    if (!this.isInitialized) {
      throw new PortsError(
        "PortsManager must be initialized before removing assignments",
        null,
        "NOT_INITIALIZED"
      );
    }

    if (this.state.assignments[serviceName]) {
      delete this.state.assignments[serviceName];
      this.metrics.portsGenerated--;
    }
  }

  // Method to regenerate ports for specific services
  async regeneratePortsForServices(serviceNames: string[]): Promise<void> {
    if (!this.isInitialized) {
      throw new PortsError(
        "PortsManager must be initialized before regenerating ports",
        null,
        "NOT_INITIALIZED"
      );
    }

    try {
      for (const serviceName of serviceNames) {
        if (this.state.assignments[serviceName]) {
          const newPort = this.generator.generateRandomPort();
          this.state.assignments[serviceName].host = newPort;
        }
      }

      // Save updated assignments
      await this.fileManager.savePorts(
        this.state.assignments,
        this.state.mode!
      );
      this.metrics.fileOperations++;

      console.log(`✅ Regenerated ports for ${serviceNames.length} services`);
    } catch (error) {
      throw new PortsError("Failed to regenerate ports", error);
    }
  }

  // Method to reset the manager for reuse
  reset(): void {
    this.state = {
      mode: null,
      repos: [],
      assignments: {},
      conflicts: [],
      errors: [],
      warnings: [],
    };
    this.metrics = {
      startTime: Date.now(),
      reposProcessed: 0,
      portsGenerated: 0,
      conflictsResolved: 0,
      errors: 0,
      warnings: 0,
      fileOperations: 0,
    };
    this.isInitialized = false;
  }

  // Method to export assignments in different formats
  exportAssignments(format: "json" | "yaml" | "env" = "json"): string {
    switch (format) {
      case "json":
        return JSON.stringify(this.state.assignments, null, 2);
      case "yaml":
        return this.convertToYaml(this.state.assignments);
      case "env":
        return this.convertToEnv(this.state.assignments);
      default:
        throw new PortsError(
          `Unsupported export format: ${format}`,
          null,
          "UNSUPPORTED_FORMAT"
        );
    }
  }

  private convertToYaml(
    assignments: Record<string, { internal: number; host: number }>
  ): string {
    let yaml = "ports:\n";
    for (const [service, ports] of Object.entries(assignments)) {
      yaml += `  ${service}:\n`;
      yaml += `    internal: ${ports.internal}\n`;
      yaml += `    host: ${ports.host}\n`;
    }
    return yaml;
  }

  private convertToEnv(
    assignments: Record<string, { internal: number; host: number }>
  ): string {
    let env = "";
    for (const [service, ports] of Object.entries(assignments)) {
      env += `${service.toUpperCase()}_PORT=${ports.host}\n`;
      env += `${service.toUpperCase()}_INTERNAL_PORT=${ports.internal}\n`;
    }
    return env;
  }
}
