import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { LogEntry, LogStats, LogFilters } from "../types";
import { LogIndexer, FilterOptions } from "../utils/LogIndexer";
import { LogCompressor, CompressedLogData } from "../utils/LogCompressor";
import { useDebounce, useThrottle } from "./usePerformance";
import {
  LoggingConfig,
  loadLoggingConfig,
  isWebUiLoggingEnabled,
  shouldLog,
} from "../config/logging";

export interface UseOptimizedLogsReturn {
  logs: LogEntry[];
  stats: LogStats;
  addLog: (log: LogEntry) => void;
  addLogs: (logs: LogEntry[]) => void;
  clearLogs: () => void;
  updateStats: (logEntry: LogEntry) => void;
  getFilteredLogs: (filters: LogFilters) => LogEntry[];
  searchLogs: (query: string, options?: any) => LogEntry[];
  loggingConfig: LoggingConfig;
  updateLoggingConfig: (config: LoggingConfig) => void;
  // Advanced features
  compressLogs: () => void;
  decompressLogs: () => void;
  getIndexStats: () => any;
  optimizeStorage: () => void;
  // Performance monitoring
  getPerformanceStats: () => {
    memoryUsage: number;
    indexSize: number;
    compressionRatio: number;
    renderTime: number;
  };
}

