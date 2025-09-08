import { useState, useCallback } from "react";
import { LogEntry, LogStats, LogFilters } from "../types";
import { filterLogs } from "../utils/logUtils";
import { TerminalLogger } from "../services/TerminalLogger";
import {
  LoggingConfig,
  loadLoggingConfig,
  isTerminalLoggingEnabled,
  isWebUiLoggingEnabled,
  shouldLog,
} from "../config/logging";

export interface UseLogsReturn {
  logs: LogEntry[];
  stats: LogStats;
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  updateStats: (logEntry: LogEntry) => void;
  getFilteredLogs: (filters: LogFilters) => LogEntry[];
  loggingConfig: LoggingConfig;
  updateLoggingConfig: (config: LoggingConfig) => void;
}

const createErrorLog = (errorMessage: string): LogEntry => ({
  id: `error-${Date.now()}`,
  serviceName: "system",
  timestamp: new Date().toISOString(),
  message: `Connection failed: ${errorMessage}. Make sure ProcessExpressAPI is running on port 3015.`,
  level: "error",
});

export const useLogs = (): UseLogsReturn => {
  // Initialize logging configuration
  const [loggingConfig, setLoggingConfig] =
    useState<LoggingConfig>(loadLoggingConfig);
  const [isLoggingEnabled, setIsLoggingEnabled] = useState(true);

  const terminalLogger = useCallback(
    () => new TerminalLogger(loggingConfig),
    [loggingConfig]
  );

  // Initialize logs from localStorage or empty array
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const savedLogs = localStorage.getItem("react-log-viewer-logs");
      const parsedLogs = savedLogs ? JSON.parse(savedLogs) : [];
      console.log(
        "Initialized logs from localStorage:",
        parsedLogs.length,
        "logs"
      );
      return parsedLogs;
    } catch (error) {
      console.error("Failed to load logs from localStorage:", error);
      return [];
    }
  });

  // Initialize stats from localStorage or default values
  const [stats, setStats] = useState<LogStats>(() => {
    try {
      const savedStats = localStorage.getItem("react-log-viewer-stats");
      if (savedStats) {
        const parsedStats = JSON.parse(savedStats);
        // Convert services back to Set
        parsedStats.services = new Set(parsedStats.services || []);
        return parsedStats;
      }
    } catch (error) {
      console.error("Failed to load stats from localStorage:", error);
    }

    return {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0,
      services: new Set(),
    };
  });

  // Save logs to localStorage with limit
  const saveLogsToStorage = useCallback((newLogs: LogEntry[]) => {
    try {
      // Limit to last 1000 logs to prevent localStorage from getting too large
      const logsToSave = newLogs.slice(-1000);
      localStorage.setItem("react-log-viewer-logs", JSON.stringify(logsToSave));
    } catch (error) {
      console.error("Failed to save logs to localStorage:", error);
    }
  }, []);

  // Save stats to localStorage
  const saveStatsToStorage = useCallback((newStats: LogStats) => {
    try {
      const statsToSave = {
        ...newStats,
        services: Array.from(newStats.services), // Convert Set to Array for JSON serialization
      };
      localStorage.setItem(
        "react-log-viewer-stats",
        JSON.stringify(statsToSave)
      );
    } catch (error) {
      console.error("Failed to save stats to localStorage:", error);
    }
  }, []);

  const updateStats = useCallback(
    (logEntry: LogEntry) => {
      setStats((prev) => {
        const newStats = { ...prev };
        newStats.total += 1;
        newStats.services.add(logEntry.serviceName);

        switch (logEntry.level) {
          case "error":
            newStats.errors += 1;
            break;
          case "warn":
            newStats.warnings += 1;
            break;
          case "info":
            newStats.info += 1;
            break;
          case "debug":
            newStats.debug += 1;
            break;
        }

        console.log("Updated stats:", newStats);
        saveStatsToStorage(newStats);
        return newStats;
      });
    },
    [saveStatsToStorage]
  );

  const addLog = useCallback(
    (log: LogEntry) => {
      // Only process logs if logging is enabled
      if (!isLoggingEnabled) {
        console.log("Logging disabled, skipping log:", log);
        return;
      }

      console.log("Adding log:", log);
      console.log("Log HTML content:", log.html);

      // Check if we should log to terminal
      if (
        isTerminalLoggingEnabled(loggingConfig) &&
        shouldLog(loggingConfig.terminal.level, log.level)
      ) {
        const logger = terminalLogger();
        logger.log(log);
      }

      // Only add to web UI logs if web UI logging is enabled
      if (
        isWebUiLoggingEnabled(loggingConfig) &&
        shouldLog(loggingConfig.webUi.level, log.level)
      ) {
        setLogs((prev) => {
          const processedLog = {
            ...log,
            // Only parse if not already parsed by backend
            parsed: log.parsed || parseLogLikeGrafana(log.message),
          };
          const newLogs = [...prev, processedLog];
          saveLogsToStorage(newLogs);
          return newLogs;
        });

        // Update stats when a log is added to web UI
        updateStats(log);
      }
    },
    [
      updateStats,
      saveLogsToStorage,
      loggingConfig,
      terminalLogger,
      isLoggingEnabled,
    ]
  );

  const normalizeLogMessage = (input: string): string => {
    if (!input) return "";
    // Remove line breaks, extra spaces, and normalize whitespace
    return input
      .replace(/\r?\n/g, " ") // Replace line breaks with spaces
      .replace(
        // matches ANSI sequences like \x1b[32m
        /\x1B\[[0-9;]*[A-Za-z]/g,
        ""
      )
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing spaces
  };

  const parseLogLikeGrafana = (message: string): any => {
    if (!message) return null;

    try {
      // Try to parse as JSON first
      const json = JSON.parse(message);
      return {
        type: "json",
        data: json,
        level: json.level || json.severity || json.loglevel,
        message: normalizeLogMessage(json.message || json.msg || json.text),
        timestamp: json.timestamp || json.time || json.ts,
        service: json.service || json.app || json.application,
        trace: json.trace || json.traceId || json.requestId,
        error: json.error || json.err,
        metadata: extractMetadata(json),
      };
    } catch {
      // If not JSON, try to extract structured data from text
      console.log("not json", message);
      return {
        type: "text",
        data: message,
        level: extractLevelFromText(message),
        message: normalizeLogMessage(message),
        timestamp: extractTimestampFromText(message),
        service: extractServiceFromText(message),
        trace: extractTraceFromText(message),
        error: extractErrorFromText(message),
        metadata: extractMetadataFromText(message),
      };
    }
  };

  const extractMetadata = (json: any): Record<string, any> => {
    const metadata: Record<string, any> = {};
    const excludeKeys = [
      "level",
      "message",
      "timestamp",
      "service",
      "trace",
      "error",
      "severity",
      "loglevel",
      "msg",
      "text",
      "time",
      "ts",
      "app",
      "application",
      "traceId",
      "requestId",
      "err",
    ];

    for (const [key, value] of Object.entries(json)) {
      if (!excludeKeys.includes(key) && value !== undefined && value !== null) {
        metadata[key] = value;
      }
    }

    return metadata;
  };

  const extractLevelFromText = (text: string): string => {
    const levelPatterns = [
      /error|ERROR/i,
      /warn|WARN|warning/i,
      /info|INFO/i,
      /debug|DEBUG/i,
      /trace|TRACE/i,
    ];

    for (const pattern of levelPatterns) {
      if (pattern.test(text)) {
        return text.match(pattern)?.[0]?.toLowerCase() || "info";
      }
    }

    return "info";
  };

  const extractTimestampFromText = (text: string): string | null => {
    // ISO timestamp patterns
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/;
    const match = text.match(isoPattern);
    return match ? match[0] : null;
  };

  const extractServiceFromText = (text: string): string | null => {
    // Look for service names in brackets or after common patterns
    const patterns = [
      /\[([^\]]+)\]/,
      /service[:\s]+([^\s,]+)/i,
      /app[:\s]+([^\s,]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  const extractTraceFromText = (text: string): string | null => {
    const patterns = [
      /trace[:\s]+([a-f0-9-]+)/i,
      /request[:\s]+([a-f0-9-]+)/i,
      /id[:\s]+([a-f0-9-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  const extractErrorFromText = (text: string): string | null => {
    const errorPattern = /error[:\s]+([^,\n]+)/i;
    const match = text.match(errorPattern);
    return match ? match[1].trim() : null;
  };

  const extractMetadataFromText = (text: string): Record<string, any> => {
    const metadata: Record<string, any> = {};

    // Extract key-value pairs
    const kvPattern = /(\w+)[:\s=]+([^,\s\n]+)/g;
    let match;

    while ((match = kvPattern.exec(text)) !== null) {
      const [, key, value] = match;
      if (
        !["error", "level", "service", "trace", "timestamp"].includes(
          key.toLowerCase()
        )
      ) {
        metadata[key] = value;
      }
    }

    return metadata;
  };

  const clearLogs = useCallback(() => {
    console.log("Clearing logs from state and localStorage...");

    // Only clear web UI logs if web UI logging is enabled
    // Clear state
    setLogs([]);
    const emptyStats: LogStats = {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0,
      services: new Set<string>(),
    };
    setStats(emptyStats);

    // Clear localStorage
    try {
      localStorage.removeItem("react-log-viewer-logs");
      localStorage.removeItem("react-log-viewer-stats");
      console.log("localStorage cleared successfully");
    } catch (error) {
      console.error("Failed to clear localStorage:", error);
    }
  }, [loggingConfig]);

  const getFilteredLogs = useCallback(
    (filters: LogFilters) => {
      return filterLogs(logs, filters);
    },
    [logs]
  );

  const updateLoggingConfig = useCallback(
    (newConfig: LoggingConfig) => {
      const oldConfig = loggingConfig;
      setLoggingConfig(newConfig);
      // Enable logging when configuration is updated
      setIsLoggingEnabled(true);

      // Web UI is the only destination; no terminal-only branch
    },
    [loggingConfig]
  );

  console.log(
    "useLogs initialized with logs:",
    logs,
    "isLoggingEnabled:",
    isLoggingEnabled,
    "loggingConfig:",
    loggingConfig
  );

  return {
    logs,
    stats,
    addLog,
    clearLogs,
    updateStats,
    getFilteredLogs,
    loggingConfig,
    updateLoggingConfig,
  };
};

export { createErrorLog };
