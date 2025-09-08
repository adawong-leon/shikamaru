import React from "react";
import { LogStats as LogStatsType } from "../types";
import { cn } from "../utils/cn";
import { BarChart3, AlertTriangle, Info, Bug, Activity } from "lucide-react";

interface LogStatsProps {
  stats: LogStatsType;
}

export const LogStats: React.FC<LogStatsProps> = ({ stats }) => {
  const total = stats.total;
  const errorRate = total > 0 ? ((stats.errors / total) * 100).toFixed(1) : "0";
  const warningRate =
    total > 0 ? ((stats.warnings / total) * 100).toFixed(1) : "0";

  return (
    <div className="flex items-center gap-6">
      {/* Total Logs */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-blue-500" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-medium text-foreground">
            {total.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Errors */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Errors</span>
          <span className="text-sm font-medium text-red-500">
            {stats.errors.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">({errorRate}%)</span>
        </div>
      </div>

      {/* Warnings */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-500" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Warnings</span>
          <span className="text-sm font-medium text-yellow-500">
            {stats.warnings.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">
            ({warningRate}%)
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-500" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Info</span>
          <span className="text-sm font-medium text-blue-500">
            {stats.info.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Debug */}
      <div className="flex items-center gap-2">
        <Bug className="w-4 h-4 text-gray-500" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Debug</span>
          <span className="text-sm font-medium text-gray-500">
            {stats.debug.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Services */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-green-500" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Services</span>
          <span className="text-sm font-medium text-green-500">
            {stats.services.size}
          </span>
        </div>
      </div>

      {/* Health Status */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-3 h-3 rounded-full",
            parseFloat(errorRate) > 10
              ? "bg-red-500"
              : parseFloat(errorRate) > 5
              ? "bg-yellow-500"
              : "bg-green-500"
          )}
        />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Health</span>
          <span className="text-sm font-medium text-foreground">
            {parseFloat(errorRate) > 10
              ? "Critical"
              : parseFloat(errorRate) > 5
              ? "Warning"
              : "Healthy"}
          </span>
        </div>
      </div>
    </div>
  );
};
