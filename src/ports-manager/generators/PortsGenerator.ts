import { PortsAssignments, Mode } from "../types";
import { PortsError } from "../errors/PortsError";
import { execSync } from "child_process";

export class PortsGenerator {
  private usedPorts: Set<number> = new Set();
  private systemPortsInUse: Set<number> = new Set();

  constructor(
    private config: {
      portRange: { min: number; max: number };
      defaultInternalPort: number;
    }
  ) {
    this.refreshSystemPortsInUse();
  }

  async generatePorts(repos: string[], mode: Mode): Promise<PortsAssignments> {
    try {
      const assignments: PortsAssignments = {};
      this.usedPorts.clear();
      this.refreshSystemPortsInUse();

      for (const repo of repos) {
        const serviceName = this.generateServiceName(repo);

        // If already present (e.g., duplicate repo names), don't overwrite
        if (!assignments[serviceName]) {
          const hostPort = this.generateRandomPort();
          const internalPort = this.getInternalPortForMode(mode);

          assignments[serviceName] = {
            internal: internalPort,
            host: hostPort,
          };

          this.usedPorts.add(hostPort);
          this.usedPorts.add(internalPort);
        }
      }

      return assignments;
    } catch (error) {
      throw new PortsError("Failed to generate ports", error);
    }
  }

  generateRandomPort(): number {
    const { min, max } = this.config.portRange;
    const lo = Math.ceil(min);
    const hi = Math.floor(max);

    let attempts = 0;
    const maxAttempts = 200; // Increased attempts for better conflict resolution

    while (attempts < maxAttempts) {
      const port = Math.floor(Math.random() * (hi - lo + 1)) + lo;

      if (!this.usedPorts.has(port) && !this.isPortInUse(port)) {
        return port;
      }

      attempts++;
    }

    // If we can't find a port in the configured range, try a wider range
    return this.findAvailablePortInExtendedRange();
  }

  private findAvailablePortInExtendedRange(): number {
    // Try ports outside the configured range as fallback
    const extendedRanges = [
      { min: 4000, max: 4999 },
      { min: 5000, max: 5999 },
      { min: 8000, max: 8999 },
      { min: 9000, max: 9999 },
    ];

    for (const range of extendedRanges) {
      for (let port = range.min; port <= range.max; port++) {
        if (!this.usedPorts.has(port) && !this.isPortInUse(port)) {
          console.warn(
            `⚠️  Using port ${port} outside configured range due to conflicts`
          );
          return port;
        }
      }
    }

    throw new PortsError(
      "No available ports found in any range. Please free up some ports and try again.",
      null,
      "NO_PORTS_AVAILABLE"
    );
  }

  generateServiceName(repo: string): string {
    return repo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  isPortInUse(port: number): boolean {
    // Check both internal tracking and system ports
    return this.usedPorts.has(port) || this.systemPortsInUse.has(port);
  }

  refreshSystemPortsInUse(): void {
    try {
      this.systemPortsInUse.clear();

      // Get list of ports in use on the system
      const output = execSync("lsof -i -P -n | grep LISTEN", {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"], // Ignore stderr to avoid errors
      });

      const lines = output.split("\n");
      for (const line of lines) {
        const match = line.match(/:(\d+)\s+\(LISTEN\)/);
        if (match) {
          const port = parseInt(match[1], 10);
          this.systemPortsInUse.add(port);
        }
      }
    } catch (error) {
      // If we can't get system ports, just continue with internal tracking
      console.warn(
        "⚠️  Could not detect system ports in use, using internal tracking only"
      );
    }
  }

  // Method to suggest alternative ports for a specific service
  suggestAlternativePorts(serviceName: string, originalPort: number): number[] {
    const alternatives: number[] = [];
    const { min, max } = this.config.portRange;

    // Try ports around the original port first
    for (let offset = 1; offset <= 10; offset++) {
      const port1 = originalPort + offset;
      const port2 = originalPort - offset;

      if (port1 >= min && port1 <= max && !this.isPortInUse(port1)) {
        alternatives.push(port1);
      }
      if (port2 >= min && port2 <= max && !this.isPortInUse(port2)) {
        alternatives.push(port2);
      }
    }

    // If we don't have enough alternatives, try random ports
    while (alternatives.length < 5) {
      const port = this.generateRandomPort();
      if (!alternatives.includes(port)) {
        alternatives.push(port);
      }
    }

    return alternatives.slice(0, 5);
  }

  // Method to check if a specific port is available
  isPortAvailable(port: number): boolean {
    return !this.isPortInUse(port);
  }

  // Method to reserve a port and check it's actually available
  async reservePort(port: number): Promise<boolean> {
    // Double-check the port is available right now
    this.refreshSystemPortsInUse();

    if (this.isPortInUse(port)) {
      return false;
    }

    // Reserve it in our tracking
    this.usedPorts.add(port);
    return true;
  }

  // Method to check port availability with retry
  async checkPortAvailability(
    port: number,
    maxRetries: number = 3
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      this.refreshSystemPortsInUse();
      if (!this.isPortInUse(port)) {
        return true;
      }
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  // Method to get a guaranteed available port
  async getGuaranteedAvailablePort(): Promise<number> {
    const { min, max } = this.config.portRange;
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      const port = Math.floor(Math.random() * (max - min + 1)) + min;

      if (await this.checkPortAvailability(port)) {
        this.usedPorts.add(port);
        return port;
      }

      attempts++;
    }

    // Try extended ranges
    const extendedRanges = [
      { min: 4000, max: 4999 },
      { min: 5000, max: 5999 },
      { min: 8000, max: 8999 },
      { min: 9000, max: 9999 },
    ];

    for (const range of extendedRanges) {
      for (let port = range.min; port <= range.max; port++) {
        if (await this.checkPortAvailability(port)) {
          this.usedPorts.add(port);
          console.warn(
            `⚠️  Using port ${port} outside configured range due to conflicts`
          );
          return port;
        }
      }
    }

    throw new PortsError(
      "No available ports found in any range. Please free up some ports and try again.",
      null,
      "NO_PORTS_AVAILABLE"
    );
  }

  // Method to get a list of available ports in a range
  getAvailablePortsInRange(start: number, end: number): number[] {
    const available: number[] = [];
    for (let port = start; port <= end; port++) {
      if (!this.isPortInUse(port)) {
        available.push(port);
      }
    }
    return available;
  }

  private getInternalPortForMode(mode: Mode): number {
    switch (mode) {
      case "local":
        return this.config.defaultInternalPort;
      case "docker":
        return this.config.defaultInternalPort;
      case "hybrid":
        return this.config.defaultInternalPort;
      default:
        return this.config.defaultInternalPort;
    }
  }

  // Method to check if a port is in a valid range
  isPortInValidRange(port: number): boolean {
    const { min, max } = this.config.portRange;
    return port >= min && port <= max;
  }
}
