import {
  CloudProviderInterface,
  CloudProviderConfig,
  EnvResolutionContext,
  CloudProvider,
  EnvState,
} from "../types";
import { AzureCloudProvider } from "./AzureCloudProvider";

export class CloudProviderManager {
  private providers: Map<string, CloudProviderInterface> = new Map();
  private defaultProvider: string | null = null;
  private state: EnvState;

  constructor(state: EnvState) {
    this.state = state;
  }

  registerDefaultProviders(): void {
    // Register Azure provider by default
    const azureProvider = new AzureCloudProvider({
      name: "Azure DevOps",
      type: "azure",
      baseUrl: "https://dev.azure.com",
      organization: this.state.localBackend.ORG,
      project: this.state.localBackend.PROJECT,
      authentication: {
        type: "pat",
        value: this.state.localBackend.AZURE_PERSONAL_ACCESS_TOKEN,
      },
      enabled: true,
    });
    this.registerProvider(azureProvider);
  }

  registerProvider(provider: CloudProviderInterface): void {
    this.providers.set(provider.name, provider);

    // Set as default if it's the first provider
    if (this.providers.size === 1) {
      this.defaultProvider = provider.name;
    }
  }

  getProvider(name: string): CloudProviderInterface | undefined {
    return this.providers.get(name);
  }

  getProviderByType(type: CloudProvider): CloudProviderInterface | undefined {
    for (const provider of this.providers.values()) {
      if (provider.type === type) {
        return provider;
      }
    }
    return undefined;
  }

  getAvailableProviders(): CloudProviderInterface[] {
    return Array.from(this.providers.values()).filter((provider) =>
      provider.isAvailable()
    );
  }

  getDefaultProvider(): CloudProviderInterface | undefined {
    if (this.defaultProvider) {
      return this.providers.get(this.defaultProvider);
    }
    return undefined;
  }

  setDefaultProvider(name: string): void {
    if (this.providers.has(name)) {
      this.defaultProvider = name;
    }
  }

  async getVariablesFromAllProviders(
    context: EnvResolutionContext
  ): Promise<Record<string, string>> {
    const allVariables: Record<string, string> = {};

    // Get variables from all available providers, ordered by priority
    const availableProviders = this.getAvailableProviders().sort(
      (a, b) => b.priority - a.priority
    );

    for (const provider of availableProviders) {
      try {
        const variables = await provider.getVariables(context);
        // Merge variables, with higher priority providers overriding lower priority ones
        Object.assign(allVariables, variables);
      } catch (error) {
        console.warn(
          `Failed to get variables from provider ${provider.name}:`,
          error
        );
      }
    }

    return allVariables;
  }

  async getVariablesFromAzureOnly(
    context: EnvResolutionContext
  ): Promise<Record<string, string>> {
    const azureProvider = this.getAzureProvider();
    if (!azureProvider) {
      console.warn(
        `Failed to get variables from Azure provider:`,
        "pat not found"
      );

      return {};
    }

    try {
      return await azureProvider.getVariables(context);
    } catch (error) {
      console.warn(`Failed to get variables from Azure provider:`, error);
      return {};
    }
  }

  async getVariablesFromProvider(
    name: string,
    context: EnvResolutionContext
  ): Promise<Record<string, string>> {
    const provider = this.getProvider(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }

    if (!provider.isAvailable()) {
      throw new Error(`Provider ${name} is not available`);
    }

    return await provider.getVariables(context);
  }

  getCacheStats(): Record<string, { hits: number; misses: number }> {
    const stats: Record<string, { hits: number; misses: number }> = {};

    for (const [name, provider] of this.providers) {
      stats[name] = provider.getCacheStats();
    }

    return stats;
  }

  clearAllCaches(): void {
    for (const provider of this.providers.values()) {
      provider.clearCache();
    }
  }

  clearProviderCache(name: string): void {
    const provider = this.getProvider(name);
    if (provider) {
      provider.clearCache();
    }
  }

  // Azure-specific methods for backward compatibility
  getAzureProvider(): AzureCloudProvider | undefined {
    return this.getProviderByType("azure") as AzureCloudProvider;
  }

  setAzurePat(pat: string): void {
    const azureProvider = this.getAzureProvider();
    if (azureProvider) {
      azureProvider.authenticate(pat);
    }
  }

  getAzurePat(): string | null {
    const azureProvider = this.getAzureProvider();
    if (azureProvider) {
      return azureProvider.getCredentials();
    }
    return null;
  }

  setAzureTier(tier: string): void {
    const azureProvider = this.getAzureProvider();
    if (azureProvider) {
      azureProvider.setTier(tier as any);
    }
  }
}
