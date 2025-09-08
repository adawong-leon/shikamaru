// Hybrid Mode Error Handling

export class HybridError extends Error {
  constructor(
    message: string,
    public code: string,
    public service?: string,
    public details?: any
  ) {
    super(message);
    this.name = "HybridError";
  }

  static fromInfraStartError(service: string, error: any): HybridError {
    return new HybridError(
      `Failed to start infrastructure service: ${service}`,
      "INFRA_START_ERROR",
      service,
      error
    );
  }

  static fromHealthCheckError(service: string, error: any): HybridError {
    return new HybridError(
      `Health check failed for service: ${service}`,
      "HEALTH_CHECK_ERROR",
      service,
      error
    );
  }

  static fromServiceStartError(service: string, error: any): HybridError {
    return new HybridError(
      `Failed to start application service: ${service}`,
      "SERVICE_START_ERROR",
      service,
      error
    );
  }

  static fromComposeGenerationError(error: any): HybridError {
    return new HybridError(
      "Failed to generate Docker Compose configuration",
      "COMPOSE_GENERATION_ERROR",
      undefined,
      error
    );
  }

  static fromDockerCommandError(command: string, error: any): HybridError {
    return new HybridError(
      `Docker command failed: ${command}`,
      "DOCKER_COMMAND_ERROR",
      undefined,
      error
    );
  }

  static fromConfigurationError(message: string, details?: any): HybridError {
    return new HybridError(
      `Configuration error: ${message}`,
      "CONFIGURATION_ERROR",
      undefined,
      details
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      service: this.service,
      details: this.details,
      stack: this.stack,
    };
  }
}
