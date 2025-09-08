import React, { useState, useEffect } from "react";
import { Settings, Monitor, Save, RotateCcw } from "lucide-react";
import {
  LoggingConfig,
  loadLoggingConfig,
  saveLoggingConfig,
  DEFAULT_LOGGING_CONFIG,
} from "../config/logging";
import { cn } from "../utils/cn";

interface LoggingSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange: (config: LoggingConfig) => void;
  onResetChoice?: () => void;
}

export const LoggingSettings: React.FC<LoggingSettingsProps> = ({
  isOpen,
  onClose,
  onConfigChange,
  onResetChoice,
}) => {
  const [config, setConfig] = useState<LoggingConfig>(loadLoggingConfig());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadLoggingConfig());
      setHasChanges(false);
    }
  }, [isOpen]);

  const handleConfigChange = (updates: Partial<LoggingConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    setHasChanges(true);
  };

  const handleSave = () => {
    saveLoggingConfig(config);
    onConfigChange(config);
    setHasChanges(false);
  };

  const handleReset = () => {
    setConfig(DEFAULT_LOGGING_CONFIG);
    setHasChanges(true);
  };

  const handleCancel = () => {
    setConfig(loadLoggingConfig());
    setHasChanges(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Logging Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition-colors"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Terminal settings removed: web UI is the only destination */}

          {/* Web UI Settings */}
          {config.destination === "web-ui" && (
            <div className="space-y-3 p-4 border border-border rounded-lg">
              <h4 className="text-md font-medium flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Web UI Settings
              </h4>

              <div className="space-y-3">
                {/* Web UI is always enabled */}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Log Level</label>
                  <select
                    value={config.webUi.level}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          level: e.target.value as any,
                        },
                      })
                    }
                    className="w-full p-2 border border-border rounded-md bg-background"
                  >
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Logs</label>
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    value={config.webUi.maxLogs}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          maxLogs: parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-full p-2 border border-border rounded-md bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of logs to keep in memory
                  </p>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.webUi.autoScroll}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          autoScroll: e.target.checked,
                        },
                      })
                    }
                    className="rounded border-border"
                  />
                  <span>Auto-scroll to new logs</span>
                </label>
              </div>
            </div>
          )}

          {/* Web UI Styling Settings */}
          {(config.destination === "web-ui" ||
            config.destination === "both") && (
            <div className="space-y-3 p-4 border border-border rounded-lg">
              <h4 className="text-md font-medium flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Web UI Styling
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Font Size */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Font Size</label>
                  <select
                    value={config.webUi.styling.fontSize}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          styling: {
                            ...config.webUi.styling,
                            fontSize: e.target.value as any,
                          },
                        },
                      })
                    }
                    className="w-full p-2 border border-border rounded-md bg-background"
                  >
                    <option value="xs">Extra Small</option>
                    <option value="sm">Small</option>
                    <option value="base">Base</option>
                    <option value="lg">Large</option>
                    <option value="xl">Extra Large</option>
                  </select>
                </div>

                {/* Line Height */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Line Height</label>
                  <select
                    value={config.webUi.styling.lineHeight}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          styling: {
                            ...config.webUi.styling,
                            lineHeight: e.target.value as any,
                          },
                        },
                      })
                    }
                    className="w-full p-2 border border-border rounded-md bg-background"
                  >
                    <option value="tight">Tight</option>
                    <option value="normal">Normal</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </div>

                {/* Color Scheme */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Color Scheme</label>
                  <select
                    value={config.webUi.styling.colorScheme}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          styling: {
                            ...config.webUi.styling,
                            colorScheme: e.target.value as any,
                          },
                        },
                      })
                    }
                    className="w-full p-2 border border-border rounded-md bg-background"
                  >
                    <option value="default">Default</option>
                    <option value="high-contrast">High Contrast</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>

                {/* Max Line Length */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Line Length</label>
                  <input
                    type="number"
                    min="60"
                    max="200"
                    value={config.webUi.styling.maxLineLength}
                    onChange={(e) =>
                      handleConfigChange({
                        webUi: {
                          ...config.webUi,
                          styling: {
                            ...config.webUi.styling,
                            maxLineLength: parseInt(e.target.value),
                          },
                        },
                      })
                    }
                    className="w-full p-2 border border-border rounded-md bg-background"
                  />
                </div>
              </div>

              {/* Display Options */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium">Display Options</h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.webUi.styling.showTimestamps}
                      onChange={(e) =>
                        handleConfigChange({
                          webUi: {
                            ...config.webUi,
                            styling: {
                              ...config.webUi.styling,
                              showTimestamps: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-border"
                    />
                    <span>Show timestamps</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.webUi.styling.showServiceNames}
                      onChange={(e) =>
                        handleConfigChange({
                          webUi: {
                            ...config.webUi,
                            styling: {
                              ...config.webUi.styling,
                              showServiceNames: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-border"
                    />
                    <span>Show service names</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.webUi.styling.showLogLevels}
                      onChange={(e) =>
                        handleConfigChange({
                          webUi: {
                            ...config.webUi,
                            styling: {
                              ...config.webUi.styling,
                              showLogLevels: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-border"
                    />
                    <span>Show log levels</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.webUi.styling.compactMode}
                      onChange={(e) =>
                        handleConfigChange({
                          webUi: {
                            ...config.webUi,
                            styling: {
                              ...config.webUi.styling,
                              compactMode: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-border"
                    />
                    <span>Compact mode</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.webUi.styling.wordWrap}
                      onChange={(e) =>
                        handleConfigChange({
                          webUi: {
                            ...config.webUi,
                            styling: {
                              ...config.webUi.styling,
                              wordWrap: e.target.checked,
                            },
                          },
                        })
                      }
                      className="rounded border-border"
                    />
                    <span>Word wrap</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
            {onResetChoice && (
              <button
                onClick={onResetChoice}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Choice
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors",
                hasChanges
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
