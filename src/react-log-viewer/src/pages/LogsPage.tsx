import React from "react";
import { LogViewer } from "../components/LogViewer";
import { LogFilters } from "../components/LogFilters";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { AutoRefreshStatus } from "../components/AutoRefreshStatus";
import { useLogViewer } from "../contexts/LogViewerContext";

export const LogsPage: React.FC = () => {
  const {
    logs,
    stats,
    clearLogs,
    getFilteredLogs,
    services,
    filters,
    setFilters,
    connectionStatus,
    loggingConfig,
  } = useLogViewer();

  const filteredLogs = getFilteredLogs(filters);

  return (
    <div className="space-y-6">
      {/* Top Metrics Bar */}
      <div className="flex items-center justify-between gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-6">
          <ConnectionStatus status={connectionStatus} />
          <AutoRefreshStatus />
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        <LogFilters
          services={services}
          filters={filters}
          onFiltersChange={setFilters}
          onClearLogs={clearLogs}
          stats={stats}
        />
        <LogViewer
          logs={filteredLogs}
          connectionStatus={connectionStatus}
          onClearLogs={clearLogs}
          styling={loggingConfig.webUi.styling}
        />
      </div>
    </div>
  );
};
