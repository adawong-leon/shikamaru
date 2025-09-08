import React, { useState, useEffect } from "react";
import { Database, Trash2, Eye, RefreshCw } from "lucide-react";
import { cn } from "../utils/cn";

interface StorageInfo {
  key: string;
  exists: boolean;
  size?: number;
  preview?: string;
  error?: string;
}

export const StorageDebugger: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [storageInfo, setStorageInfo] = useState<StorageInfo[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const checkStorage = () => {
    const keys = [
      "react-log-viewer-logs",
      "react-log-viewer-compressed-logs",
      "react-log-viewer-stats",
      "react-log-viewer-user-id",
      "react-log-viewer-session-start",
      "react-log-viewer-logging-config",
    ];

    const info: StorageInfo[] = keys.map((key) => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          return {
            key,
            exists: true,
            size: value.length,
            preview:
              value.length > 100 ? value.substring(0, 100) + "..." : value,
          };
        } else {
          return { key, exists: false };
        }
      } catch (e) {
        return { key, exists: false, error: (e as Error).message };
      }
    });

    setStorageInfo(info);
  };

  const clearStorage = () => {
    if (confirm("Are you sure you want to clear all localStorage data?")) {
      try {
        const keysToRemove = [
          "react-log-viewer-logs",
          "react-log-viewer-compressed-logs",
          "react-log-viewer-stats",
          "react-log-viewer-user-id",
          "react-log-viewer-session-start",
          "react-log-viewer-logging-config",
        ];

        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
        });

        // Clear all react-log-viewer keys
        const allKeys = Object.keys(localStorage);
        allKeys.forEach((key) => {
          if (key.startsWith("react-log-viewer-")) {
            localStorage.removeItem(key);
          }
        });

        alert("localStorage cleared! Please refresh the page.");
        checkStorage();
      } catch (error) {
        alert("Failed to clear localStorage: " + (error as Error).message);
      }
    }
  };

  useEffect(() => {
    checkStorage();
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className={cn(
          "fixed bottom-4 right-4 p-2 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors z-50",
          className
        )}
        title="Storage Debugger"
      >
        <Database className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 w-96 bg-card border border-border rounded-lg shadow-lg p-4 z-50 max-h-96 overflow-y-auto",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Database className="w-4 h-4" />
          Storage Debugger
        </h3>
        <div className="flex gap-1">
          <button
            onClick={checkStorage}
            className="p-1 hover:bg-muted rounded"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={clearStorage}
            className="p-1 hover:bg-muted rounded text-red-500"
            title="Clear All"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-muted rounded"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        {storageInfo.map((info) => (
          <div
            key={info.key}
            className="border-b border-border/50 pb-2 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-muted-foreground">
                {info.key}
              </span>
              <span
                className={cn(
                  "px-1 py-0.5 rounded text-[10px]",
                  info.exists
                    ? "bg-green-500/10 text-green-600"
                    : "bg-gray-500/10 text-gray-600"
                )}
              >
                {info.exists ? "EXISTS" : "NOT FOUND"}
              </span>
            </div>
            {info.exists && (
              <div className="mt-1 text-muted-foreground">
                <div>Size: {info.size} bytes</div>
                {info.preview && (
                  <div className="mt-1 p-1 bg-muted/50 rounded text-[10px] font-mono break-all">
                    {info.preview}
                  </div>
                )}
              </div>
            )}
            {info.error && (
              <div className="mt-1 text-red-500 text-[10px]">
                Error: {info.error}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <div>Total keys: {storageInfo.length}</div>
        <div>Existing: {storageInfo.filter((i) => i.exists).length}</div>
        <div>
          Total size: {storageInfo.reduce((sum, i) => sum + (i.size || 0), 0)}{" "}
          bytes
        </div>
      </div>
    </div>
  );
};

export default StorageDebugger;
