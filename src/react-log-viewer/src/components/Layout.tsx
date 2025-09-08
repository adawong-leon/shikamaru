import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, FileText, Settings } from "lucide-react";
import { LoggingSettings } from "./LoggingSettings";
import { useLogViewer } from "../contexts/LogViewerContext";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { updateLoggingConfig } = useLogViewer();
  const [isLoggingSettingsOpen, setIsLoggingSettingsOpen] =
    React.useState(false);

  const handleResetChoice = () => {
    localStorage.removeItem("react-log-viewer-logging-config");
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Log Viewer (Beta)
            </h1>

            <div className="flex items-center space-x-4">
              {/* Navigation Tabs */}
              <div className="flex items-center space-x-1 bg-muted/50 rounded-lg p-1">
                <Link
                  to="/"
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    location.pathname === "/"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Logs</span>
                </Link>
                <Link
                  to="/metrics"
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    location.pathname === "/metrics"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Metrics</span>
                </Link>
              </div>

              {/* Settings Button */}
              <button
                onClick={() => setIsLoggingSettingsOpen(true)}
                className="p-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                title="Logging Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">{children}</main>

      {/* Logging Settings Modal */}
      <LoggingSettings
        isOpen={isLoggingSettingsOpen}
        onClose={() => setIsLoggingSettingsOpen(false)}
        onConfigChange={updateLoggingConfig}
        onResetChoice={handleResetChoice}
      />
    </div>
  );
};
