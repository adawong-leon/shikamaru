export class PortsError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, cause?: any, code: string = "PORTS_ERROR") {
    super(message);
    this.name = "PortsError";
    this.code = code;
    this.details = cause;

    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }

  static fromFileError(error: any, filepath: string): PortsError {
    return new PortsError(
      `File operation failed for ${filepath}: ${error.message || error}`,
      error,
      "FILE_ERROR"
    );
  }

  static fromValidationError(message: string, details?: any): PortsError {
    return new PortsError(message, details, "VALIDATION_ERROR");
  }

  static fromConflictError(
    service1: string,
    service2: string,
    port: number
  ): PortsError {
    return new PortsError(
      `Port conflict detected: ${service1} and ${service2} both use port ${port}`,
      { service1, service2, port },
      "CONFLICT_ERROR"
    );
  }

  static fromPortRangeError(min: number, max: number): PortsError {
    return new PortsError(
      `Invalid port range: ${min}-${max}. Must be between 1024-65535 and min < max`,
      { min, max },
      "PORT_RANGE_ERROR"
    );
  }

  static fromPortInUseError(port: number, service?: string): PortsError {
    const message = service
      ? `Port ${port} is already in use by ${service}`
      : `Port ${port} is already in use`;
    return new PortsError(message, { port, service }, "PORT_IN_USE");
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
