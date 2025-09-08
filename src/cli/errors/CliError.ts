// CLI Error Handling

export class CliError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestions?: string[],
    public details?: any
  ) {
    super(message);
    this.name = "CliError";
  }

  static fromValidationError(message: string, details?: any): CliError {
    return new CliError(message, "VALIDATION_ERROR", undefined, details);
  }

  static fromEnvironmentError(message: string, suggestions?: string[]): CliError {
    return new CliError(message, "ENVIRONMENT_ERROR", suggestions);
  }

  static fromConfigurationError(message: string, details?: any): CliError {
    return new CliError(message, "CONFIGURATION_ERROR", undefined, details);
  }

  static fromExecutionError(message: string, details?: any): CliError {
    return new CliError(message, "EXECUTION_ERROR", undefined, details);
  }

  static fromNodeVersionError(version: string): CliError {
    return new CliError(
      `Node.js version ${version} is not supported. Please use Node.js 18 or higher.`,
      "NODE_VERSION_UNSUPPORTED",
      ["Upgrade Node.js to version 18 or higher"]
    );
  }

  static fromProjectsDirError(path: string): CliError {
    return new CliError(
      `Projects directory not found: ${path}`,
      "PROJECTS_DIR_NOT_FOUND",
      [
        "Set the correct PROJECTS_DIR environment variable",
        "Create the projects directory",
      ]
    );
  }

  static fromUnsupportedModeError(mode: string): CliError {
    return new CliError(
      `Unsupported watch mode: ${mode}`,
      "UNSUPPORTED_MODE",
      ["Use one of: local, docker, hybrid"]
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      suggestions: this.suggestions,
      details: this.details,
      stack: this.stack,
    };
  }
}
