// Unified Execution Mode Types and Interfaces

export interface ExecutionModeConfig {
  projectsDir: string;
  infraComposeFile: string;
  enableHealthCheck: boolean;
  healthCheckTimeout: number;
  enableAutoStop: boolean;
  stopInfraOnExit: boolean;
  logLevel: "info" | "debug" | "warn" | "error";
  skipAzure?: boolean;
}

// Extended configuration that combines execution mode config with unified config
export interface ExtendedExecutionConfig extends ExecutionModeConfig {
  globalMode: "local" | "docker" | "hybrid";
  globalInstallCommand?: string;
  globalStartupCommand?: string;
  skipInstall?: boolean;
  repoConfigs: any[];
}

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

export interface ExecutionModeResult {
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
  services: Record<string, any>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
}
