import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  VariableSizeList as List,
  ListOnItemsRenderedProps,
} from "react-window";
import { Play, Pause, RotateCcw, X, Copy, Trash2 } from "lucide-react";
import type { LogEntry, ConnectionStatus } from "../types";
import { WebUIStyling } from "../config/logging";
import { LogRow } from "./LogRow";

/* ========================
   Helpers & small utilities
   ======================== */

// Fallback: old best-effort

/* ========================
   Props & row data types
   ======================== */

interface LogViewerProps {
  logs: LogEntry[];
  connectionStatus: ConnectionStatus;
  onClearLogs: () => void;
  /** Optional logo renderer. Return a small React node (e.g., <img/> or <Avatar/>). */
  renderLogo?: (log: LogEntry) => React.ReactNode;
  /** Reserve width in px for the logo column (default 40). */
  logoWidth?: number;
  /** Fix the viewer width (px or CSS string). Default: undefined (fills parent). */
  fixedWidth?: number | string;
  /** Fix the viewer height (px or CSS string). Default: 600. */
  fixedHeight?: number | string;
  /** Fix each row’s height in px (virtualization friendly). Default: 88. */
  fixedRowHeight?: number;
  /** Max visible tag pills per row before +N overflow. Default: 5. */
  maxVisibleTags?: number;
  /** Web UI styling configuration */
  styling?: WebUIStyling;
}

type RowData = {
  logs: LogEntry[];
  onLogClick: (log: LogEntry) => void;
  renderLogo?: (log: LogEntry) => React.ReactNode;
  logoWidth: number;
  maxVisibleTags: number;
  fixedRowHeight: number;
  styling?: WebUIStyling;
};

/* ========================
   UI atoms
   ======================== */

const normalizeTags = (maybeTags: unknown): string[] => {
  if (!maybeTags) return [];
  if (Array.isArray(maybeTags)) return maybeTags.map(String);
  if (typeof maybeTags === "string")
    return maybeTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
};

/* ========================
   Row component
   ======================== */

// Use the optimized LogRow component from separate file

/* ========================
   Main component
   ======================== */

