export class EnvError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, cause?: any, code: string = "ENV_ERROR") {
    super(message);
    this.name = "EnvError";
    this.code = code;
    this.details = cause;

    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }

  static fromAzureError(error: any): EnvError {
    return new EnvError(
      `Azure API error: ${error.message || error}`,
      error,
      "AZURE_ERROR"
    );
  }

  static fromCloudError(error: any, provider: string): EnvError {
    return new EnvError(
      `${provider} API error: ${error.message || error}`,
      error,
      `${provider.toUpperCase()}_ERROR`
    );
  }

  static fromFileError(error: any, filepath: string): EnvError {
    return new EnvError(
      `File operation failed for ${filepath}: ${error.message || error}`,
      error,
      "FILE_ERROR"
    );
  }

  static fromConfigError(error: any): EnvError {
    return new EnvError(
      `Configuration error: ${error.message || error}`,
      error,
      "CONFIG_ERROR"
    );
  }

  static fromValidationError(message: string, details?: any): EnvError {
    return new EnvError(message, details, "VALIDATION_ERROR");
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
