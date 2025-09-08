import {
  EnvState,
  RepoClassification,
  EnvLine,
  PortsMap,
  DatabaseGroups,
  ServiceGroup,
  PostgresConfig,
  TimescaleDBConfig,
  RedisConfig,
  RabbitMQConfig,
  BaseServiceConfig,
} from "../types";
import { EnvError } from "../errors/EnvError";
import { DOCKER_DEFAULTS } from "../defaults";
const dbKeywords = [
  "timescaledb",
  "timescale",
  "postgres",
  "redis",
  "rabbitmq",
  "mq",
  "host",
  "port",
  "username",
  "password",
  "database",
  "connection_url",
  "protocol",
];

export class EnvVariableResolver {
  constructor(private readonly ports: PortsMap) {}

  async resolveVariables(
    content: string,
    repo: string,
    classification: RepoClassification,
    state: EnvState
  ): Promise<string> {
    try {
      const lines = this.parseEnvContent(content);
      const resolvedLines = await this.resolveLines(
        lines,
        repo,
        classification,
        state
      );
      return this.serializeEnvContent(resolvedLines);
    } catch (error) {
      throw new EnvError("Failed to resolve environment variables", error);
    }
  }

  private parseEnvContent(content: string): EnvLine[] {
    return content.split("\n").map((line) => this.parseEnvLine(line));
  }

  private parseEnvLine(line: string): EnvLine {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return { type: "comment", raw: line };
    }

    if (trimmed === "") {
      return { type: "empty", raw: line };
    }

    const exportless = trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;
    const eq = exportless.indexOf("=");

    if (eq === -1) {
      return { type: "invalid", raw: line };
    }

    const key = exportless.slice(0, eq).trim();
    const value = exportless.slice(eq + 1);

