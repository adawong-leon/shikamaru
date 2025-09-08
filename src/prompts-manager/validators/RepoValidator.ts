import { ValidationResult, RepoSelection, PromptsConfig } from "../types";
import { PromptsError } from "../errors/PromptsError";

export class RepoValidator {
  constructor(private config: PromptsConfig) {}

  async validateRepos(
    selectedRepos: RepoSelection,
    discoveredRepos: string[]
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: Record<string, any> = {};

    try {
      // Validate count
      if (
        !this.validateRepoCount(
          selectedRepos.length,
          this.config.minRepos,
          this.config.maxRepos
        )
      ) {
        errors.push(
          `Invalid number of repositories: ${selectedRepos.length} (must be between ${this.config.minRepos} and ${this.config.maxRepos})`
        );
      }

      // Validate each repo name
      const invalidRepos = selectedRepos.filter(
        (repo) => !this.validateRepoName(repo)
      );
      if (invalidRepos.length > 0) {
        errors.push(`Invalid repository names: ${invalidRepos.join(", ")}`);
      }

      // Check if all selected repos exist in discovered repos
      const missingRepos = selectedRepos.filter(
        (repo) => !discoveredRepos.includes(repo)
      );
      if (missingRepos.length > 0) {
        errors.push(`Repositories not found: ${missingRepos.join(", ")}`);
      }

      // Check for duplicates
      const duplicates = this.findDuplicates(selectedRepos);
      if (duplicates.length > 0) {
        errors.push(
          `Duplicate repositories selected: ${duplicates.join(", ")}`
        );
      }

      // Check for potential issues
      if (selectedRepos.length > 10) {
        warnings.push(
          `Large selection detected: ${selectedRepos.length} repositories selected`
        );
      }

      // Check for similar repo names (potential confusion)
      const similarRepos = this.findSimilarRepos(selectedRepos);
      if (similarRepos.length > 0) {
        warnings.push(
          `Similar repository names detected: ${similarRepos.join(", ")}`
        );
      }

      details.selectedCount = selectedRepos.length;
      details.discoveredCount = discoveredRepos.length;
      details.invalidRepos = invalidRepos;
      details.missingRepos = missingRepos;
      details.duplicates = duplicates;
      details.similarRepos = similarRepos;

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        details,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [String(error)],
        warnings: [],
        details: { error: String(error) },
      };
    }
  }

  validateRepoName(name: string): boolean {
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

    // Check for reserved names
    if (this.isReservedRepoName(name)) {
      return false;
    }

    return true;
  }

  validateRepoCount(count: number, min: number, max: number): boolean {
    return count >= min && count <= max;
  }

  private findDuplicates(array: string[]): string[] {
    const counts: Record<string, number> = {};
    const duplicates: string[] = [];

    for (const item of array) {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] === 2) {
        duplicates.push(item);
      }
    }

    return duplicates;
  }

  private findSimilarRepos(repos: string[]): string[] {
    const similar: string[] = [];

    for (let i = 0; i < repos.length; i++) {
      for (let j = i + 1; j < repos.length; j++) {
        const similarity = this.calculateSimilarity(repos[i], repos[j]);
        if (similarity > 0.8) {
          // 80% similarity threshold
          similar.push(`${repos[i]} ~ ${repos[j]}`);
        }
      }
    }

    return similar;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private isReservedRepoName(name: string): boolean {
    const reservedNames = [
      "node_modules",
      ".git",
      ".github",
      ".vscode",
      "dist",
      "build",
      "coverage",
      "test",
      "tests",
      "docs",
      "documentation",
      "examples",
      "samples",
      "demo",
      "demos",
      "temp",
      "tmp",
      "cache",
      "logs",
      "backup",
      "backups",
    ];

    return reservedNames.includes(name.toLowerCase());
  }
}
