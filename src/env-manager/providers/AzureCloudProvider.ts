import { EnvResolutionContext, CloudProviderConfig, Tier } from "../types";
import { BaseCloudProvider } from "./BaseCloudProvider";
import { EnvError } from "../errors/EnvError";
import { getEnvManagerState } from "../index";

export class AzureCloudProvider extends BaseCloudProvider {
  private tier: Tier | null = null;

  constructor(config: CloudProviderConfig, priority: number = 2) {
    super(config, priority);
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
      const groupName = this.getVariableGroupName(context);

      // Check cache first
      const cached = this.checkCache(groupName);
      if (cached) {
        return cached;
      }

      const variables = await this.fetchVariableGroup(groupName);
      this.setCache(groupName, variables);
      return variables;
    } catch (error) {
      console.warn(
        `Failed to fetch Azure variables for ${context.repo}:`,
        error
      );
      return {};
    }
  }

  private async fetchVariableGroup(
    groupName: string
  ): Promise<Record<string, string>> {
    const credentials = this.getCredentialsInternal();
    if (!credentials) {
      throw new EnvError(
        "Azure Personal Access Token not configured",
        null,
        "AZURE_NO_PAT"
      );
    }

    const state = getEnvManagerState();
    const backend = (state.localConfig || state.localBackend || {}) as Record<
      string,
      string
    >;

    const baseUrl =
      backend.AZURE_BASE_URL || this.config.baseUrl || "https://dev.azure.com";
    const org =
      backend.AZURE_ORGANIZATION ||
      backend.ADO_ORGANIZATION ||
      backend.AZURE_ORG ||
      backend.ADO_ORG ||
      backend.ORG ||
      this.config.organization;
    const project =
      backend.AZURE_PROJECT ||
      backend.ADO_PROJECT ||
      backend.PROJECT ||
      this.config.project;

    if (!org || !project || !baseUrl) {
      throw new EnvError(
        "Azure configuration incomplete",
        null,
        "AZURE_CONFIG_ERROR"
      );
    }

    const adoBase = `${baseUrl}/${encodeURIComponent(org)}/${encodeURIComponent(
      project
    )}`;

    try {
      const url = `${adoBase}/_apis/distributedtask/variablegroups?groupName=${encodeURIComponent(
        groupName
      )}`;

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(`:${credentials}`).toString("base64"),
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

      return result;
    } catch (error) {
      throw EnvError.fromCloudError(error, "azure");
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
}
