import {
  CloudProviderInterface,
  CloudProviderConfig,
  EnvResolutionContext,
  CloudProvider,
} from "../types";

export abstract class BaseCloudProvider implements CloudProviderInterface {
  name: string;
  type: CloudProvider;
  priority: number;
  config: CloudProviderConfig;

  protected cache: Map<string, Record<string, string>> = new Map();
  protected metrics = {
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(config: CloudProviderConfig, priority: number = 2) {
    this.config = config;
    this.name = config.name;
    this.type = config.type;
    this.priority = priority;
  }

  isAvailable(): boolean {
    return this.config.enabled && this.isConfigured();
  }

  isConfigured(): boolean {
    return !!(
      this.config.authentication?.value ||
      (this.config.authentication?.envVar &&
        process.env[this.config.authentication.envVar])
    );
  }

  authenticate(credentials: string): void {
    if (this.config.authentication) {
      this.config.authentication.value = credentials;
      this.cache.clear(); // Clear cache when credentials change
    }
  }

  getCredentials(): string | null {
    return (
      this.config.authentication?.value ||
      (this.config.authentication?.envVar
        ? process.env[this.config.authentication.envVar] || null
        : null)
    );
  }

  protected getCredentialsInternal(): string | null {
    return (
      this.config.authentication?.value ||
      (this.config.authentication?.envVar
        ? process.env[this.config.authentication.envVar] || null
        : null)
    );
  }

  protected getVariableGroupName(context: EnvResolutionContext): string {
    const tier = context.tier.toUpperCase();
    const type = context.classification.type;

    if (this.config.variableGroupNaming) {
      return type === "back"
        ? this.config.variableGroupNaming.backend.replace("{tier}", tier)
        : this.config.variableGroupNaming.frontend.replace("{tier}", tier);
    }

    // Default naming convention
    return `${type === "back" ? "back" : "front"}-${tier}`;
  }

  protected checkCache(groupName: string): Record<string, string> | null {
    if (this.cache.has(groupName)) {
      this.metrics.cacheHits++;
      return this.cache.get(groupName)!;
    }
    this.metrics.cacheMisses++;
    return null;
  }

  protected setCache(
    groupName: string,
    variables: Record<string, string>
  ): void {
    this.cache.set(groupName, variables);
  }

  getCacheStats(): { hits: number; misses: number } {
    return {
      hits: this.metrics.cacheHits,
      misses: this.metrics.cacheMisses,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  abstract getVariables(
    context: EnvResolutionContext
  ): Promise<Record<string, string>>;
}
