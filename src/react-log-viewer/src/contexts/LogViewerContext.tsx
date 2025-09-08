import React, { createContext, useContext, ReactNode } from "react";
import { Socket } from "socket.io-client";
import {
  LogEntry,
  Service,
  ConnectionStatus,
  LogFilters,
  LogStats,
} from "../types";
import { LoggingConfig } from "../config/logging";

export interface LogViewerContextValue {
  // Socket state
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  isConnected: boolean;

  // Logs state
  logs: LogEntry[];
  stats: LogStats;
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  getFilteredLogs: (filters: LogFilters) => LogEntry[];

  // Services state
  services: Service[];
  setServices: (services: Service[]) => void;
  refreshServices: () => Promise<void>;
  servicesLoading: boolean;
  servicesError: string | null;
  isAutoRefreshEnabled: boolean;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
  toggleAutoRefresh: () => void;

  // Filters state
  filters: LogFilters;
  setFilters: (filters: LogFilters) => void;

  // Logging configuration
  loggingConfig: LoggingConfig;
  updateLoggingConfig: (config: LoggingConfig) => void;

  // Connection actions
  connect: () => void;
  disconnect: () => void;
}

const LogViewerContext = createContext<LogViewerContextValue | undefined>(
  undefined
);

export interface LogViewerProviderProps {
  children: ReactNode;
  value: LogViewerContextValue;
}

export const LogViewerProvider: React.FC<LogViewerProviderProps> = ({
  children,
  value,
}) => {
  return (
    <LogViewerContext.Provider value={value}>
      {children}
    </LogViewerContext.Provider>
  );
};

export const useLogViewer = (): LogViewerContextValue => {
  const context = useContext(LogViewerContext);
  if (context === undefined) {
    throw new Error("useLogViewer must be used within a LogViewerProvider");
  }
  return context;
};
