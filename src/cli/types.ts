// CLI Types and Interfaces

export interface Repo {
  name: string;
  path: string;
}

export type WatchMode = "local" | "docker" | "hybrid";
export type PortsMap = Record<string, number>;

// Repository execution configuration
export interface RepoExecutionConfig {
  repo: string;
  mode: "local" | "docker";
  command:
    | "npm run start"
    | "npm run start:dev"
    | "docker-compose up"
    | "custom";
  customCommand?: string;
  port?: number;
  environment?: Record<string, string>;
}

export interface WatchModeConfig {
  mode: WatchMode;
  localRepos: string[]; // Repos that will run with npm run start:dev
  watchRepos: string[]; // Repos that will run in Docker
  executionConfigs: RepoExecutionConfig[];
}

export interface CliConfig {
  projectsDir: string;
  verbose: boolean;
  skipCloud: boolean;
  skipInstall: boolean;
  profile?: string;
}

export interface CliOptions {
  verbose?: boolean;
  projectsDir?: string;
  skipCloud?: boolean;
  skipInstall?: boolean;
  profile?: string;
}

export interface ParsedArgs {
  command: string;
  options: CliOptions;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "error" | "unknown";
  port?: number;
  pid?: number;
  uptime?: number;
}

export interface LogLevel {
  INFO: "info";
  SUCCESS: "success";
  WARNING: "warning";
  ERROR: "error";
  DEBUG: "debug";
  STEP: "step";
}

export type LogLevelType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "debug"
  | "step";
