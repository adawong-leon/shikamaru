import { LogEntry, LogFilters } from "../types";

/**
 * Filter logs based on provided criteria
 */
export function filterLogs(logs: LogEntry[], filters: LogFilters): LogEntry[] {
  return logs.filter((log) => {
    // Service filter
    if (
      filters.services.length > 0 &&
      !filters.services.includes(log.serviceName)
    ) {
      return false;
    }

    // Level filter
    if (filters.levels.length > 0 && !filters.levels.includes(log.level)) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const messageMatch = log.message.toLowerCase().includes(searchLower);
      const serviceMatch = log.serviceName.toLowerCase().includes(searchLower);
      const levelMatch = log.level.toLowerCase().includes(searchLower);

      if (!messageMatch && !serviceMatch && !levelMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get log level color classes for styling
 */
export function getLogLevelClasses(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
      return "text-red-500 bg-red-500/10 border-red-500/20";
    case "warn":
    case "warning":
      return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
    case "info":
      return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    case "debug":
      return "text-gray-500 bg-gray-500/10 border-gray-500/20";
    case "trace":
      return "text-purple-500 bg-purple-500/10 border-purple-500/20";
    default:
      return "text-muted-foreground bg-muted/50 border-border/50";
  }
}

/**
 * Format timestamp for display
 */
export function formatLogTimestamp(
  timestamp: string,
  showMilliseconds: boolean = true
): string {
  try {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };

    if (showMilliseconds) {
      // @ts-ignore - fractionalSecondDigits is supported in modern browsers
      options.fractionalSecondDigits = 3;
    }

    return date.toLocaleTimeString("en-US", options);
  } catch {
    return timestamp;
  }
}

/**
 * Extract log level from text
 */
export function extractLogLevel(text: string): string {
  const lower = text.toLowerCase();

  // Guard against false positives like "Found 0 errors" / "no errors"
  const noErrorContexts =
    /\b(found\s+0\s+errors?|no\s+errors?|0\s+errors?|errors?\s*[:=]\s*0)\b/;
  if (noErrorContexts.test(lower)) {
    return "info";
  }

  const levelPatterns = [
    { pattern: /\berror\b/i, level: "error" },
    { pattern: /\bwarn(?:ing)?\b/i, level: "warn" },
    { pattern: /\binfo\b/i, level: "info" },
    { pattern: /\bdebug\b/i, level: "debug" },
    { pattern: /\btrace\b/i, level: "trace" },
  ];

  for (const { pattern, level } of levelPatterns) {
    if (pattern.test(text)) {
      return level;
    }
  }

  return "info";
}

/**
 * Check if a log entry has HTML content
 */
export function hasHtmlContent(log: LogEntry): boolean {
  return Boolean(log.html && log.html.trim().length > 0);
}

/**
 * Get display message (HTML or plain text)
 */
export function getDisplayMessage(log: LogEntry): string {
  return log.parsed?.message || log.message;
}

/**
 * Get HTML content for rendering
 */
export function getHtmlContent(log: LogEntry): string | null {
  return log.html || null;
}
