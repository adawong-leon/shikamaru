import path from "path";
import { PromptsManager, PromptsManagerConfig } from "./PromptsManager";
import { PromptsError } from "./errors/PromptsError";
import { GlobalConfig } from "../cli/config/GlobalConfig";
import { UnifiedConfig } from "../config/UnifiedConfig";
import type { RepoSelection, LoggingConfig } from "./types";

// Backward compatibility function
export async function selectRepos(): Promise<RepoSelection> {
  try {
    const promptsManager = new PromptsManager({
      projectsDir: GlobalConfig.getInstance().getProjectsDir()!,
    });

    // Initialize the manager
    await promptsManager.initialize();
    return await promptsManager.selectRepos();
  } catch (error) {
    if (error instanceof PromptsError) {
      throw error;
    }
    throw new PromptsError("Failed to select repositories", error);
  }
}

// New factory function
export function createPromptsManager(
  config: PromptsManagerConfig
): PromptsManager {
  return new PromptsManager(config);
}

// Full selection function (repos + watch mode)
export async function selectReposAndWatchMode(
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!
): Promise<{
  repos: RepoSelection;
  unifiedConfig: UnifiedConfig;
  loggingConfig?: LoggingConfig;
  skipCloud?: boolean;
  skipInstall?: boolean;
  cloudProviders?: string[];
  portReusePreference?: boolean;
}> {
  try {
    const globalConfig = GlobalConfig.getInstance();
    const promptsManager = new PromptsManager({
      projectsDir,
      enableProfiles: true,
      profileName: globalConfig.getProfile(),
    });

    await promptsManager.initialize();
    return await promptsManager.runFullSelection();
  } catch (error) {
    if (error instanceof PromptsError) {
      throw error;
    }
    throw new PromptsError("Failed to complete selection process", error);
  }
}

// Validation function
export async function validateRepoSelection(
  selectedRepos: RepoSelection,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: Record<string, any>;
}> {
  try {
    const promptsManager = new PromptsManager({
      projectsDir,
      enableValidation: true,
    });

    await promptsManager.initialize();
    const discoveredRepos = promptsManager.getDiscoveredRepos();

    // Create a temporary validator to check the selection
    const { RepoValidator } = await import("./validators/RepoValidator");
    const validator = new RepoValidator({
      minRepos: 1,
      maxRepos: 50,
      enableValidation: true,
      enableSearch: true,
      pageSize: 10,
    });

    const result = await validator.validateRepos(
      selectedRepos,
      discoveredRepos
    );

    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      details: result.details,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      details: { error: String(error) },
    };
  }
}

// Analysis function
export async function analyzeRepoSelection(
  selectedRepos: RepoSelection,
  projectsDir: string = GlobalConfig.getInstance().getProjectsDir()!
): Promise<{
  repos: RepoSelection;
  analysis: Record<string, any>;
  requirements: string[];
}> {
  try {
    const promptsManager = new PromptsManager({
      projectsDir,
      enableValidation: true,
    });

    await promptsManager.initialize();

    return {
      repos: selectedRepos,
      analysis: {
        repoCount: selectedRepos.length,
        hasDockerFiles: selectedRepos.some(
          (repo) =>
            repo.toLowerCase().includes("docker") ||
            repo.toLowerCase().includes("container")
        ),
        hasPackageJson: selectedRepos.some(
          (repo) =>
            repo.toLowerCase().includes("node") ||
            repo.toLowerCase().includes("js")
        ),
        complexity:
          selectedRepos.length > 5
            ? "high"
            : selectedRepos.length > 2
            ? "medium"
            : "low",
      },
      requirements: [],
    };
  } catch (error) {
    return {
      repos: selectedRepos,
      analysis: { error: String(error) },
      requirements: [],
    };
  }
}

// Utility functions
export function validateRepoName(name: string): boolean {
  if (!name || typeof name !== "string") {
    return false;
  }

  // Check for valid characters (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return false;
  }

  // Check length
  if (name.length < 1 || name.length > 100) {
    return false;
  }

  return true;
}

export function validateRepoCount(
  count: number,
  min: number = 1,
  max: number = 50
): boolean {
  return count >= min && count <= max;
}

// Export main classes and types
export { PromptsManager } from "./PromptsManager";
export { PromptsError } from "./errors/PromptsError";
export type { RepoSelection } from "./types";
