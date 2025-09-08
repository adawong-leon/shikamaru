import { EnvProvider, EnvResolutionContext, Tier } from "../types";
import { AzureVariableProvider } from "./AzureVariableProvider";

export class AzureCustomProvider implements EnvProvider {
  name = "Azure DevOps";
  priority = 2; // Higher priority than local config
  private azureProvider: AzureVariableProvider;
  private tier: Tier | null = null;

  constructor() {
    this.azureProvider = new AzureVariableProvider();
  }

  setPersonalAccessToken(pat: string): void {
    this.azureProvider.setPersonalAccessToken(pat);
  }

  getPersonalAccessToken(): string | null {
    return this.azureProvider.getPersonalAccessToken();
  }

  isAvailable(): boolean {
    return this.azureProvider.isAvailable();
  }

  setTier(tier: Tier): void {
    this.tier = tier;
  }

  async getVariables(
    context: EnvResolutionContext
  ): Promise<Record<string, string>> {
    if (!this.tier) {
      throw new Error("Tier not set for Azure provider");
    }

    try {
      const frontGroup = `front-${this.tier.toUpperCase()}`;
      const backGroup = `back-${this.tier.toUpperCase()}`;

      // Determine which variable group to use based on classification
      const groupName =
        context.classification.type === "back" ? backGroup : frontGroup;

      const variables = await this.azureProvider.fetchVariableGroup(groupName);
      return variables;
    } catch (error) {
      console.warn(
        `Failed to fetch Azure variables for ${context.repo}:`,
        error
      );
      return {};
    }
  }

  getCacheStats(): { hits: number; misses: number } {
    return this.azureProvider.getCacheStats();
  }

  clearCache(): void {
    this.azureProvider.clearCache();
  }
}
