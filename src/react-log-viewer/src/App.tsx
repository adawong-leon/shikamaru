import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { LogFilters as LogFiltersType } from "./types";
import { useLogs, useServices, useSocketConnection } from "./hooks";
import { LogViewerProvider } from "./contexts/LogViewerContext";
import { Layout } from "./components/Layout";
import { LogsPage, MetricsPage } from "./pages";
import { StorageDebugger } from "./components/StorageDebugger";

function AppContent() {
  // Initialize hooks only after user has chosen logging destination
  const {
    logs,
    stats,
    addLog,
    clearLogs,
    getFilteredLogs,
    loggingConfig,
    updateLoggingConfig,
  } = useLogs();

  // Initialize services and socket connection only after logging choice
  const {
    services,
    setServices,
    refreshServices,
    isLoading: servicesLoading,
    error: servicesError,
    isAutoRefreshEnabled,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,
  } = useServices();

  const { socket, connectionStatus, isConnected, connect, disconnect } =
    useSocketConnection(addLog, setServices, loggingConfig);

  // Connect socket when user has already chosen logging (returning users)
  useEffect(() => {
    console.log("Connecting socket for returning user...");
    connect();
  }, [connect]);

  // Filters state
  const [filters, setFilters] = useState<LogFiltersType>({
    services: [],
    levels: ["info", "warn", "error"],
    search: "",
  });

  // Context value
  const contextValue = {
    // Socket state
    socket,
    connectionStatus,
    isConnected,

    // Logs state
    logs,
    stats,
    addLog,
    clearLogs,
    getFilteredLogs,

    // Services state
    services,
    setServices,
    refreshServices,
    servicesLoading,
    servicesError,
    isAutoRefreshEnabled,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,

    // Filters state
    filters,
    setFilters,

    // Logging configuration
    loggingConfig,
    updateLoggingConfig,

    // Connection actions
    connect,
    disconnect,
  };

  return (
    <LogViewerProvider value={contextValue}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<LogsPage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
        {/* Storage Debugger - only show in development */}
        {process.env.NODE_ENV === "development" && <StorageDebugger />}
      </Router>
    </LogViewerProvider>
  );
}

function App() {
  return <AppContent />;
}

export default App;
