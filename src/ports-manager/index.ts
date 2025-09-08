import { PortsManager, PortsManagerConfig } from "./PortsManager";
import { PortsError } from "./errors/PortsError";
import { GlobalConfig } from "../cli/config/GlobalConfig";
import type { PortsAssignments, Mode } from "./types";

// Backward compatibility function
export async function loadOrGeneratePorts(
  repos: string[],
  mode: Mode,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!,
  portReusePreference?: boolean
): Promise<PortsAssignments> {
  try {
    const portsManager = new PortsManager({
      projectsDir,
    });

    await portsManager.initialize(repos, mode, portReusePreference);
    return portsManager.getAssignments();
  } catch (error) {
    if (error instanceof PortsError) {
      throw error;
    }
    throw new PortsError("Failed to load or generate ports", error);
  }
}

// New factory function
export function createPortsManager(config: PortsManagerConfig): PortsManager {
  return new PortsManager(config);
}

// Validation function
export async function validatePortsConfig(
  repos: string[],
  mode: Mode,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  assignments: PortsAssignments;
}> {
  try {
    const portsManager = new PortsManager({
      projectsDir,
      enableValidation: true,
      enableConflictResolution: false, // Don't auto-resolve for validation
    });

    await portsManager.initialize(repos, mode);
    const state = portsManager.getState();

    return {
      valid: !portsManager.hasErrors(),
      errors: portsManager.getErrors(),
      warnings: portsManager.getWarnings(),
      assignments: portsManager.getAssignments(),
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      assignments: {},
    };
  }
}

// Analysis function
export async function analyzePortsUsage(
  repos: string[],
  mode: Mode,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!
): Promise<{
  assignments: PortsAssignments;
  conflicts: any[];
  metrics: any;
  suggestions: any;
}> {
  try {
    const portsManager = new PortsManager({
      projectsDir,
      enableValidation: true,
      enableConflictResolution: false,
      enableMetrics: true,
    });

    await portsManager.initialize(repos, mode);
    const state = portsManager.getState();
    const metrics = portsManager.getMetrics();

    return {
      assignments: portsManager.getAssignments(),
      conflicts: state.conflicts,
      metrics,
      suggestions: {
        optimalRange: "4000-5000",
        recommendedMode: mode,
        portUsage: `${Object.keys(state.assignments).length} services`,
      },
    };
  } catch (error) {
    return {
      assignments: {},
      conflicts: [],
      metrics: {},
      suggestions: { error: String(error) },
    };
  }
}

// Utility functions
export function generateServiceName(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isPortInRange(
  port: number,
  min: number = 4000,
  max: number = 5000
): boolean {
  return port >= min && port <= max;
}

export function getAvailablePorts(
  usedPorts: number[],
  min: number = 4000,
  max: number = 5000,
  count: number = 1
): number[] {
  const available: number[] = [];

  for (let port = min; port <= max && available.length < count; port++) {
    if (!usedPorts.includes(port)) {
      available.push(port);
    }
  }

  return available;
}

// Export main classes and types
export { PortsManager } from "./PortsManager";
export { PortsError } from "./errors/PortsError";
export type { PortsAssignments, Mode, PortsManagerConfig } from "./types";
