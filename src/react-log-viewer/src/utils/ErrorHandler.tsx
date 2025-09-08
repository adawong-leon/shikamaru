import React from "react";
import { LogEntry } from "../types";

type Severity = "low" | "medium" | "high" | "critical";
type Category =
  | "network"
  | "rendering"
  | "data"
  | "performance"
  | "user"
  | "system";

export interface ErrorInfo {
  message: string;
  stack?: string;
  component?: string;
  timestamp: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  url?: string;
  severity: Severity;
  category: Category;
  metadata?: Record<string, unknown>;
}

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  logCount: number;
  filterTime: number;
  searchTime: number;
  compressionRatio: number;
  networkLatency: number;
  errorRate: number;
}

export interface MonitoringConfig {
  enableErrorReporting: boolean;
  enablePerformanceMonitoring: boolean;
  enableUserTracking: boolean;
  maxErrorsPerSession: number;
  errorReportingEndpoint?: string;
  performanceSamplingRate: number; // 0..1
}

const isBrowser = typeof window !== "undefined";
const isDev =
  (typeof process !== "undefined" && process.env?.NODE_ENV === "development") ||
  false;

function safeNowISO() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  // Prefer crypto.randomUUID when available
  if (
    isBrowser &&
    "crypto" in window &&
    typeof (crypto as any).randomUUID === "function"
  ) {
    return `${prefix}-${(crypto as any).randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function safeLocalStorageGet(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeUserAgent(): string {
  return isBrowser ? navigator?.userAgent ?? "unknown" : "server";
}

function safeUrl(): string {
  return isBrowser ? window.location?.href ?? "about:blank" : "server";
}

export class ErrorHandler {
  private errors: ErrorInfo[] = [];
  private performanceMetrics: PerformanceMetrics[] = [];
  private config: MonitoringConfig;
  private sessionId: string;
  private userId: string;
  private errorCount = 0;
  private sessionStartISO: string;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enableErrorReporting: true,
      enablePerformanceMonitoring: true,
      enableUserTracking: false,
      maxErrorsPerSession: 100,
      performanceSamplingRate: 0.1,
      ...config,
    };

    // sessionId & userId
    this.sessionId = this.generateSessionId();
    this.userId = this.getUserId();

    // session start
    const existingStart = safeLocalStorageGet("react-log-viewer-session-start");
    if (existingStart) {
      this.sessionStartISO = existingStart;
    } else {
      this.sessionStartISO = safeNowISO();
      safeLocalStorageSet(
        "react-log-viewer-session-start",
        this.sessionStartISO
      );
    }

    // Side effects only in browser
    if (isBrowser) {
      this.setupGlobalErrorHandlers();
      this.setupPerformanceMonitoring();
    }
  }

  /**
   * Report an error
   */
  reportError(
    error: Error | string,
    component?: string,
    severity: Severity = "medium",
    category: Category = "system",
    metadata?: Record<string, unknown>
  ): void {
    if (!this.config.enableErrorReporting) return;
    if (this.errorCount >= this.config.maxErrorsPerSession) return;

    const errObj: Error | null =
      typeof error === "object" && error instanceof Error ? error : null;

    const errorInfo: ErrorInfo = {
      message:
        typeof error === "string" ? error : errObj?.message ?? "Unknown error",
      stack: errObj?.stack,
      component,
      timestamp: safeNowISO(),
      userId: this.userId,
      sessionId: this.sessionId,
      userAgent: safeUserAgent(),
      url: safeUrl(),
      severity,
      category,
      metadata,
    };

    this.errors.push(errorInfo);
    this.errorCount++;

    if (isDev) {
      // eslint-disable-next-line no-console
      console.error("Error reported:", errorInfo);
    }

    if (this.config.errorReportingEndpoint) {
      // Fire-and-forget
      void this.sendErrorReport(errorInfo);
    }

    // If you want to pipe this to your log viewer, you can handle the returned entry
    // e.g., enqueue to a stream/sink
    this.createErrorLogEntry(errorInfo);
  }

  /**
   * Report performance metrics
   */
  reportPerformance(metrics: Partial<PerformanceMetrics>): void {
    if (!this.config.enablePerformanceMonitoring) return;
    if (Math.random() > this.config.performanceSamplingRate) return;

    const merged: PerformanceMetrics = {
      renderTime: 0,
      memoryUsage: 0,
      logCount: 0,
      filterTime: 0,
      searchTime: 0,
      compressionRatio: 0,
      networkLatency: 0,
      errorRate: 0,
      ...metrics,
    };

    this.performanceMetrics.push(merged);
    if (this.performanceMetrics.length > 100) {
      this.performanceMetrics = this.performanceMetrics.slice(-100);
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByCategory: Record<Category, number>;
    errorsBySeverity: Record<Severity, number>;
    recentErrors: ErrorInfo[];
    errorRate: number; // per minute
  } {
    const byCat = {} as Record<Category, number>;
    const bySev = {} as Record<Severity, number>;

    for (const e of this.errors) {
      byCat[e.category] = (byCat[e.category] ?? 0) + 1;
      bySev[e.severity] = (bySev[e.severity] ?? 0) + 1;
    }

    const elapsedMs = Date.now() - new Date(this.sessionStartISO).getTime();
    const perMinute =
      elapsedMs > 0 ? (this.errors.length / elapsedMs) * 60000 : 0;

    return {
      totalErrors: this.errors.length,
      errorsByCategory: byCat,
      errorsBySeverity: bySev,
      recentErrors: this.errors.slice(-10),
      errorRate: perMinute,
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    averageRenderTime: number;
    averageMemoryUsage: number;
    averageLogCount: number;
    averageFilterTime: number;
    averageSearchTime: number;
    averageCompressionRatio: number;
    averageNetworkLatency: number;
    averageErrorRate: number;
    performanceTrend: "improving" | "stable" | "degrading";
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        averageRenderTime: 0,
        averageMemoryUsage: 0,
        averageLogCount: 0,
        averageFilterTime: 0,
        averageSearchTime: 0,
        averageCompressionRatio: 0,
        averageNetworkLatency: 0,
        averageErrorRate: 0,
        performanceTrend: "stable",
      };
    }

    const latest = this.performanceMetrics.slice(-10);
    const older = this.performanceMetrics.slice(-20, -10);

    const avg = (arr: PerformanceMetrics[], key: keyof PerformanceMetrics) =>
      arr.reduce((s, m) => s + (m[key] ?? 0), 0) / (arr.length || 1);

    const calcTrend = (
      key: keyof PerformanceMetrics
    ): "improving" | "stable" | "degrading" => {
      if (older.length === 0) return "stable";
      const latestAvg = avg(latest, key);
      const olderAvg = avg(older, key);
      if (olderAvg === 0) return "stable";
      const diff = (latestAvg - olderAvg) / olderAvg;
      if (diff > 0.1) return "degrading";
      if (diff < -0.1) return "improving";
      return "stable";
    };

    return {
      averageRenderTime: avg(latest, "renderTime"),
      averageMemoryUsage: avg(latest, "memoryUsage"),
      averageLogCount: avg(latest, "logCount"),
      averageFilterTime: avg(latest, "filterTime"),
      averageSearchTime: avg(latest, "searchTime"),
      averageCompressionRatio: avg(latest, "compressionRatio"),
      averageNetworkLatency: avg(latest, "networkLatency"),
      averageErrorRate: avg(latest, "errorRate"),
      performanceTrend: calcTrend("renderTime"),
    };
  }

  clear(): void {
    this.errors = [];
    this.performanceMetrics = [];
    this.errorCount = 0;
    this.sessionStartISO = safeNowISO();
    safeLocalStorageSet("react-log-viewer-session-start", this.sessionStartISO);
  }

  exportData(): {
    errors: ErrorInfo[];
    performance: PerformanceMetrics[];
    sessionInfo: {
      sessionId: string;
      userId: string;
      startTime: string;
      endTime: string;
      userAgent: string;
      url: string;
    };
  } {
    return {
      errors: this.errors,
      performance: this.performanceMetrics,
      sessionInfo: {
        sessionId: this.sessionId,
        userId: this.userId,
        startTime: this.sessionStartISO,
        endTime: safeNowISO(),
        userAgent: safeUserAgent(),
        url: safeUrl(),
      },
    };
  }

  // ---- internals ----

  private setupGlobalErrorHandlers(): void {
    if (!isBrowser) return;

    // Unhandled JavaScript errors
    window.addEventListener("error", (event) => {
      // Some errors may not include .error (e.g., script load)
      const basicMeta: Record<string, unknown> = {
        filename: (event as any).filename,
        lineno: (event as any).lineno,
        colno: (event as any).colno,
      };
      this.reportError(
        (event as ErrorEvent).error ??
          (event as any).message ??
          "Unknown error",
        "global",
        "high",
        "system",
        basicMeta
      );
    });

    // Unhandled promise rejections
    window.addEventListener(
      "unhandledrejection",
      (event: PromiseRejectionEvent) => {
        this.reportError(
          event.reason ?? "Unhandled rejection",
          "promise",
          "high",
          "system",
          { promise: event.promise }
        );
      }
    );

    // (Optional) Hook points for framework-level handlers can be added here
  }

  private setupPerformanceMonitoring(): void {
    if (!isBrowser || !this.config.enablePerformanceMonitoring) return;

    // Memory usage (where supported)
    const hasMemory =
      typeof performance !== "undefined" &&
      performance &&
      "memory" in performance;

    if (hasMemory) {
      setInterval(() => {
        try {
          // @ts-expect-error non-standard API
          const mem = performance.memory;
          if (mem?.usedJSHeapSize) {
            this.reportPerformance({
              memoryUsage: mem.usedJSHeapSize / (1024 * 1024),
            });
          }
        } catch {
          /* ignore */
        }
      }, 5000);
    }

    // Network RTT (where supported)
    const navAny = navigator as any;
    const connection =
      navAny?.connection || navAny?.mozConnection || navAny?.webkitConnection;
    if (connection) {
      const push = () =>
        this.reportPerformance({ networkLatency: connection.rtt || 0 });
      push();
      connection.addEventListener?.("change", push);
    }
  }

  private async sendErrorReport(errorInfo: ErrorInfo): Promise<void> {
    const endpoint = this.config.errorReportingEndpoint!;
    try {
      if (isBrowser && "sendBeacon" in navigator) {
        const ok = navigator.sendBeacon(
          endpoint,
          new Blob([JSON.stringify(errorInfo)], { type: "application/json" })
        );
        if (ok) return;
      }
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(errorInfo),
      });
    } catch (e) {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.warn("Failed to send error report:", e);
      }
    }
  }

  private createErrorLogEntry(errorInfo: ErrorInfo): LogEntry {
    return {
      id: randomId("error"),
      serviceName: "error-handler",
      timestamp: errorInfo.timestamp,
      message: `[${errorInfo.severity.toUpperCase()}] ${
        errorInfo.component ?? "Unknown"
      }: ${errorInfo.message}`,
      level:
        errorInfo.severity === "critical" || errorInfo.severity === "high"
          ? "error"
          : "warn",
      metadata: {
        errorInfo,
        category: errorInfo.category,
        sessionId: errorInfo.sessionId,
        userId: errorInfo.userId,
      },
    };
  }

  private generateSessionId(): string {
    return randomId("session");
  }

  private getUserId(): string {
    if (!isBrowser) return randomId("anonymous");
    const key = "react-log-viewer-user-id";
    const existing = safeLocalStorageGet(key);
    if (existing) return existing;
    const fresh = randomId("user");
    safeLocalStorageSet(key, fresh);
    return fresh;
  }
}

// Singleton (keeps prod behavior you had, but guards SSR)
export const errorHandler = new ErrorHandler({
  enableErrorReporting:
    (typeof process !== "undefined"
      ? process.env?.NODE_ENV === "production"
      : false) || false,
  enablePerformanceMonitoring: true,
  enableUserTracking: false,
  maxErrorsPerSession: 100,
  performanceSamplingRate: 0.1,
});

// ---- React Error Boundary ----

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    errorHandler.reportError(error, "ErrorBoundary", "high", "rendering", {
      componentStack: errorInfo?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <>
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <h2 className="text-lg font-semibold text-red-800">
              Something went wrong
            </h2>
            <p className="text-red-600 mt-2">
              An error occurred while rendering the log viewer. Please refresh
              the page.
            </p>
            {isBrowser && (
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Refresh Page
              </button>
            )}
          </div>
        </>
      );
    }
    return this.props.children;
  }
}
