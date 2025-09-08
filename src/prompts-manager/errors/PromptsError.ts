export class PromptsError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, cause?: any, code: string = "PROMPTS_ERROR") {
    super(message);
    this.name = "PromptsError";
    this.code = code;
    this.details = cause;

    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }

  static fromValidationError(message: string, details?: any): PromptsError {
    return new PromptsError(message, details, "VALIDATION_ERROR");
  }

  static fromNoReposError(projectsDir: string): PromptsError {
    return new PromptsError(
      `No repositories with .env.example found in ${projectsDir}`,
      { projectsDir },
      "NO_REPOS_FOUND"
    );
  }

  static fromInvalidSelectionError(
    selected: number,
    min: number,
    max: number
  ): PromptsError {
    return new PromptsError(
      `Invalid selection: ${selected} repos selected (must be between ${min} and ${max})`,
      { selected, min, max },
      "INVALID_SELECTION"
    );
  }

  static fromInvalidRepoNameError(repoName: string): PromptsError {
    return new PromptsError(
      `Invalid repository name: ${repoName}`,
      { repoName },
      "INVALID_REPO_NAME"
    );
  }

  static fromWatchModeError(
    mode: string,
    selectedRepos: string[]
  ): PromptsError {
    return new PromptsError(
      `Invalid watch mode: ${mode} for selected repos`,
      { mode, selectedRepos },
      "INVALID_WATCH_MODE"
    );
  }

  static fromUserCancellationError(): PromptsError {
    return new PromptsError(
      "User cancelled the selection process",
      null,
      "USER_CANCELLED"
    );
  }

  static fromPromptError(error: any, promptType: string): PromptsError {
    return new PromptsError(
      `Failed to display ${promptType} prompt: ${error.message || error}`,
      error,
      "PROMPT_ERROR"
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}