export const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  onClearLogs,
  renderLogo,
  logoWidth = 40,
  fixedWidth, // optional; fills parent if not provided
  fixedHeight = 600,
  fixedRowHeight = 88,
  maxVisibleTags = 5,
  styling,
}) => {
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  // width is responsive unless fixedWidth provided
  // const [width, setWidth] = useState<number>(
  //   typeof fixedWidth === "number" ? fixedWidth : 800
  // );

  // useEffect(() => {
  //   if (typeof fixedWidth === "number") {
  //     setWidth(fixedWidth);
  //     return;
  //   }
  //   if (typeof fixedWidth === "string") {
  //     // we can’t measure strings reliably; let container decide via CSS.
  //   }
  //   const el = containerRef.current;
  //   if (!el) return;
  //   const ro = new ResizeObserver((entries) => {
  //     for (const entry of entries) {
  //       const cr = entry.contentRect;
  //       setWidth(Math.max(320, cr.width));
  //     }
  //   });
  //   setWidth(el.clientWidth || 800);
  //   ro.observe(el);
  //   return () => ro.disconnect();
  // }, [fixedWidth]);

  // Pause buffering (so you don't "lose" logs while paused)
  const [pausedBuffer, setPausedBuffer] = useState<LogEntry[]>(logs);

  const activeLogs = isPaused ? pausedBuffer : logs;
  const displayedLogs = useMemo<LogEntry[]>(() => {
    return [...activeLogs].reverse(); // newest first
  }, [activeLogs]);

  const rowData = useMemo<RowData>(
    () => ({
      logs: displayedLogs,
      onLogClick: (log) => setSelectedLog(log),
      renderLogo,
      logoWidth,
      maxVisibleTags,
      fixedRowHeight,
      styling,
    }),
    [
      displayedLogs,
      renderLogo,
      logoWidth,
      maxVisibleTags,
      fixedRowHeight,
      styling,
    ]
  );
  useEffect(() => {
    if (isPaused) {
      // When paused, only update the buffer if logs are cleared
      // This keeps the view frozen while new logs accumulate in the background
      setPausedBuffer((prev) => {
        if (logs.length === 0) {
          // If logs are cleared, clear the buffer too
          return [];
        }
        // Keep the buffer frozen - don't update with new logs
        return prev;
      });
    } else {
      // When not paused, keep the buffer in sync with logs
      setPausedBuffer(logs);
    }
  }, [logs, isPaused]);

  // Fixed item size for smooth virtualization
  const getItemSize = useCallback(() => {
    // Base height for three-line layout with smaller fonts
    let height = 70; // Reduced base height for more compact rows

    // Add extra height if there are tags (third line)
    if (
      logs.some((log) => {
        const tags = normalizeTags((log as any).tags);
        return tags.length > 0;
      })
    ) {
      height += 20; // Reduced extra space for tag pills
    }

    // Add extra height for longer messages that might wrap
    const hasLongMessages = logs.some((log) => {
      const message = log.parsed?.message || log.message;
      return message && message.length > 100; // Reduced threshold for long messages
    });

    if (hasLongMessages) {
      height += 10; // Reduced extra space for wrapped text
    }

    // Ensure min and max height constraints
    return Math.max(60, Math.min(120, height)); // Min 60px, Max 120px
  }, [logs]);

  useEffect(() => {
    if (autoScroll && !isPaused && displayedLogs.length > 0) {
      listRef.current?.scrollToItem(0, "start");
    }
  }, [displayedLogs.length, autoScroll, isPaused]);

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex }: ListOnItemsRenderedProps) => {
      // With newest-first ordering, being at top (index 0) means we're following the latest
      setAutoScroll(visibleStartIndex === 0);
    },
    []
  );

  const scrollToLatest = useCallback(() => {
    if (displayedLogs.length > 0) {
      listRef.current?.scrollToItem(0, "start");
      setAutoScroll(true);
    }
  }, [displayedLogs.length]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  const clearLogs = useCallback(() => {
    onClearLogs();
  }, [onClearLogs]);

  const copyLogToClipboard = useCallback(() => {
    if (!selectedLog) return;
    // Copy the raw message without anyprocessing
    navigator.clipboard?.writeText(selectedLog.message);
  }, [selectedLog]);

  // Effective dimensions
  const effectiveHeight =
    typeof fixedHeight === "number" ? fixedHeight : undefined;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Logs</h3>
          <span className="text-sm text-muted-foreground">
            {logs.length} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className="p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            title={isPaused ? "Resume logs" : "Pause logs"}
          >
            {isPaused ? (
              <Play className="w-4 h-4" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={scrollToLatest}
            className="p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            title="Scroll to latest"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={clearLogs}
            className="p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body (fixed height) */}
      <div
        ref={
          typeof fixedWidth === "number" || typeof fixedWidth === "string"
            ? undefined
            : containerRef
        }
        className="relative"
        style={{
          width:
            typeof fixedWidth === "number"
              ? `${fixedWidth}px`
              : typeof fixedWidth === "string"
              ? fixedWidth
              : undefined, // fill parent if undefined
          height:
            typeof fixedHeight === "number"
              ? `${fixedHeight}px`
              : fixedHeight ?? "600px",
        }}
      >
        {(isPaused ? pausedBuffer : logs).length === 0 ? (
          <div className="flex items-center justify-center w-full h-full">
            <div className="text-center text-muted-foreground">No Logs Yet</div>
          </div>
        ) : (
          <List
            ref={listRef}
            height={effectiveHeight ?? 600}
            width={containerRef.current?.clientWidth ?? 800}
            itemCount={displayedLogs.length}
            itemSize={getItemSize}
            itemData={rowData}
            onItemsRendered={handleItemsRendered}
            overscanCount={10}
            itemKey={(index, data) =>
              data.logs[index]?.id ??
              `${data.logs[index]?.timestamp ?? "t"}-${index}`
            }
            className="custom-scrollbar"
          >
            {LogRow}
          </List>
        )}

        {!autoScroll && displayedLogs.length > 0 && (
          <div className="absolute bottom-4 right-4">
            <button
              onClick={scrollToLatest}
              className="p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
              title="Scroll to latest"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Selected Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold">Log Details</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyLogToClipboard}
                  className="p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                  title="Copy raw log"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto max-h-[calc(80vh-120px)]">
              <div className="space-y-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Service:
                    </span>
                    <span className="ml-2">{selectedLog.serviceName}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Level:
                    </span>
                    <span className="ml-2">{selectedLog.level}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Timestamp:
                    </span>
                    <span className="ml-2">
                      {new Date(selectedLog.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      ID:
                    </span>
                    <span className="ml-2">{selectedLog.id || "N/A"}</span>
                  </div>
                </div>
                {/* Message Content */}
                <div>
                  <h4 className="font-medium text-muted-foreground mb-2">
                    Message:
                  </h4>
                  <div className="bg-muted/30 border border-border rounded-lg p-3">
                    {selectedLog.html ? (
                      <div
                        className="text-sm font-mono text-foreground whitespace-pre-wrap break-words"
                        dangerouslySetInnerHTML={{ __html: selectedLog.html }}
                      />
                    ) : (
                      <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-words">
                        {selectedLog.parsed?.message || selectedLog.message}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
