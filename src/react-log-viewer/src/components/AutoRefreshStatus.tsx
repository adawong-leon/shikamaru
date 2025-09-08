import React from "react";
import { useLogViewer } from "../contexts/LogViewerContext";
import { Clock, Pause, PlayCircle } from "lucide-react";
import { cn } from "../utils/cn";

export const AutoRefreshStatus: React.FC = () => {
  const { isAutoRefreshEnabled, toggleAutoRefresh } = useLogViewer();

  if (!isAutoRefreshEnabled) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md">
      <div className="flex items-center space-x-1">
        <Clock className="w-4 h-4 text-green-600" />
        <span className="text-sm font-medium text-green-700">Auto-refresh</span>
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      </div>

      <button
        onClick={toggleAutoRefresh}
        className="p-1 rounded hover:bg-green-100 transition-colors"
        title="Stop auto-refresh"
      >
        <Pause className="w-3 h-3 text-green-600" />
      </button>
    </div>
  );
};
