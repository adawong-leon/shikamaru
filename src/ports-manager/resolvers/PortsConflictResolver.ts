import { PortsAssignments, PortConflict } from "../types";
import { PortsError } from "../errors/PortsError";
import { execSync } from "child_process";

export class PortsConflictResolver {
  private systemPortsInUse: Set<number> = new Set();

  constructor(
    private config: {
      portRange: { min: number; max: number };
      defaultInternalPort: number;
    }
  ) {
    this.refreshSystemPortsInUse();
  }

  detectConflicts(assignments: PortsAssignments): PortConflict[] {
    const conflicts: PortConflict[] = [];
    const services = Object.keys(assignments);

    // Refresh system ports before conflict detection
    this.refreshSystemPortsInUse();

    // Check for host port conflicts
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const service1 = services[i];
        const service2 = services[j];
        const ports1 = assignments[service1];
        const ports2 = assignments[service2];

        if (ports1.host === ports2.host) {
          conflicts.push({
            service1,
            service2,
            port: ports1.host,
            type: "host",
          });
        }

        if (ports1.internal === ports2.internal) {
          conflicts.push({
            service1,
            service2,
            port: ports1.internal,
            type: "internal",
          });
        }
      }
    }

    // Check for conflicts with system ports
    for (const [service, ports] of Object.entries(assignments)) {
      if (this.systemPortsInUse.has(ports.host)) {
        conflicts.push({
          service1: service,
          service2: "system",
          port: ports.host,
          type: "host",
        });
      }
    }

    return conflicts;
  }

  async resolveConflicts(
    assignments: PortsAssignments,
    conflicts: PortConflict[]
  ): Promise<PortsAssignments> {
    try {
      const resolvedAssignments = { ...assignments };
      const usedPorts = new Set<number>();

      // Collect all currently used ports
      for (const ports of Object.values(resolvedAssignments)) {
        usedPorts.add(ports.host);
        usedPorts.add(ports.internal);
      }

      // Add system ports to used ports
      for (const port of this.systemPortsInUse) {
        usedPorts.add(port);
      }

      // Resolve each conflict
      for (const conflict of conflicts) {
        const { service1, service2, port, type } = conflict;

        if (type === "host") {
          if (service2 === "system") {
            // Conflict with system port - resolve by changing the service port
            const newPort = this.suggestAlternativePort(
              port,
              Array.from(usedPorts)
            );
            resolvedAssignments[service1].host = newPort;
            usedPorts.add(newPort);
            console.warn(
              `⚠️  Port ${port} is in use by system, using ${newPort} for ${service1}`
            );
          } else {
            // Conflict between services - resolve by giving service2 a new port
            const newPort = this.suggestAlternativePort(
              port,
              Array.from(usedPorts)
            );
            resolvedAssignments[service2].host = newPort;
            usedPorts.add(newPort);
            console.warn(
              `⚠️  Port conflict between ${service1} and ${service2}, using ${newPort} for ${service2}`
            );
          }
        } else if (type === "internal") {
          // For internal port conflicts, we might want to keep them the same
          // since internal ports can be the same across services
          // But if we need to resolve, we can assign a different internal port
          if (this.shouldResolveInternalConflict(service1, service2)) {
            const newPort = this.suggestAlternativePort(
              port,
              Array.from(usedPorts)
            );
            resolvedAssignments[service2].internal = newPort;
            usedPorts.add(newPort);
          }
        }
      }

      return resolvedAssignments;
    } catch (error) {
      throw new PortsError("Failed to resolve port conflicts", error);
    }
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

  suggestAlternativePort(port: number, usedPorts: number[]): number {
    const { min, max } = this.config.portRange;
    let attempts = 0;
    const maxAttempts = 100;

    // First, try ports close to the original port
    for (let offset = 1; offset <= 20; offset++) {
      const port1 = port + offset;
      const port2 = port - offset;

      if (port1 >= min && port1 <= max && !usedPorts.includes(port1)) {
        return port1;
      }
      if (port2 >= min && port2 <= max && !usedPorts.includes(port2)) {
        return port2;
      }
    }

    // If no close ports available, try random ports in range
    while (attempts < maxAttempts) {
      const randomPort = Math.floor(Math.random() * (max - min + 1)) + min;

      if (!usedPorts.includes(randomPort)) {
        return randomPort;
      }

      attempts++;
    }

    // If still no port found, try extended ranges
    const extendedRanges = [
      { min: 4000, max: 4999 },
      { min: 5000, max: 5999 },
      { min: 8000, max: 8999 },
      { min: 9000, max: 9999 },
    ];

    for (const range of extendedRanges) {
      for (let p = range.min; p <= range.max; p++) {
        if (!usedPorts.includes(p)) {
          console.warn(
            `⚠️  Using port ${p} outside configured range due to conflicts`
          );
          return p;
        }
      }
    }

    throw new PortsError(
      "No available ports found in any range. Please free up some ports and try again.",
      null,
      "NO_PORTS_AVAILABLE"
    );
  }

  // Method to check if a specific port is in use by the system
  isPortInUseBySystem(port: number): boolean {
    return this.systemPortsInUse.has(port);
  }

  // Method to get all system ports in use
  getSystemPortsInUse(): number[] {
    return Array.from(this.systemPortsInUse).sort((a, b) => a - b);
  }

  // Method to suggest ports for a specific service
  suggestPortsForService(
    serviceName: string,
    preferredPort?: number
  ): number[] {
    const suggestions: number[] = [];
    const { min, max } = this.config.portRange;

    if (preferredPort && !this.systemPortsInUse.has(preferredPort)) {
      suggestions.push(preferredPort);
    }

    // Try ports in the configured range
    for (let port = min; port <= max && suggestions.length < 5; port++) {
      if (!this.systemPortsInUse.has(port)) {
        suggestions.push(port);
      }
    }

    return suggestions.slice(0, 5);
  }

  private shouldResolveInternalConflict(
    service1: string,
    service2: string
  ): boolean {
    // For now, we'll resolve internal conflicts if services are different
    // This could be enhanced with more sophisticated logic
    return service1 !== service2;
  }
}
