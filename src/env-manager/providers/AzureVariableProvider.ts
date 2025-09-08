import { EnvManagerConfig } from "../EnvManager";
import { EnvError } from "../errors/EnvError";
import { getEnvManagerState } from "../index";

export class AzureVariableProvider {
  private pat: string | null = null;
  private cache: Map<string, Record<string, string>> = new Map();
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor() {}

  private getAdoBase(): string {
    const state = getEnvManagerState();
    const backend = (state.localConfig || state.localBackend || {}) as Record<
      string,
      string
    >;

    const baseUrl = backend.AZURE_BASE_URL || "https://dev.azure.com";

    const org =
      backend.AZURE_ORGANIZATION ||
      backend.ADO_ORGANIZATION ||
      backend.AZURE_ORG ||
      backend.ADO_ORG ||
      backend.ORG;

    const project =
      backend.AZURE_PROJECT || backend.ADO_PROJECT || backend.PROJECT;

    if (!org || !project) {
      throw new EnvError(
        "Azure configuration incomplete (organization/project not set in global.env)",
        null,
        "AZURE_CONFIG_ERROR"
      );
    }

    return `${baseUrl}/${encodeURIComponent(org)}/${encodeURIComponent(
      project
    )}`;
  }

  isAvailable(): boolean {
    return !!this.pat;
  }

  setPersonalAccessToken(pat: string): void {
    this.pat = pat;
    this.cache.clear(); // Clear cache when PAT changes
  }

  getPersonalAccessToken(): string | null {
    return this.pat;
  }

  async fetchVariableGroup(groupName: string): Promise<Record<string, string>> {
    if (!this.pat) {
      throw new EnvError(
        "Azure Personal Access Token not configured",
        null,
        "AZURE_NO_PAT"
      );
    }

    // Check cache first
    if (this.cache.has(groupName)) {
      this.metrics.cacheHits++;
      return this.cache.get(groupName)!;
    }

    this.metrics.cacheMisses++;

    try {
      const adoBase = this.getAdoBase();
      const url = `${adoBase}/_apis/distributedtask/variablegroups?groupName=${encodeURIComponent(
        groupName
      )}`;

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(`:${this.pat}`).toString("base64"),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Azure API failed ${response.status} ${response.statusText}: ${url}\n${body}`
        );
      }

      const json = await response.json();
      const variables = json?.value?.[0]?.variables || {};

      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(variables)) {
        result[key] = (value as any)?.value ?? "";
      }

      // Cache the result
      this.cache.set(groupName, result);

      return result;
    } catch (error) {
      throw EnvError.fromAzureError(error);
    }
  }

  async fetchMultipleVariableGroups(
    groupNames: string[]
  ): Promise<Record<string, Record<string, string>>> {
    const results: Record<string, Record<string, string>> = {};

    const promises = groupNames.map(async (groupName) => {
      try {
        const variables = await this.fetchVariableGroup(groupName);
        results[groupName] = variables;
      } catch (error) {
        console.warn(`Failed to fetch variable group "${groupName}": ${error}`);
        results[groupName] = {};
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { hits: number; misses: number } {
    return {
      hits: this.metrics.cacheHits,
      misses: this.metrics.cacheMisses,
    };
  }
}
