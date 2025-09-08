// Logging configuration for React Log Viewer
// Allows users to choose between terminal and web UI logging destinations

export type LoggingDestination = "web-ui";

export interface WebUIStyling {
  fontSize: "xs" | "sm" | "base" | "lg" | "xl";
  lineHeight: "tight" | "normal" | "relaxed";
  showTimestamps: boolean;
  showServiceNames: boolean;
  showLogLevels: boolean;
  compactMode: boolean;
  colorScheme: "default" | "high-contrast" | "dark" | "light";
  maxLineLength: number;
  wordWrap: boolean;
}

export interface LoggingConfig {
  destination: LoggingDestination;
  terminal: {
    enabled: boolean;
    level: "debug" | "info" | "warn" | "error";
    timestamp: boolean;
    colors: boolean;
  };
  webUi: {
    enabled: boolean;
    level: "debug" | "info" | "warn" | "error";
    maxLogs: number;
    autoScroll: boolean;
    styling: WebUIStyling;
  };
}

// Default configuration
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  destination: "web-ui",
  terminal: {
    enabled: false,
    level: "info",
    timestamp: true,
    colors: true,
  },
  webUi: {
    enabled: true,
    level: "debug",
    maxLogs: 1000,
    autoScroll: true,
    styling: {
      fontSize: "sm",
      lineHeight: "normal",
      showTimestamps: true,
      showServiceNames: true,
      showLogLevels: true,
      compactMode: false,
      colorScheme: "default",
      maxLineLength: 120,
      wordWrap: true,
    },
  },
};

// Storage key for user preferences
const LOGGING_CONFIG_KEY = "react-log-viewer-logging-config";

// Load configuration from localStorage
export const loadLoggingConfig = (): LoggingConfig => {
  try {
    const saved = localStorage.getItem(LOGGING_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all properties exist
      const merged: LoggingConfig = {
        ...DEFAULT_LOGGING_CONFIG,
        ...parsed,
        terminal: {
          ...DEFAULT_LOGGING_CONFIG.terminal,
          ...parsed.terminal,
        },
        webUi: {
          ...DEFAULT_LOGGING_CONFIG.webUi,
          ...parsed.webUi,
          styling: {
            ...DEFAULT_LOGGING_CONFIG.webUi.styling,
            ...parsed.webUi?.styling,
          },
        },
      };
      merged.destination = "web-ui";
      merged.webUi.enabled = true;
      merged.terminal.enabled = false;
      return merged;
    }
  } catch (error) {
    console.warn("Failed to load logging config from localStorage:", error);
  }
  return {
    ...DEFAULT_LOGGING_CONFIG,
    destination: "web-ui",
    webUi: { ...DEFAULT_LOGGING_CONFIG.webUi, enabled: true },
    terminal: { ...DEFAULT_LOGGING_CONFIG.terminal, enabled: false },
  };
};

// Save configuration to localStorage
export const saveLoggingConfig = (config: LoggingConfig): void => {
  try {
    localStorage.setItem(LOGGING_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("Failed to save logging config to localStorage:", error);
  }
};

// Update specific configuration
export const updateLoggingConfig = (
  updates: Partial<LoggingConfig>
): LoggingConfig => {
  const current = loadLoggingConfig();
  const updated = { ...current, ...updates };
  saveLoggingConfig(updated);
  return updated;
};

// Helper functions for checking if logging is enabled
export const isTerminalLoggingEnabled = (): boolean => {
  return false;
};

export const isWebUiLoggingEnabled = (config: LoggingConfig): boolean => {
  return config.webUi.enabled && config.destination === "web-ui";
};

// Log level comparison
export const logLevels = ["debug", "info", "warn", "error"] as const;
export const shouldLog = (
  configLevel: string,
  messageLevel: string
): boolean => {
  const configIndex = logLevels.indexOf(configLevel as any);
  const messageIndex = logLevels.indexOf(messageLevel as any);
  return messageIndex >= configIndex;
};

// Styling utility functions
export const getFontSizeClass = (size: WebUIStyling["fontSize"]): string => {
  const sizeMap = {
    xs: "text-xs",
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };
  return sizeMap[size];
};

export const getLineHeightClass = (
  height: WebUIStyling["lineHeight"]
): string => {
  const heightMap = {
    tight: "leading-tight",
    normal: "leading-normal",
    relaxed: "leading-relaxed",
  };
  return heightMap[height];
};

export const getColorSchemeClasses = (
  scheme: WebUIStyling["colorScheme"]
): {
  background: string;
  text: string;
  border: string;
} => {
  const schemes = {
    default: {
      background: "bg-background",
      text: "text-foreground",
      border: "border-border",
    },
    "high-contrast": {
      background: "bg-black text-white",
      text: "text-white",
      border: "border-white",
    },
    dark: {
      background: "bg-gray-900",
      text: "text-gray-100",
      border: "border-gray-700",
    },
    light: {
      background: "bg-gray-50",
      text: "text-gray-900",
      border: "border-gray-200",
    },
  };
  return schemes[scheme];
};
