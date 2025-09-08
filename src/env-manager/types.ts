export type Tier = "develop" | "qa" | "prod";
export type RepoType = "front" | "back" | "unknown";
export type InfraService = "postgres" | "timescaledb" | "redis" | "rabbitmq";

// Cloud provider types
export type CloudProvider =
  | "azure"
  | "aws"
  | "gcp"
  | "local"
  | "docker"
  | "default";

export type VariableGroupName =
  | "back-DEVELOP"
  | "back-QA"
  | "back-STG"
  | "front-DEVELOP"
  | "front-QA"
  | "front-STG"
  | "front-PROD";

export interface RepoClassification {
  type: RepoType;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface EnvVariable {
  key: string;
  value: string;
  source: CloudProvider;
  priority: number;
}

// Base configuration interface for all database/queue services
export interface BaseServiceConfig {
  host: string;
  port: string;
  username?: string;
  password?: string;
  database?: string;
  protocol?: string;
  connectionUrl?: string;
  source: CloudProvider;
  isInternal: boolean;
  exactKey?: string; // Store the exact key from cloud provider or local
}

// Specific configurations for each database/queue type
export interface PostgresConfig extends BaseServiceConfig {
  ssl?: boolean;
  sslMode?: string;
  poolSize?: number;
  timeout?: number;
}

export interface TimescaleDBConfig extends BaseServiceConfig {
  ssl?: boolean;
  sslMode?: string;
  poolSize?: number;
  timeout?: number;
}

export interface RedisConfig extends BaseServiceConfig {
  db?: number;
  cluster?: boolean;
  sentinel?: boolean;
  tls?: boolean;
}

export interface RabbitMQConfig extends BaseServiceConfig {
  vhost?: string;
  heartbeat?: number;
  ssl?: boolean;
}

// Group configuration for each service type
export interface ServiceGroup<T extends BaseServiceConfig> {
  azure: T;
  local: T;
  docker: T;
  final: T;
  variables: string[];
  exactKeys: Record<string, string>; // Store exact keys for each variable
}

// Database groups for default services
export interface DatabaseGroups {
  postgres: ServiceGroup<PostgresConfig>;
  timescaledb: ServiceGroup<TimescaleDBConfig>;
  redis: ServiceGroup<RedisConfig>;
  rabbitmq: ServiceGroup<RabbitMQConfig>;
}

// Service type mapping for easy lookup
export interface ServiceTypeMapping {
  postgres: "postgres";
  timescaledb: "timescaledb";
  redis: "redis";
  rabbitmq: "rabbitmq";
}

export type ServiceType = keyof ServiceTypeMapping;

// Docker default configurations
export interface DockerDefaults {
  postgres: PostgresConfig;
  timescaledb: TimescaleDBConfig;
  redis: RedisConfig;
  rabbitmq: RabbitMQConfig;
}

export interface VariableGroup {
  name: string;
  variables: Record<string, string>;
  tier: Tier;
  type: RepoType;
}

export interface EnvState {
  tier: Tier | null;
  repos: string[];
  repoClassifications?: Record<string, RepoClassification>;
  variableGroups: {
    front: Record<string, string>;
    back: Record<string, string>;
  };
  localConfig?: Record<string, string>;
  localFrontend?: Record<string, string>;
  localBackend?: Record<string, string>;
  resolvedConfig?: {
    front?: Record<string, string>;
    back?: Record<string, string>;
  };
  errors: string[];
  warnings: string[];
  internalServices: Set<InfraService>;
}

export interface PortMapping {
  host: number;
  container?: number;
}

export type PortsMap = Record<string, PortMapping | number>;

export interface EnvFileContent {
  lines: EnvLine[];
  metadata: {
    repo: string;
    classification: RepoClassification;
    tier: Tier;
  };
}

export type EnvLine =
  | { type: "comment"; raw: string }
  | { type: "empty"; raw: string }
  | { type: "variable"; key: string; value: string; raw: string }
  | { type: "invalid"; raw: string };

export interface EnvResolutionContext {
  repo: string;
  classification: RepoClassification;
  tier: Tier;
  ports: PortsMap;
  cloudVars: Record<string, string>; // Renamed from azureVars
  localConfig: Record<string, string>;
}

// Cloud provider configuration interface
export interface CloudProviderConfig {
  name: string;
  type: CloudProvider;
  baseUrl?: string;
  organization?: string;
  project?: string;
  authentication?: {
    type: "pat" | "token" | "oauth" | "api-key";
    value?: string;
    envVar?: string;
  };
  variableGroupNaming?: {
    frontend: string;
    backend: string;
  };
  enabled: boolean;
}

// Cloud provider interface
export interface CloudProviderInterface {
  name: string;
  type: CloudProvider;
  priority: number;
  config: CloudProviderConfig;

  isAvailable(): boolean;
  isConfigured(): boolean;
  authenticate(credentials: string): void;
  getCredentials(): string | null;
  getVariables(context: EnvResolutionContext): Promise<Record<string, string>>;
  getCacheStats(): { hits: number; misses: number };
  clearCache(): void;
}

export interface EnvProvider {
  name: string;
  priority: number;
  isAvailable(): boolean;
  getVariables(context: EnvResolutionContext): Promise<Record<string, string>>;
}

export interface EnvWriter {
  writeFile(path: string, content: string): Promise<void>;
  writeFileAtomic(path: string, content: string): Promise<void>;
  fileExists(path: string): boolean;
  readFile(path: string): Promise<string>;
}

export interface EnvResolver {
  resolveVariables(
    content: string,
    repo: string,
    classification: RepoClassification,
    state: EnvState
  ): Promise<string>;
}

export interface EnvClassifier {
  classify(repoPath: string): Promise<RepoClassification>;
}
