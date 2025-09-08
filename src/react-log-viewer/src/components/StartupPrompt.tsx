import React, { useState } from "react";
import { Monitor, ArrowRight } from "lucide-react";
import {
  LoggingConfig,
  LoggingDestination,
  saveLoggingConfig,
} from "../config/logging";
import { cn } from "../utils/cn";

interface StartupPromptProps {
  onChoice: (config: LoggingConfig) => void;
}

export const StartupPrompt: React.FC<StartupPromptProps> = ({ onChoice }) => {
  const [selectedDestination, setSelectedDestination] =
    useState<LoggingDestination | null>("web-ui");
  const [isLoading, setIsLoading] = useState(false);

  const handleDestinationSelect = (destination: LoggingDestination) => {
    setSelectedDestination(destination);
  };

  const handleContinue = () => {
    if (!selectedDestination) return;

    setIsLoading(true);

    // Create configuration based on selection
    const config: LoggingConfig = {
      destination: selectedDestination,
      terminal: {
        enabled:
          selectedDestination === "terminal" || selectedDestination === "both",
        level: selectedDestination === "terminal" ? "info" : "debug",
        timestamp: true,
        colors: true,
      },
      webUi: {
        enabled:
          selectedDestination === "web-ui" || selectedDestination === "both",
        level: "debug",
        maxLogs: selectedDestination === "web-ui" ? 2000 : 1000,
        autoScroll: true,
      },
    };

    // Save configuration
    saveLoggingConfig(config);

    // Notify parent component
    setTimeout(() => {
      onChoice(config);
    }, 500); // Small delay for smooth transition
  };

  const destinations = [
    {
      value: "web-ui" as LoggingDestination,
      label: "Web UI",
      description:
        "View logs in the browser interface with filtering and search",
      icon: Monitor,
      features: [
        "Real-time log streaming",
        "Advanced filtering & search",
        "Log statistics & metrics",
        "Service management",
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="text-center p-8 border-b border-border">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Terminal className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Welcome to React Log Viewer
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose your preferred logging destination to get started
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {destinations.map(
              ({ value, label, description, icon: Icon, features }) => (
                <button
                  key={value}
                  onClick={() => handleDestinationSelect(value)}
                  className={cn(
                    "group relative p-6 rounded-xl border-2 transition-all duration-200 text-left",
                    selectedDestination === value
                      ? "border-primary bg-primary/5 shadow-lg scale-105"
                      : "border-border hover:border-primary/50 hover:shadow-md"
                  )}
                >
                  {/* Selection indicator */}
                  {selectedDestination === value && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors",
                      selectedDestination === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                    )}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-semibold mb-2">{label}</h3>

                  {/* Description */}
                  <p className="text-muted-foreground mb-4 text-sm">
                    {description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2">
                    {features.map((feature, index) => (
                      <li
                        key={index}
                        className="flex items-center text-sm text-muted-foreground"
                      >
                        <div className="w-1.5 h-1.5 bg-primary rounded-full mr-2" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            )}
          </div>

          {/* Continue Button */}
          <div className="text-center">
            <button
              onClick={handleContinue}
              disabled={!selectedDestination || isLoading}
              className={cn(
                "inline-flex items-center gap-2 px-8 py-3 rounded-lg font-medium transition-all duration-200",
                selectedDestination && !isLoading
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Continue with{" "}
                  {selectedDestination
                    ? destinations.find((d) => d.value === selectedDestination)
                        ?.label
                    : "Selection"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-muted/20">
          <p className="text-center text-sm text-muted-foreground">
            You can change this setting later in the application settings
          </p>
        </div>
      </div>
    </div>
  );
};