export const useOptimizedLogs = (): UseOptimizedLogsReturn => {
  // Initialize logging configuration
  const [loggingConfig, setLoggingConfig] =
    useState<LoggingConfig>(loadLoggingConfig);
  const [isLoggingEnabled, setIsLoggingEnabled] = useState(() => {
    try {
      const savedConfig = localStorage.getItem(
        "react-log-viewer-logging-config"
      );
      return savedConfig !== null;
    } catch {
      return false;
    }
  });

  // Performance monitoring
  const renderStartTime = useRef<number>(0);
  const [performanceStats, setPerformanceStats] = useState({
    memoryUsage: 0,
    indexSize: 0,
    compressionRatio: 0,
    renderTime: 0,
  });

  // Initialize optimized components
  const logIndexer = useMemo(() => new LogIndexer(), []);
  const logCompressor = useMemo(
    () =>
      new LogCompressor({
        maxLogs: 50000,
        compressionRatio: 0.6,
        preserveRecent: 2000,
        enableDeduplication: true,
      }),
    []
  );

  // Initialize logs with compression support
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const savedLogs = localStorage.getItem("react-log-viewer-logs");
      const compressedData = localStorage.getItem(
        "react-log-viewer-compressed-logs"
      );

      if (compressedData) {
        const parsed: CompressedLogData = JSON.parse(compressedData);
        const decompressedLogs = logCompressor.decompress(parsed);
        logIndexer.setLogs(decompressedLogs);
        return decompressedLogs;
      } else if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        logIndexer.setLogs(parsedLogs);
        return parsedLogs;
      }

      return [];
    } catch (error) {
      console.error("Failed to load logs:", error);
      return [];
    }
  });

  // Initialize stats
  const [stats, setStats] = useState<LogStats>(() => {
    try {
      const savedStats = localStorage.getItem("react-log-viewer-stats");
      if (savedStats) {
        const parsedStats = JSON.parse(savedStats);
        parsedStats.services = new Set(parsedStats.services || []);
        return parsedStats;
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
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

  // Debounced save functions
  const debouncedSaveLogs = useDebounce((newLogs: LogEntry[]) => {
    // Don't save if logs array is empty (after clearing)
    if (newLogs.length === 0) {
      console.log("🚫 Skipping save - logs array is empty");
      return;
    }

    try {
      const logsToSave = newLogs.slice(-10000); // Limit to last 10k logs
      localStorage.setItem("react-log-viewer-logs", JSON.stringify(logsToSave));
      console.log(`💾 Saved ${logsToSave.length} logs to localStorage`);
    } catch (error) {
      console.error("Failed to save logs:", error);
    }
  }, 1000);

  const debouncedSaveStats = useDebounce((newStats: LogStats) => {
    try {
      const statsToSave = {
        ...newStats,
        services: Array.from(newStats.services),
      };
      localStorage.setItem(
        "react-log-viewer-stats",
        JSON.stringify(statsToSave)
      );
    } catch (error) {
      console.error("Failed to save stats:", error);
    }
  }, 500);

  // Throttled index update
  const throttledIndexUpdate = useThrottle((newLogs: LogEntry[]) => {
    logIndexer.setLogs(newLogs);
    updatePerformanceStats();
  }, 2000);

  // Update performance stats
  const updatePerformanceStats = useCallback(() => {
    const memoryInfo = (performance as any).memory;
    const memoryUsage = memoryInfo
      ? memoryInfo.usedJSHeapSize / 1024 / 1024
      : 0; // MB
    const indexStats = logIndexer.getStats();

    setPerformanceStats((prev) => ({
      ...prev,
      memoryUsage,
      indexSize: indexStats.indexSize,
      compressionRatio: 0, // Will be updated when compression is used
      renderTime: performance.now() - renderStartTime.current,
    }));
  }, [logIndexer]);

  // Update stats
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

        debouncedSaveStats(newStats);
        return newStats;
      });
    },
    [debouncedSaveStats]
  );

  // Optimized add log function
  const addLog = useCallback(
    (log: LogEntry) => {
      if (!isLoggingEnabled) return;

      renderStartTime.current = performance.now();

      // Only add to web UI logs if web UI logging is enabled
      if (
        isWebUiLoggingEnabled(loggingConfig) &&
        shouldLog(loggingConfig.webUi.level, log.level)
      ) {
        setLogs((prev) => {
          const processedLog = {
            ...log,
            parsed: log.parsed || parseLogLikeGrafana(log.message),
          };
          const newLogs = [...prev, processedLog];

          // Limit logs to prevent memory issues
          const limitedLogs = newLogs.slice(-50000);

          debouncedSaveLogs(limitedLogs);
          throttledIndexUpdate(limitedLogs);

          return limitedLogs;
        });

        updateStats(log);
      }
    },
    [
      updateStats,
      debouncedSaveLogs,
      throttledIndexUpdate,
      loggingConfig,
      isLoggingEnabled,
    ]
  );

  // Batch add logs function
  const addLogs = useCallback(
    (newLogs: LogEntry[]) => {
      if (!isLoggingEnabled || newLogs.length === 0) return;

      renderStartTime.current = performance.now();

      setLogs((prev) => {
        const processedLogs = newLogs.map((log) => ({
          ...log,
          parsed: log.parsed || parseLogLikeGrafana(log.message),
        }));

        const combinedLogs = [...prev, ...processedLogs];
        const limitedLogs = combinedLogs.slice(-50000);

        debouncedSaveLogs(limitedLogs);
        throttledIndexUpdate(limitedLogs);

        return limitedLogs;
      });

      // Update stats for all logs
      newLogs.forEach(updateStats);
    },
    [updateStats, debouncedSaveLogs, throttledIndexUpdate, isLoggingEnabled]
  );

  // Clear logs
  const clearLogs = useCallback(() => {
    console.log("🧹 Clearing logs...");

    // Always clear logs regardless of config
    setLogs([]);
    logIndexer.clear();

    const emptyStats: LogStats = {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0,
      services: new Set<string>(),
    };
    setStats(emptyStats);

    // Clear all localStorage keys related to logs
    try {
      const keysToRemove = [
        "react-log-viewer-logs",
        "react-log-viewer-compressed-logs",
        "react-log-viewer-stats",
        "react-log-viewer-user-id",
        "react-log-viewer-session-start",
      ];

      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
        console.log(`✅ Removed ${key} from localStorage`);
      });

      // Also clear any keys that might have been created by the old system
      const allKeys = Object.keys(localStorage);
      allKeys.forEach((key) => {
        if (key.startsWith("react-log-viewer-")) {
          localStorage.removeItem(key);
          console.log(`✅ Removed legacy key: ${key}`);
        }
      });

      console.log("🎉 All logs cleared from localStorage");
    } catch (error) {
      console.error("❌ Failed to clear localStorage:", error);
    }

    // Force update performance stats
    updatePerformanceStats();
  }, [loggingConfig, logIndexer, updatePerformanceStats]);

  // Advanced filtering
  const getFilteredLogs = useCallback(
    (filters: LogFilters) => {
      const filterOptions: FilterOptions = {
        services: filters.services.length > 0 ? filters.services : undefined,
        levels: filters.levels.length > 0 ? filters.levels : undefined,
        search: filters.search || undefined,
        searchOptions: {
          caseSensitive: false,
          wholeWord: false,
          regex: false,
          fuzzy: false,
          maxResults: 10000,
        },
      };

      return logIndexer.filter(filterOptions);
    },
    [logIndexer]
  );

  // Advanced search
  const searchLogs = useCallback(
    (query: string, options: any = {}) => {
      return logIndexer.search(query, {
        caseSensitive: false,
        wholeWord: false,
        regex: false,
        fuzzy: false,
        maxResults: 10000,
        ...options,
      });
    },
    [logIndexer]
  );

  // Compression functions
  const compressLogs = useCallback(() => {
    try {
      const compressedData = logCompressor.compress(logs);
      localStorage.setItem(
        "react-log-viewer-compressed-logs",
        JSON.stringify(compressedData)
      );
      localStorage.removeItem("react-log-viewer-logs");

      const compressionStats = logCompressor.getStats(compressedData);
      setPerformanceStats((prev) => ({
        ...prev,
        compressionRatio: compressionStats.compressionRatio,
      }));

      console.log("Logs compressed:", compressionStats);
    } catch (error) {
      console.error("Failed to compress logs:", error);
    }
  }, [logs, logCompressor]);

  const decompressLogs = useCallback(() => {
    try {
      const compressedData = localStorage.getItem(
        "react-log-viewer-compressed-logs"
      );
      if (compressedData) {
        const parsed: CompressedLogData = JSON.parse(compressedData);
        const decompressedLogs = logCompressor.decompress(parsed);

        setLogs(decompressedLogs);
        logIndexer.setLogs(decompressedLogs);
        localStorage.setItem(
          "react-log-viewer-logs",
          JSON.stringify(decompressedLogs)
        );
        localStorage.removeItem("react-log-viewer-compressed-logs");

        console.log("Logs decompressed:", decompressedLogs.length, "entries");
      }
    } catch (error) {
      console.error("Failed to decompress logs:", error);
    }
  }, [logCompressor, logIndexer]);

  // Get index stats
  const getIndexStats = useCallback(() => {
    return logIndexer.getStats();
  }, [logIndexer]);

  // Optimize storage
  const optimizeStorage = useCallback(() => {
    if (logs.length > 10000) {
      compressLogs();
    }
  }, [logs.length, compressLogs]);

  // Get performance stats
  const getPerformanceStats = useCallback(() => {
    return performanceStats;
  }, [performanceStats]);

  // Update logging config
  const updateLoggingConfig = useCallback(
    (newConfig: LoggingConfig) => {
      const oldConfig = loggingConfig;
      setLoggingConfig(newConfig);
      setIsLoggingEnabled(true);

      if (
        isWebUiLoggingEnabled(oldConfig) &&
        !isWebUiLoggingEnabled(newConfig)
      ) {
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
      }
    },
    [loggingConfig]
  );

  // Parse log like Grafana (simplified version)
  const parseLogLikeGrafana = (message: string): any => {
    if (!message) return null;

    try {
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

  // Helper functions (simplified versions)
  const normalizeLogMessage = (input: string): string => {
    if (!input) return "";
    return input
      .replace(/\r?\n/g, " ")
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
      .replace(/\s+/g, " ")
      .trim();
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
      { pattern: /error|ERROR/i, level: "error" },
      { pattern: /warn|WARN|warning/i, level: "warn" },
      { pattern: /info|INFO/i, level: "info" },
      { pattern: /debug|DEBUG/i, level: "debug" },
      { pattern: /trace|TRACE/i, level: "trace" },
    ];

    for (const { pattern, level } of levelPatterns) {
      if (pattern.test(text)) {
        return level;
      }
    }

    return "info";
  };

  const extractTimestampFromText = (text: string): string | null => {
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/;
    const match = text.match(isoPattern);
    return match ? match[0] : null;
  };

  const extractServiceFromText = (text: string): string | null => {
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

  // Add global utility function for manual localStorage clearing
  useEffect(() => {
    // Make clearLogs available globally for debugging
    (window as any).clearLogViewerStorage = () => {
      console.log("🧹 Manual localStorage clear triggered");
      try {
        const keysToRemove = [
          "react-log-viewer-logs",
          "react-log-viewer-compressed-logs",
          "react-log-viewer-stats",
          "react-log-viewer-user-id",
          "react-log-viewer-session-start",
          "react-log-viewer-logging-config",
        ];

        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
          console.log(`✅ Removed ${key}`);
        });

        // Clear all react-log-viewer keys
        const allKeys = Object.keys(localStorage);
        allKeys.forEach((key) => {
          if (key.startsWith("react-log-viewer-")) {
            localStorage.removeItem(key);
            console.log(`✅ Removed legacy key: ${key}`);
          }
        });

        console.log("🎉 Manual localStorage clear completed");
        console.log("🔄 Please refresh the page to see changes");
      } catch (error) {
        console.error("❌ Manual clear failed:", error);
      }
    };

    // Make getStorageInfo available globally for debugging
    (window as any).getLogViewerStorageInfo = () => {
      const keys = [
        "react-log-viewer-logs",
        "react-log-viewer-compressed-logs",
        "react-log-viewer-stats",
        "react-log-viewer-user-id",
        "react-log-viewer-session-start",
        "react-log-viewer-logging-config",
      ];

      const info: Record<string, any> = {};
      keys.forEach((key) => {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            info[key] = {
              exists: true,
              size: value.length,
              preview:
                value.length > 100 ? value.substring(0, 100) + "..." : value,
            };
          } else {
            info[key] = { exists: false };
          }
        } catch (e: any) {
          info[key] = { exists: false, error: e.message };
        }
      });

      console.table(info);
      return info;
    };

    console.log("🛠️ Debug utilities available:");
    console.log("  - clearLogViewerStorage() - Clear all localStorage");
    console.log("  - getLogViewerStorageInfo() - Show storage info");
  }, []);

  return {
    logs,
    stats,
    addLog,
    addLogs,
    clearLogs,
    updateStats,
    getFilteredLogs,
    searchLogs,
    loggingConfig,
    updateLoggingConfig,
    compressLogs,
    decompressLogs,
    getIndexStats,
    optimizeStorage,
    getPerformanceStats,
  };
};
