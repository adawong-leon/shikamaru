import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Gauge,
} from "lucide-react";
import { cn } from "../utils/cn";
import { errorHandler } from "../utils/ErrorHandler";

interface PerformanceDashboardProps {
  className?: string;
  compact?: boolean;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  className,
  compact = false,
}) => {
  const [errorStats, setErrorStats] = useState(errorHandler.getErrorStats());
  const [performanceStats, setPerformanceStats] = useState(
    errorHandler.getPerformanceStats()
  );
  const [isExpanded, setIsExpanded] = useState(false);

  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setErrorStats(errorHandler.getErrorStats());
      setPerformanceStats(errorHandler.getPerformanceStats());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Calculate health score
  const healthScore = useMemo(() => {
    const errorPenalty = Math.min(errorStats.errorRate * 10, 50);
    const performancePenalty =
      performanceStats.performanceTrend === "degrading" ? 20 : 0;
    const memoryPenalty = performanceStats.averageMemoryUsage > 100 ? 15 : 0;

    return Math.max(0, 100 - errorPenalty - performancePenalty - memoryPenalty);
  }, [
    errorStats.errorRate,
    performanceStats.performanceTrend,
    performanceStats.averageMemoryUsage,
  ]);

  // Get health status
  const getHealthStatus = (score: number) => {
    if (score >= 80)
      return {
        status: "healthy",
        color: "text-green-500",
        bg: "bg-green-500/10",
      };
    if (score >= 60)
      return {
        status: "warning",
        color: "text-yellow-500",
        bg: "bg-yellow-500/10",
      };
    return { status: "critical", color: "text-red-500", bg: "bg-red-500/10" };
  };

  const healthStatus = getHealthStatus(healthScore);

  // Get trend icon
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case "degrading":
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg border",
          className
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded",
            healthStatus.bg
          )}
        >
          <Activity className={cn("w-4 h-4", healthStatus.color)} />
          <span className={cn("text-sm font-medium", healthStatus.color)}>
            {Math.round(healthScore)}
          </span>
        </div>

        {errorStats.totalErrors > 0 && (
          <div className="flex items-center gap-1 text-red-500">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{errorStats.totalErrors}</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-blue-500">
          <Gauge className="w-4 h-4" />
          <span className="text-sm">
            {Math.round(performanceStats.averageMemoryUsage)}MB
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-card border rounded-lg p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Performance Dashboard</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Health Score */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">System Health</span>
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded",
              healthStatus.bg
            )}
          >
            <Activity className={cn("w-4 h-4", healthStatus.color)} />
            <span className={cn("text-sm font-medium", healthStatus.color)}>
              {Math.round(healthScore)}%
            </span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              healthScore >= 80
                ? "bg-green-500"
                : healthScore >= 60
                ? "bg-yellow-500"
                : "bg-red-500"
            )}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Error Statistics */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Error Statistics
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span>Total Errors:</span>
            <span className="font-medium">{errorStats.totalErrors}</span>
          </div>
          <div className="flex justify-between">
            <span>Error Rate:</span>
            <span className="font-medium">
              {errorStats.errorRate.toFixed(2)}/min
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2 space-y-1">
            <div className="text-xs text-muted-foreground">By Category:</div>
            {Object.entries(errorStats.errorsByCategory).map(
              ([category, count]) => (
                <div key={category} className="flex justify-between text-xs">
                  <span className="capitalize">{category}:</span>
                  <span>{count}</span>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Performance Metrics */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Performance Metrics
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span>Render Time:</span>
            <span className="font-medium">
              {performanceStats.averageRenderTime.toFixed(1)}ms
            </span>
          </div>
          <div className="flex justify-between">
            <span>Memory Usage:</span>
            <span className="font-medium">
              {Math.round(performanceStats.averageMemoryUsage)}MB
            </span>
          </div>
          <div className="flex justify-between">
            <span>Filter Time:</span>
            <span className="font-medium">
              {performanceStats.averageFilterTime.toFixed(1)}ms
            </span>
          </div>
          <div className="flex justify-between">
            <span>Search Time:</span>
            <span className="font-medium">
              {performanceStats.averageSearchTime.toFixed(1)}ms
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Network Latency:</span>
              <span>{performanceStats.averageNetworkLatency.toFixed(1)}ms</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Compression Ratio:</span>
              <span>
                {(performanceStats.averageCompressionRatio * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Performance Trend:</span>
              <div className="flex items-center gap-1">
                {getTrendIcon(performanceStats.performanceTrend)}
                <span className="capitalize">
                  {performanceStats.performanceTrend}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            errorHandler.clear();
            setErrorStats(errorHandler.getErrorStats());
            setPerformanceStats(errorHandler.getPerformanceStats());
          }}
          className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
        >
          Clear Data
        </button>
        <button
          onClick={() => {
            const data = errorHandler.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `performance-data-${
              new Date().toISOString().split("T")[0]
            }.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
        >
          Export Data
        </button>
      </div>
    </div>
  );
};

export default PerformanceDashboard;