    return { type: "variable", key, value, raw: line };
  }

  private async resolveLines(
    lines: EnvLine[],
    repo: string,
    classification: RepoClassification,
    state: EnvState
  ): Promise<EnvLine[]> {
    const resolvedLines: EnvLine[] = [];

    // First pass: group database variables and determine host configurations
    const dbGroups = this.groupDatabaseVariables(lines, state, repo);

    for (const line of lines) {
      if (line.type !== "variable") {
        resolvedLines.push(line);
        continue;
      }

      const resolvedValue = await this.resolveVariable(
        line.key,
        line.value,
        repo,
        classification,
        state,
        dbGroups
      );

      state.resolvedConfig = state.resolvedConfig || { front: {}, back: {} };
      if (classification.type === "front") {
        state.resolvedConfig.front = state.resolvedConfig.front || {};
        state.resolvedConfig.front[line.key] = resolvedValue;
      } else {
        state.resolvedConfig.back = state.resolvedConfig.back || {};
        state.resolvedConfig.back[line.key] = resolvedValue;
      }

      resolvedLines.push({
        type: "variable",
        key: line.key,
        value: resolvedValue,
        raw: `${line.key}=${resolvedValue}`,
      });
    }

    return resolvedLines;
  }

  private async resolveVariable(
    key: string,
    exampleValue: string,
    repo: string,
    classification: RepoClassification,
    state: EnvState,
    dbGroups?: DatabaseGroups
  ): Promise<string> {
    const isFrontend = classification.type === "front";
    // Handle SERVER_PORT
    if (/SERVER_PORT$/i.test(key)) {
      return this.resolveServerPort(repo, exampleValue, isFrontend);
    }

    if (isFrontend) {
      return this.resolveFrontendVariable(key, exampleValue, state);
    }

    // Handle service URLs (backend only)
    if (!dbKeywords.some((keyword) => key.toLowerCase().includes(keyword))) {
      const serviceUrl = this.resolveBackendVariable(key, state);
      if (serviceUrl) {
        return serviceUrl;
      }
    }
    // Resolve from various sources based on repo type
    return this.resolveFromSources(key, exampleValue, state, dbGroups);
  }

  private resolveFrontendVariable(
    key: string,
    exampleValue: string,
    state: EnvState
  ): string {
    // Try to extract key from example value first (format: "#{KEY}#")
    const extractedKey = this.extractKeyFromExampleValue(exampleValue);

    // Use extracted key if available, otherwise use the original key
    const keyToUse = extractedKey || key;

    // Convert key to uppercase with underscores only if it contains "ApiUrl"
    const upperKey = keyToUse.includes("ApiUrl")
      ? this.toUpperCaseWithUnderscores(keyToUse)
      : keyToUse;
    // Check for service URLs based on port mapping
    const candidateService = this.normalizeServiceName(upperKey);
    if (keyToUse.includes("API_URL")) {
      const port = Object.keys(this.ports).find((key) =>
        key.toLowerCase().includes(candidateService)
      );
      if (port) {
        return `http://localhost:${this.ports[port]}`;
      }
    }

    // Check local frontend variables first (from global.frontend.env)
    const localFrontendVal = state.localFrontend?.[upperKey];
    if (localFrontendVal) {
      return localFrontendVal;
    }

    // Check Azure frontend variables (only if Azure is not skipped)
    const azureVal = state.variableGroups.front[upperKey];
    if (azureVal) {
      return azureVal;
    }

    // Fallback to example value
    return exampleValue ?? "";
  }
  private resolveBackendVariable(key: string, state: EnvState): string {
    // Convert key to uppercase with underscores only if it contains "ApiUrl"
    const isCandidateUrl =
      key.toLowerCase().includes("url") || key.toLowerCase().includes("api");
    if (!isCandidateUrl) {
      return "";
    }
    // Check for service URLs based on port mapping
    const candidateService = this.normalizeServiceName(key);
    const port = Object.keys(this.ports).find((key) =>
      key.toLowerCase().includes(candidateService)
    );
    if (port) {
      return `http://localhost:${this.ports[port]}`;
    }

    // Check local backend variables first (from global.env)
    const localBackendVal = state.localBackend?.[key];
    if (localBackendVal) {
      return localBackendVal;
    }

    // Check Azure backend variables (only if Azure is not skipped)
    const azureVal = state.variableGroups.back[key];
    if (azureVal) {
      return azureVal;
    }

    return "";
  }

  private resolveServerPort(
    repo: string,
    exampleValue: string,
    isFrontend: boolean
  ): string {
    if (isFrontend) {
      return exampleValue || "";
    }

    const port = this.resolvePort(repo);

    return port?.toString() || "";
  }

  private resolveServiceUrl(key: string): string | null {
    const serviceSlug = this.toKebabServiceName(key);
    const port = this.resolvePort(serviceSlug);

    if (port) {
      return `http://localhost:${port}`;
    }

    return null;
  }

  private resolveFromSources(
    key: string,
    exampleValue: string,
    state: EnvState,
    dbGroups?: DatabaseGroups
  ): string {
    const cloudVars = state.variableGroups.back;
    const cloudVal = cloudVars[key];
    const localVal = state.localBackend?.[key];

    // Use database groups for consistent configuration
    if (dbGroups) {
      const keyLower = key.toLowerCase();

      // Check if this variable belongs to a database group
      if (keyLower.includes("postgres") && !keyLower.includes("timescale")) {
        return this.getConfigValue(key, dbGroups.postgres.final);
      } else if (
        keyLower.includes("timescaledb") ||
        keyLower.includes("timescale")
      ) {
        return this.getConfigValue(key, dbGroups.timescaledb.final);
      } else if (keyLower.includes("redis")) {
        return this.getConfigValue(key, dbGroups.redis.final);
      } else if (keyLower.includes("rabbitmq") || key.includes("mq")) {
        return this.getConfigValue(key, dbGroups.rabbitmq.final);
      }
    }

    return localVal ?? cloudVal ?? exampleValue ?? "";
  }

  private getConfigValue(key: string, config: BaseServiceConfig): string {
    const keyLower = key.toLowerCase();

    // Map environment variable keys to config properties
    if (keyLower.includes("host")) {
      return config.host || "";
    } else if (keyLower.includes("port")) {
      return config.port || "";
    } else if (keyLower.includes("username") || keyLower.includes("user")) {
      return config.username || "";
    } else if (keyLower.includes("password") || keyLower.includes("pass")) {
      return config.password || "";
    } else if (
      keyLower.includes("database") ||
      keyLower.includes("db") ||
      keyLower.includes("name")
    ) {
      return config.database || "";
    } else if (
      keyLower.includes("connection_url") ||
      keyLower.includes("url")
    ) {
      return config.connectionUrl || this.buildConnectionUrl(config);
    } else if (keyLower.includes("protocol")) {
      return config.protocol || "";
    }

    // Fallback to empty string
    return "";
  }

  private buildConnectionUrl(config: BaseServiceConfig): string {
    if (config.connectionUrl) {
      return config.connectionUrl;
    }

    // Use the protocol from the config
    const protocol = config.protocol || "postgresql";

    // Build connection URL based on database type
    if (config.username && config.password) {
      return `${protocol}://${config.username}:${config.password}@${
        config.host
      }:${config.port}${config.database ? `/${config.database}` : ""}`;
    } else {
      return `${protocol}://${config.host}:${config.port}${
        config.database ? `/${config.database}` : ""
      }`;
    }
  }

  private toServiceSlug(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private normalizeServiceName(envVarKey: string): string {
    return this.toKebabServiceName(envVarKey)
      .replace(/-?url$/i, "")
      .replace(/-?api$/i, "")
      .replace(/-?host$/i, "")
      .replace(/-?port$/i, "");
  }

  private toKebabServiceName(envVarKey: string): string {
    return envVarKey
      .replace(/_(URL|API)$/, "")
      .toLowerCase()
      .replace(/_/g, "-");
  }

  /**
   * Converts a camelCase or kebab-case string to UPPER_CASE with underscores
   * Examples:
   * - "apiUrl" -> "API_URL"
   * - "databaseHost" -> "DATABASE_HOST"
   * - "react-app-url" -> "REACT_APP_URL"
   */
  private toUpperCaseWithUnderscores(key: string): string {
    return (
      key
        // Replace hyphens with underscores first
        .replace(/-/g, "_")
        // Insert underscore before uppercase letters (but not at the start)
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        // Convert to uppercase
        .toUpperCase()
    );
  }

  /**
   * Extracts the key from example value in format "#{KEY}#"
   * Examples:
   * - "#{IMPRESSIONS_API_URL}#" -> "IMPRESSIONS_API_URL"
   * - "#{API_URL}#" -> "API_URL"
   */
  private extractKeyFromExampleValue(exampleValue: string): string | null {
    const match = exampleValue.match(/#\{([^}]+)\}#/);
    return match ? match[1] : null;
  }

  private resolvePort(slug: string): number | undefined {
    const entry = this.ports?.[slug];
    if (!entry) return undefined;

    if (typeof entry === "number") return entry;
    if (typeof entry === "object" && entry.host) return entry.host;

    return undefined;
  }

  private isInternalDbMqVariable(
    key: string,
    val: string = ""
  ): { isDb: boolean; looksInternal: boolean } {
    key = key.toLowerCase();
    const isDb = ["postgres", "timescale", "redis", "rabbitmq", "mq "].some(
      (t) => key.includes(t)
    );

    const looksInternal =
      val.includes("cluster") ||
      val.includes("internal") ||
      val.includes("local") ||
      !val.trim();

    return { isDb, looksInternal };
  }

  private groupDatabaseVariables(
    lines: EnvLine[],
    state: EnvState,
    repoName: string
  ): DatabaseGroups {
    const groups: DatabaseGroups = {
      postgres: this.createServiceGroup<PostgresConfig>("postgres"),
      timescaledb: this.createServiceGroup<TimescaleDBConfig>("timescaledb"),
      redis: this.createServiceGroup<RedisConfig>("redis"),
      rabbitmq: this.createServiceGroup<RabbitMQConfig>("rabbitmq"),
    };

    // First pass: map all database variables and collect host information
    const dbVariableMap = new Map<
      string,
      { key: string; azure: string; local: string; dbType: string }
    >();

    for (const line of lines) {
      if (line.type !== "variable") continue;

      const key = line.key.toLowerCase();

      // Map database variables by type
      if (key.includes("postgres") && !key.includes("timescale")) {
        dbVariableMap.set(line.key, {
          key: line.key,
          azure: state.variableGroups.back[line.key] || "",
          local: state.localBackend?.[line.key] || "",
          dbType: "postgres",
        });
      } else if (key.includes("timescaledb") || key.includes("timescale")) {
        dbVariableMap.set(line.key, {
          key: line.key,
          azure: state.variableGroups.back[line.key] || "",
          local: state.localBackend?.[line.key] || "",
          dbType: "timescaledb",
        });
      } else if (key.includes("redis")) {
        dbVariableMap.set(line.key, {
          key: line.key,
          azure: state.variableGroups.back[line.key] || "",
          local: state.localBackend?.[line.key] || "",
          dbType: "redis",
        });
      } else if (key.includes("rabbitmq") || key.includes("mq")) {
        dbVariableMap.set(line.key, {
          key: line.key,
          azure: state.variableGroups.back[line.key] || "",
          local: state.localBackend?.[line.key] || "",
          dbType: "rabbitmq",
        });
      }
    }

    // Second pass: determine internal status based on host values
    const dbInternalStatus = new Map<
      string,
      { azure: boolean; local: boolean }
    >();

    for (const [key, { azure, local, dbType }] of dbVariableMap) {
      const keyLower = key.toLowerCase();

      // Check if this is a host variable
      if (
        keyLower.includes("host") ||
        (keyLower.includes("redis") && !keyLower.includes("namespace"))
      ) {
        // Initialize status for this database type if not exists
        if (!dbInternalStatus.has(dbType)) {
          dbInternalStatus.set(dbType, { azure: true, local: true }); // Initialize status for this database type if not exists
        }
        const status = dbInternalStatus.get(dbType)!;

        // Check Azure value
        if (azure) {
          status.azure = this.isInternalHost(azure);
          console.log(
            `🔍 ${dbType}: Azure Host "${azure}" is ${
              status.azure ? "internal" : "external"
            }`
          );
        }

        // Check local value
        if (local) {
          status.local = this.isInternalHost(local);
          console.log(
            `🔍 ${dbType}: Local Host "${local}" is ${
              status.local ? "internal" : "external"
            }`
          );
        }

        // If neither Azure nor local has a host value, use example value for both
        if (!azure && !local) {
          const isInternal = this.isInternalHost(azure ?? local ?? "");
          status.azure = isInternal;
          status.local = isInternal;
          console.log(
            `🔍 ${dbType}: Example Host "${azure ?? local ?? ""}" is ${
              isInternal ? "internal" : "external"
            } (used for both Azure and Local)`
          );
        }
      }
    }
    Object.keys(groups).forEach((dbType) => {
      const group = groups[dbType as keyof DatabaseGroups];
      const status = dbInternalStatus.get(dbType) || {
        azure: false,
        local: false,
      };
      group.azure.isInternal = status.azure;
      group.local.isInternal = status.local;
    });
    // Third pass: update configurations based on internal status
    for (const [key, { azure, local, dbType }] of dbVariableMap) {
      const group = groups[dbType as keyof DatabaseGroups];

      // Update the group's internal status based on Azure and Local separately
      if (!group.azure.isInternal) {
        this.updateConfigFromSource(group.azure, key, azure ?? "");
      }
      if (!group.local.isInternal) {
        this.updateConfigFromSource(group.local, key, local ?? "");
      }
    }

    // Determine if the repo is dockerized based on classification or metadata
    const isDockerized = this.isRepoDockerized(state, repoName);

    // Determine final configuration for each database group
    this.determineFinalDatabaseConfigs(groups, state, isDockerized);

    return groups;
  }

  private isInternalHost(hostValue: string): boolean {
    const host = hostValue.toLowerCase().trim();

    // Check for internal/localhost patterns
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.includes("internal") ||
      host.includes("local") ||
      host.includes("cluster") ||
      !host.trim() // Empty or whitespace-only values are considered internal
    );
  }

  private createServiceGroup<T extends BaseServiceConfig>(
    serviceType: keyof typeof DOCKER_DEFAULTS.local
  ): ServiceGroup<T> {
    return {
      azure: {
        ...DOCKER_DEFAULTS.local[serviceType],
        source: "azure" as const,
        isInternal: false,
      } as T,
      local: {
        ...DOCKER_DEFAULTS.local[serviceType],
        source: "local" as const,
        isInternal: false,
      } as T,
      docker: { ...DOCKER_DEFAULTS.local[serviceType] } as T,
      final: {
        ...DOCKER_DEFAULTS.local[serviceType],
        source: "default" as const,
      } as T,
      variables: [],
      exactKeys: {},
    };
  }

  private getDockerConfig<T extends BaseServiceConfig>(
    serviceType: keyof typeof DOCKER_DEFAULTS.local,
    isDockerized: boolean = false
  ): T {
    const config = isDockerized
      ? DOCKER_DEFAULTS.dockerized[serviceType]
      : DOCKER_DEFAULTS.local[serviceType];
    return { ...config } as T;
  }

  private isRepoDockerized(state: EnvState, repoName: string): boolean {
    // Check if the specific repo classification indicates dockerized
    if (state.repoClassifications && state.repoClassifications[repoName]) {
      const classification = state.repoClassifications[repoName];
      if (
        classification.metadata?.dockerized ||
        classification.metadata?.containerized ||
        classification.metadata?.docker ||
        classification.metadata?.container
      ) {
        console.log(`🐳 Repo "${repoName}" is dockerized based on metadata`);
        return true;
      }
    }

    // Default to false (local repo)
    return false;
  }

  /**
   * Public method to check if a specific repository is dockerized
   * @param state The environment state containing repo information
   * @param repoName The name of the specific repo to check
   * @returns True if the repo is dockerized, false otherwise
   */
  public checkIfRepoDockerized(state: EnvState, repoName: string): boolean {
    return this.isRepoDockerized(state, repoName);
  }

  /**
   * Get the final deployment type for a specific repository
   * @param state The environment state containing repo information
   * @param repoName The name of the specific repo to check
   * @returns The final deployment type ("docker" or "local")
   */
  public getFinalDeploymentType(
    state: EnvState,
    repoName: string
  ): "docker" | "local" {
    const isDockerized = this.isRepoDockerized(state, repoName);
    return isDockerized ? "docker" : "local";
  }

  private serializeEnvContent(lines: EnvLine[]): string {
    return lines.map((line) => line.raw).join("\n");
  }

  private updateConfigFromSource(
    config: BaseServiceConfig,
    key: string,
    value: string
  ): void {
    const keyLower = key.toLowerCase();

    if (keyLower.includes("host")) {
      config.host = value;
    } else if (keyLower.includes("port")) {
      config.port = value;
    } else if (keyLower.includes("username") || keyLower.includes("user")) {
      config.username = value;
    } else if (keyLower.includes("password") || keyLower.includes("pass")) {
      config.password = value;
    } else if (
      keyLower.includes("database") ||
      keyLower.includes("db") ||
      keyLower.includes("name")
    ) {
      config.database = value;
    } else if (
      keyLower.includes("connection_url") ||
      keyLower.includes("url")
    ) {
      config.connectionUrl = value;
    } else if (keyLower.includes("protocol")) {
      config.protocol = value;
    }
  }

  private determineFinalDatabaseConfigs(
    groups: DatabaseGroups,
    state: EnvState,
    isDockerized: boolean = false
  ): void {
    // Determine final configuration for each database group
    Object.keys(groups).forEach((dbType) => {
      const group = groups[dbType as keyof DatabaseGroups];

      // Check if both Azure and local are internal
      const bothInternal = group.azure.isInternal && group.local.isInternal;

      if (bothInternal) {
        // Use appropriate docker configuration based on repo type
        const dockerConfig = this.getDockerConfig(
          dbType as keyof typeof DOCKER_DEFAULTS.local,
          isDockerized
        );
        group.final = { ...dockerConfig, source: "docker" as const };
        state.internalServices.add(dbType as any);
        console.log(
          `🔧 ${dbType}: Both Azure and local are internal, using ${
            isDockerized ? "dockerized" : "local"
          } docker configuration`
        );
      } else if (group.azure.isInternal && !group.local.isInternal) {
        // Use local configuration when Azure is internal but local is external
        group.final = { ...group.local, source: "local" as const };
        console.log(
          `🔧 ${dbType}: Azure is internal, local is external, using local configuration`
        );
      } else if (!group.azure.isInternal && group.local.isInternal) {
        // Use Azure configuration when local is internal but Azure is external
        group.final = { ...group.azure, source: "azure" as const };
        console.log(
          `🔧 ${dbType}: Local is internal, Azure is external, using Azure configuration`
        );
      } else {
        // Both are external, prefer local over Azure
        group.final = { ...group.local, source: "local" as const };
        console.log(
          `🔧 ${dbType}: Both are external, using Azure configuration`
        );
      }
    });
  }

  // Public methods for debugging and testing
  getResolvedVariables(
    content: string,
    repo: string,
    classification: RepoClassification,
    state: EnvState
  ): Promise<Record<string, string>> {
    return this.resolveVariables(content, repo, classification, state).then(
      (resolvedContent) => {
        const lines = this.parseEnvContent(resolvedContent);
        const variables: Record<string, string> = {};

        for (const line of lines) {
          if (line.type === "variable") {
            variables[line.key] = line.value;
          }
        }

        return variables;
      }
    );
  }
}
