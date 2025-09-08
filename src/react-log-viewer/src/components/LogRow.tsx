import React, {
  memo,
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect,
} from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../utils/cn";
import type { LogEntry } from "../types";
import {
  WebUIStyling,
  getFontSizeClass,
  getLineHeightClass,
  getColorSchemeClasses,
} from "../config/logging";

interface LogRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    logs: LogEntry[];
    onLogClick: (log: LogEntry) => void;
    styling?: WebUIStyling;
    maxVisibleTags: number;
  };
}

const TagPill = memo<{ tag: string }>(({ tag }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold bg-muted/50 text-muted-foreground border-border/50 flex-shrink-0">
    {tag}
  </span>
));

TagPill.displayName = "TagPill";

// Memoized log row component
export const LogRow = memo<LogRowProps>(({ index, style, data }) => {
  const log = data.logs[index];

  if (!log) return null;

  // Memoize styling calculations
  const styling = useMemo(() => {
    const fontSizeClass = data.styling
      ? getFontSizeClass(data.styling.fontSize)
      : "text-xs";
    const lineHeightClass = data.styling
      ? getLineHeightClass(data.styling.lineHeight)
      : "leading-tight";
    const colorScheme = data.styling
      ? getColorSchemeClasses(data.styling.colorScheme)
      : {
          background: "bg-background",
          text: "text-foreground",
          border: "border-border",
        };

    return { fontSizeClass, lineHeightClass, colorScheme };
  }, [data.styling]);

  // Memoize timestamp formatting
  const formattedTimestamp = useMemo(() => {
    if (!data.styling?.showTimestamps) return null;
    try {
      const date = new Date(log.timestamp);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        // @ts-ignore - fractionalSecondDigits is supported in modern browsers
        fractionalSecondDigits: 3,
      });
    } catch {
      return log.timestamp;
    }
  }, [log.timestamp, data.styling?.showTimestamps]);

  // Memoize log level color classes
  const logLevelClasses = useMemo(() => {
    switch (log.level.toLowerCase()) {
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
  }, [log.level]);

  // Memoize tags
  const tags = useMemo(() => {
    const normalizedTags = (log as any).tags || [];
    return Array.isArray(normalizedTags) ? normalizedTags.filter(Boolean) : [];
  }, [log]);

  const visibleTags = useMemo(
    () => tags.slice(0, data.maxVisibleTags),
    [tags, data.maxVisibleTags]
  );
  const hiddenCount = useMemo(
    () => Math.max(0, tags.length - visibleTags.length),
    [tags.length, visibleTags.length]
  );
  const hiddenTooltip = useMemo(
    () => (hiddenCount > 0 ? tags.slice(data.maxVisibleTags).join(", ") : ""),
    [hiddenCount, tags, data.maxVisibleTags]
  );

  // Memoize click handler
  const handleClick = useCallback(() => {
    data.onLogClick(log);
  }, [data.onLogClick, log]);

  // Memoize copy handler
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(log.message).then(() => {
        setCopied(true);
        if (copyResetRef.current) clearTimeout(copyResetRef.current);
        copyResetRef.current = setTimeout(() => setCopied(false), 1200);
      });
    },
    [log.message]
  );

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  // Memoize service name and level formatting
  const serviceName = useMemo(
    () => (data.styling?.showServiceNames ? log.serviceName : null),
    [log.serviceName, data.styling?.showServiceNames]
  );

  const logLevel = useMemo(
    () => (data.styling?.showLogLevels ? log.level.toUpperCase() : null),
    [log.level, data.styling?.showLogLevels]
  );

  return (
    <div
      style={style}
      className={cn(
        "flex items-start gap-3 px-4 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer",
        styling.colorScheme.background
      )}
      onClick={handleClick}
    >
      <div className="h-full w-full px-4 py-2 flex flex-col gap-1">
        {/* Main content - full width */}
        <div className="w-full min-w-0 flex-1 flex flex-col justify-center">
          {/* First line: Main message */}
          <div
            className={cn(
              "font-mono break-words overflow-hidden",
              styling.fontSizeClass,
              styling.lineHeightClass,
              styling.colorScheme.text + "/90",
              data.styling?.wordWrap ? "whitespace-normal" : "whitespace-nowrap"
            )}
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: data.styling?.compactMode ? 1 : 2,
              overflow: "hidden",
              wordBreak: data.styling?.wordWrap ? "break-word" : "normal",
              overflowWrap: data.styling?.wordWrap ? "break-word" : "normal",
              hyphens: data.styling?.wordWrap ? "auto" : "manual",
              lineHeight: data.styling?.compactMode ? "1.1" : "1.2",
              maxWidth: data.styling?.maxLineLength
                ? `${data.styling.maxLineLength}ch`
                : "none",
            }}
            title={log.message}
          >
            {formattedTimestamp && (
              <span className="text-muted-foreground/60 mr-2">
                [{formattedTimestamp}]
              </span>
            )}
            {log.html && log.parsed?.type !== "json" ? (
              <span
                dangerouslySetInnerHTML={{ __html: log.html }}
                className="inline"
              />
            ) : (
              log.parsed?.message || log.message
            )}
            {/* Debug: Show if HTML is available */}
            {log.parsed?.type === "json" && (
              <span className="text-xs text-green-500 ml-2">
                {log.parsed?.message}
              </span>
            )}
          </div>

          {/* Second line: Service name, log level, and Copy Button */}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {serviceName && (
                <>
                  <span className="font-medium">{serviceName}</span>
                  {logLevel && (
                    <span className="text-muted-foreground/60">•</span>
                  )}
                </>
              )}
              {logLevel && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-medium border",
                    logLevelClasses
                  )}
                >
                  {logLevel}
                </span>
              )}
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={cn(
                "p-1 rounded-md transition-colors flex-shrink-0",
                copied
                  ? "bg-green-500/20 text-green-600 border border-green-500/30"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
              title={copied ? "Copied!" : "Copy log message"}
            >
              {copied ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Third line: Tags */}
          {tags.length > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {visibleTags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
              {hiddenCount > 0 && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold bg-muted/50 text-muted-foreground border-border/50 flex-shrink-0"
                  title={hiddenTooltip}
                >
                  +{hiddenCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, areEqual);

LogRow.displayName = "LogRow";

// Custom comparison function for memo
function areEqual(prevProps: LogRowProps, nextProps: LogRowProps): boolean {
  // Compare logs array reference
  if (prevProps.data.logs !== nextProps.data.logs) {
    return false;
  }

  // Compare specific log at index
  const prevLog = prevProps.data.logs[prevProps.index];
  const nextLog = nextProps.data.logs[nextProps.index];

  if (!prevLog || !nextLog) {
    return prevLog === nextLog;
  }

  // Compare log properties
  return (
    prevLog.id === nextLog.id &&
    prevLog.timestamp === nextLog.timestamp &&
    prevLog.level === nextLog.level &&
    prevLog.serviceName === nextLog.serviceName &&
    prevLog.message === nextLog.message &&
    prevLog.html === nextLog.html &&
    JSON.stringify(prevLog.metadata) === JSON.stringify(nextLog.metadata) &&
    JSON.stringify(prevLog.parsed) === JSON.stringify(nextLog.parsed)
  );
}
