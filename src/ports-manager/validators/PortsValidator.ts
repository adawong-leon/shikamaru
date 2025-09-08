import { PortsAssignments, Mode, ValidationResult } from "../types";
import { PortsError } from "../errors/PortsError";

export class PortsValidator {
  constructor(
    private config: {
      portRange: { min: number; max: number };
      defaultInternalPort: number;
    }
  ) {}

  async validateAssignments(
    assignments: PortsAssignments,
    repos: string[],
    mode: Mode
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};

    try {
      // Validate each assignment
      for (const [service, ports] of Object.entries(assignments)) {
        const serviceErrors = this.validateServiceAssignment(service, ports);
        errors.push(...serviceErrors);

        if (serviceErrors.length === 0) {
          warnings.push(...this.validateServiceWarnings(service, ports));
        }
      }

      // Validate overall assignments
      const overallErrors = this.validateOverallAssignments(assignments, repos);
      errors.push(...overallErrors);

      // Validate mode-specific requirements
      const modeErrors = this.validateModeRequirements(assignments, mode);
      errors.push(...modeErrors);

      details.totalServices = Object.keys(assignments).length;
      details.totalRepos = repos.length;
      details.mode = mode;
      details.portRange = this.config.portRange;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        details,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [String(error)],
        warnings: [],
        details: { error: String(error) },
      };
    }
  }

  validatePort(port: number): boolean {
    // Check if port is in valid range
    if (!this.isPortInValidRange(port)) {
      return false;
    }

    // Check if port is a reserved port
    if (this.isReservedPort(port)) {
      return false;
    }

    return true;
  }

  validateServiceName(name: string): boolean {
    // Check if service name is valid
    if (!name || typeof name !== "string") {
      return false;
    }

    // Check for valid characters (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(name)) {
      return false;
    }

    // Check length
    if (name.length < 1 || name.length > 63) {
      return false;
    }

    // Check for reserved names
    if (this.isReservedServiceName(name)) {
      return false;
    }

    return true;
  }

  private validateServiceAssignment(
    service: string,
    ports: { internal: number; host: number }
  ): string[] {
    const errors: string[] = [];

    // Validate service name
    if (!this.validateServiceName(service)) {
      errors.push(`Invalid service name: ${service}`);
    }

    // Validate internal port
    if (!this.validatePort(ports.internal)) {
      errors.push(`Invalid internal port for ${service}: ${ports.internal}`);
    }

    // Validate host port
    if (!this.validatePort(ports.host)) {
      errors.push(`Invalid host port for ${service}: ${ports.host}`);
    }

    // Check if ports are the same
    if (ports.internal === ports.host) {
      errors.push(
        `Internal and host ports cannot be the same for ${service}: ${ports.internal}`
      );
    }

    return errors;
  }

  private validateServiceWarnings(
    service: string,
    ports: { internal: number; host: number }
  ): string[] {
    const warnings: string[] = [];

    // Check if host port is in common range
    if (ports.host >= 3000 && ports.host <= 3999) {
      warnings.push(
        `Host port ${ports.host} for ${service} is in common development range`
      );
    }

    // Check if internal port is not standard
    if (ports.internal !== this.config.defaultInternalPort) {
      warnings.push(
        `Non-standard internal port for ${service}: ${ports.internal}`
      );
    }

    return warnings;
  }

  private validateOverallAssignments(
    assignments: PortsAssignments,
    repos: string[]
  ): string[] {
    const errors: string[] = [];

    // Check for duplicate host ports
    const hostPorts = Object.values(assignments).map((p) => p.host);
    const duplicateHostPorts = this.findDuplicates(hostPorts);

    if (duplicateHostPorts.length > 0) {
      errors.push(
        `Duplicate host ports found: ${duplicateHostPorts.join(", ")}`
      );
    }

    // Check for duplicate internal ports
    const internalPorts = Object.values(assignments).map((p) => p.internal);
    const duplicateInternalPorts = this.findDuplicates(internalPorts);

    if (duplicateInternalPorts.length > 0) {
      errors.push(
        `Duplicate internal ports found: ${duplicateInternalPorts.join(", ")}`
      );
    }

    // Check if all repos have assignments
    const assignedServices = Object.keys(assignments);
    const missingRepos = repos.filter((repo) => {
      const serviceName = this.generateServiceName(repo);
      return !assignedServices.includes(serviceName);
    });

    if (missingRepos.length > 0) {
      errors.push(
        `Missing port assignments for repos: ${missingRepos.join(", ")}`
      );
    }

    return errors;
  }

  private validateModeRequirements(
    assignments: PortsAssignments,
    mode: Mode
  ): string[] {
    const errors: string[] = [];

    switch (mode) {
      case "docker":
        // Docker-specific validations
        for (const [service, ports] of Object.entries(assignments)) {
          if (ports.internal !== this.config.defaultInternalPort) {
            errors.push(
              `Docker mode requires standard internal port for ${service}`
            );
          }
        }
        break;

      case "hybrid":
        // Hybrid-specific validations
        for (const [service, ports] of Object.entries(assignments)) {
          if (ports.host < 4000 || ports.host > 5000) {
            errors.push(
              `Hybrid mode requires host ports in range 4000-5000 for ${service}`
            );
          }
        }
        break;

      case "local":
        // Local-specific validations
        for (const [service, ports] of Object.entries(assignments)) {
          if (ports.host === ports.internal) {
            errors.push(
              `Local mode requires different host and internal ports for ${service}`
            );
          }
        }
        break;
    }

    return errors;
  }

  private isPortInValidRange(port: number): boolean {
    const { min, max } = this.config.portRange;
    return port >= min && port <= max;
  }

  private isReservedPort(port: number): boolean {
    // Common reserved ports
    const reservedPorts = [
      22, // SSH
      23, // Telnet
      25, // SMTP
      53, // DNS
      80, // HTTP
      110, // POP3
      143, // IMAP
      443, // HTTPS
      993, // IMAPS
      995, // POP3S
      3306, // MySQL
      5432, // PostgreSQL
      6379, // Redis
      27017, // MongoDB
    ];

    return reservedPorts.includes(port);
  }

  private isReservedServiceName(name: string): boolean {
    const reservedNames = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "api",
      "admin",
      "root",
      "system",
      "internal",
      "external",
    ];

    return reservedNames.includes(name.toLowerCase());
  }

  private findDuplicates(array: number[]): number[] {
    const counts: Record<number, number> = {};
    const duplicates: number[] = [];

    for (const item of array) {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] === 2) {
        duplicates.push(item);
      }
    }

    return duplicates;
  }

  private generateServiceName(repo: string): string {
    return repo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
