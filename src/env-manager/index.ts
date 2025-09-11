import { EnvManager } from "./EnvManager";
import { EnvError } from "./errors/EnvError";
import { PortsMap } from "./types";
import { GlobalConfig } from "../cli/config/GlobalConfig";
import { UnifiedConfig } from "../config/UnifiedConfig";
export type { Tier, RepoType, PortsMap } from "./types";

/**
 * Improved environment initialization function that uses the new EnvManager architecture.
 * This provides the same interface as the original initEnv function but with better
 * error handling, extensibility, and maintainability.
 */
export async function initEnv(): Promise<void> {
  try {
    const unifiedConfig = UnifiedConfig.getInstance();
    // Short-circuit if user chose to use existing env files or to skip env generation
    if (
      unifiedConfig.getUseExistingEnvFiles() ||
      unifiedConfig.getSkipEnvGeneration()
    ) {
      return;
    }
    const repos = unifiedConfig.getRepositoryNames();
    const ports = unifiedConfig.getPortMap();
    const projectsDir = unifiedConfig.getProjectsDir();
    const skipCloud = unifiedConfig.getSkipAzure();
    const envManager = EnvManager.getInstance({
      projectsDir,
      ports,
      skipCloud,
      unifiedConfig,
    });

    // Initialize the environment manager
    await envManager.initialize(repos);

    // Generate environment files
    await envManager.generateEnvFiles();

    // Check for errors
    if (envManager.hasErrors()) {
      const errors = envManager.getErrors();
      console.error("❌ Environment generation completed with errors:");
      errors.forEach((error: string) => console.error(`  ${error}`));
      throw new EnvError(
        "Environment generation failed",
        null,
        "GENERATION_FAILED"
      );
    }
  } catch (error) {
    if (error instanceof EnvError) {
      throw error;
    }
    throw new EnvError(
      "Unexpected error during environment initialization",
      error
    );
  }
}

/**
 * Create an EnvManager instance for advanced usage and customization.
 */
export function createEnvManager(
  projectsDir: string,
  ports: PortsMap,
  skipCloud: boolean = false
): EnvManager {
  return EnvManager.getInstance({
    projectsDir,
    ports,
    skipCloud,
  });
}
export function getEnvManagerState() {
  try {
    return EnvManager.getInstance().getState();
  } catch {
    return {
      internalServices: new Set<string>(),
    } as any;
  }
}
/**
 * Validate environment configuration without generating files.
 */
export async function validateEnvConfig(
  repos: string[],
  ports: PortsMap,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!,
  skipCloud: boolean = false
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  classifications: Record<string, any>;
}> {
  try {
    const envManager = EnvManager.getInstance({
      projectsDir,
      ports,
      skipCloud,
    });
    await envManager.initialize(repos);

    const state = envManager.getState();
    const classifications = state.repoClassifications || {};

    return {
      valid: !envManager.hasErrors(),
      errors: envManager.getErrors(),
      warnings: envManager.getWarnings(),
      classifications,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      classifications: {},
    };
  }
}

/**
 * Get detailed information about how variables would be resolved for a specific repository.
 */
export async function analyzeRepoVariables(
  repo: string,
  ports: PortsMap,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!
): Promise<{
  classification: any;
  variableSources: Record<string, any>;
  portMapping: any;
}> {
  const envManager = EnvManager.getInstance({
    projectsDir,
    ports,
  });
  await envManager.initialize([repo]);

  const state = envManager.getState();
  const classification = state.repoClassifications?.[repo];

  // This would need to be implemented in EnvManager for full analysis
  return {
    classification,
    variableSources: {},
    portMapping: ports[repo] || null,
  };
}

// Export the EnvManager class for advanced usage
export { EnvManager } from "./EnvManager";
export { EnvError } from "./errors/EnvError";
