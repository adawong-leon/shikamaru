import { LogEntry } from "../types";
import { LoggingConfig, shouldLog } from "../config/logging";

export class TerminalLogger {
  private config: LoggingConfig;

  constructor(config: LoggingConfig) {
    this.config = config;
  }

  updateConfig(config: LoggingConfig) {
    this.config = config;
  }

  private getTimestamp(): string {
    if (!this.config.terminal.timestamp) return "";
    return `[${new Date().toISOString()}] `;
  }

  private getLevelColor(level: string): string {
    if (!this.config.terminal.colors) return "";

    switch (level.toLowerCase()) {
      case "error":
        return "%c";
      case "warn":
        return "%c";
      case "info":
        return "%c";
      case "debug":
        return "%c";
      default:
        return "%c";
    }
  }

  private getLevelStyle(level: string): string {
    if (!this.config.terminal.colors) return "";

    switch (level.toLowerCase()) {
      case "error":
        return "color: #ef4444; font-weight: bold;";
      case "warn":
        return "color: #f59e0b; font-weight: bold;";
      case "info":
        return "color: #3b82f6; font-weight: bold;";
      case "debug":
        return "color: #6b7280; font-weight: bold;";
      default:
        return "color: #000000;";
    }
  }

  private formatMessage(log: LogEntry): string {
    const timestamp = this.getTimestamp();
    const service = log.serviceName ? `[${log.serviceName}] ` : "";
    const level = `[${log.level.toUpperCase()}] `;
    const message = log.message || "";

    return `${timestamp}${service}${level}${message}`;
  }

  log(log: LogEntry): void {
    if (!shouldLog(this.config.terminal.level, log.level)) {
      return;
    }

    const formattedMessage = this.formatMessage(log);
    const color = this.getLevelColor(log.level);
    const style = this.getLevelStyle(log.level);

    if (this.config.terminal.colors) {
      console.log(color + formattedMessage, style);
    } else {
      console.log(formattedMessage);
    }

    // Log additional data if available
    if (log.parsed && Object.keys(log.parsed).length > 0) {
      console.group("Additional Data");
      console.log("Parsed:", log.parsed);
      console.groupEnd();
    }
  }

  // Convenience methods for different log levels
  debug(message: string, serviceName?: string): void {
    this.log({
      id: `debug-${Date.now()}`,
      serviceName: serviceName || "system",
      timestamp: new Date().toISOString(),
      message,
      level: "debug",
    });
  }

  info(message: string, serviceName?: string): void {
    this.log({
      id: `info-${Date.now()}`,
      serviceName: serviceName || "system",
      timestamp: new Date().toISOString(),
      message,
      level: "info",
    });
  }

  warn(message: string, serviceName?: string): void {
    this.log({
      id: `warn-${Date.now()}`,
      serviceName: serviceName || "system",
      timestamp: new Date().toISOString(),
      message,
      level: "warn",
    });
  }

  error(message: string, serviceName?: string): void {
    this.log({
      id: `error-${Date.now()}`,
      serviceName: serviceName || "system",
      timestamp: new Date().toISOString(),
      message,
      level: "error",
    });
  }

  // Log multiple entries
  logMultiple(logs: LogEntry[]): void {
    logs.forEach((log) => this.log(log));
  }

  // Clear terminal (not really possible in browser, but we can log a separator)
  clear(): void {
    console.clear();
    console.log(
      "%c=== Terminal Cleared ===",
      "color: #6b7280; font-style: italic;"
    );
  }
}
