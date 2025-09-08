export type Mode = "local" | "docker" | "hybrid";

export interface PortEntry {
  internal: number;
  host: number;
}

export type PortsAssignments = Record<string, PortEntry>;

export interface PortConflict {
  service1: string;
  service2: string;
  port: number;
  type: "host" | "internal";
}

export interface PortsState {
  mode: Mode | null;
  repos: string[];
  assignments: PortsAssignments;
  conflicts: PortConflict[];
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: Record<string, any>;
}

export interface PortsFileFormat {
  Service: string;
  "Internal Port": number;
  "Host Port": number;
  Mode: Mode;
  Created?: string;
  Updated?: string;
}

export interface PortsConfig {
  portRange: { min: number; max: number };
  defaultInternalPort: number;
  enableValidation: boolean;
  enableConflictResolution: boolean;
  enableMetrics: boolean;
}

export interface PortsManagerConfig {
  projectsDir: string;
  portRange?: { min: number; max: number };
  defaultInternalPort?: number;
  enableValidation?: boolean;
  enableConflictResolution?: boolean;
  enableMetrics?: boolean;
}

export interface PortsFileManager {
  loadPorts(): Promise<PortsAssignments | null>;
  savePorts(assignments: PortsAssignments, mode: Mode): Promise<void>;
  fileExists(): boolean;
  getFilePath(): string;
  backup(): Promise<string>;
  restore(backupPath: string): Promise<void>;
}

export interface PortsGenerator {
  generatePorts(repos: string[], mode: Mode): Promise<PortsAssignments>;
  generateRandomPort(): number;
  generateServiceName(repo: string): string;
  isPortInUse(port: number): boolean;
}

export interface PortsValidator {
  validateAssignments(
    assignments: PortsAssignments,
    repos: string[],
    mode: Mode
  ): Promise<ValidationResult>;
  validatePort(port: number): boolean;
  validateServiceName(name: string): boolean;
}

export interface PortsConflictResolver {
  detectConflicts(assignments: PortsAssignments): PortConflict[];
  resolveConflicts(
    assignments: PortsAssignments,
    conflicts: PortConflict[]
  ): Promise<PortsAssignments>;
  suggestAlternativePort(port: number, usedPorts: number[]): number;
}

export interface PortsMetrics {
  startTime: number;
  endTime?: number;
  reposProcessed: number;
  portsGenerated: number;
  conflictsResolved: number;
  errors: number;
  warnings: number;
  fileOperations: number;
}
