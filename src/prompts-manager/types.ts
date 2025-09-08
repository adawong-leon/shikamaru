export type WatchMode = "local" | "docker" | "hybrid";

export interface RepoChoice {
  kind: "repo";
  name: string;
}

export type RepoSelection = string[];

// New types for repository distribution
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

export interface RepoExecutionMode {
  repo: string;
  mode: "local" | "docker";
  installCommand?: string;
  startupCommand?: string;
}

export interface GlobalExecutionOverride {
  mode: "local" | "hybrid" | "docker";
  installCommand?: string;
  startupCommand?: string;
  applyToAll: boolean;
}

export interface HybridRepoConfig {
  repo: string;
  mode: "local" | "docker";
  installCommand?: string;
  startupCommand?: string;
}

// Unified execution configuration
export interface UnifiedExecutionConfig {
  globalMode: "local" | "docker" | "hybrid";
  globalInstallCommand?: string;
  globalStartupCommand?: string;
  skipInstall?: boolean;
  skipAzure?: boolean;
  repoConfigs: RepoConfig[];
  loggingConfig?: LoggingConfig;
}

export interface LoggingConfig {
  mode: "web" | "terminal";
}

export interface RepoConfig {
  repo: string;
  mode: "local" | "docker";
  installCommand?: string;
  startupCommand?: string;
}

export interface WatchModeConfig {
  mode: WatchMode;
  localRepos: string[]; // Repos that will run with npm run start or npm run start:dev
  dockerRepos?: string[]; // Repos that will run in Docker
  watchRepos?: string[]; // Repos that will run in watch mode
  executionConfigs: RepoExecutionConfig[];
}

export interface PromptsState {
  discoveredRepos: string[];
  selectedRepos: RepoSelection;
  watchMode: WatchMode | null;
  watchModeConfig: WatchModeConfig | null;
  errors: string[];
  warnings: string[];
  skipProfileSave?: boolean;
}

export interface RepoInfo {
  hasDockerfile: boolean;
  language: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: Record<string, any>;
}

export interface WatchModeOption {
  name: string;
  value: WatchMode;
  description: string;
  recommended?: boolean;
}

export interface RepoValidationContext {
  selectedRepos: string[];
  discoveredRepos: string[];
  minRepos: number;
  maxRepos: number;
}

export interface PromptsConfig {
  minRepos: number;
  maxRepos: number;
  enableValidation: boolean;
  enableSearch: boolean;
  pageSize: number;
}

export interface PromptsValidator {
  validateRepos(
    selectedRepos: RepoSelection,
    discoveredRepos: string[]
  ): Promise<ValidationResult>;
  validateRepoName(name: string): boolean;
  validateRepoCount(count: number, min: number, max: number): boolean;
}

export interface WatchModeProvider {
  promptForWatchMode(
    selectedRepos: RepoSelection,
    projectsDir?: string
  ): Promise<WatchMode>;
  getWatchModeOptions(selectedRepos: RepoSelection): WatchModeOption[];
  validateWatchMode(mode: WatchMode, selectedRepos: RepoSelection): boolean;
}

export interface PromptsMetrics {
  startTime: number;
  endTime?: number;
  reposDiscovered: number;
  reposSelected: number;
  validationErrors: number;
  warnings: number;
  userInteractions: number;
}
