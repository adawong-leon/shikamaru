import { Tier } from "../types";
import { EnvError } from "../errors/EnvError";

export class EnvConfigProvider {
  private static instance: EnvConfigProvider;
  private cachedTier: Tier | null = null;

  static getInstance(): EnvConfigProvider {
    if (!EnvConfigProvider.instance) {
      EnvConfigProvider.instance = new EnvConfigProvider();
    }
    return EnvConfigProvider.instance;
  }

  async promptTier(): Promise<Tier> {
    // Return cached tier if already prompted
    if (this.cachedTier) {
      return this.cachedTier;
    }

    try {
      const inquirer = await import("inquirer");
      const { tier } = await inquirer.default.prompt<{ tier: Tier }>([
        {
          type: "list",
          name: "tier",
          message: "Which environment?",
          choices: [
            { name: "Development", value: "develop" },
            { name: "QA", value: "qa" },
            { name: "Production", value: "prod" },
          ],
          default: "develop",
        },
      ]);

      this.cachedTier = tier;
      return tier;
    } catch (error) {
      throw EnvError.fromConfigError(error);
    }
  }

  getTier(): Tier | null {
    return this.cachedTier;
  }

  setTier(tier: Tier): void {
    this.cachedTier = tier;
  }

  reset(): void {
    this.cachedTier = null;
  }
}
