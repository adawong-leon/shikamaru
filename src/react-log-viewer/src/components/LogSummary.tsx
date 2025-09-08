import React from "react";
import { useLogViewer } from "../contexts/LogViewerContext";
import { formatTimestamp } from "../utils/logUtils";

/**
 * Example component demonstrating the new architecture
 * Shows how to use the context and utility functions
 */
export const LogSummary: React.FC = () => {
  const { 
    logs, 
    stats, 
    connectionStatus, 
    services,
    isConnected 
  } = useLogViewer();

  const latestLog = logs[logs.length - 1];
  const serviceCount = services.length;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Log Summary
      </h3>
      
      {/* Connection Status */}
      <div className="flex items-center space-x-2">
        <div 
          className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`} 
        />
        <span className="text-sm text-gray-600">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {stats.total}
          </div>
          <div className="text-xs text-gray-500">Total Logs</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {serviceCount}
          </div>
          <div className="text-xs text-gray-500">Services</div>
        </div>
      </div>

      {/* Error Count */}
      {stats.errors > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex items-center space-x-2">
            <span className="text-red-600 font-medium">
              {stats.errors} Error{stats.errors !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Latest Log */}
      {latestLog && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            Latest Log
          </h4>
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <span className="font-medium">Service:</span> {latestLog.serviceName}
            </div>
            <div>
              <span className="font-medium">Level:</span> {latestLog.level}
            </div>
            <div>
              <span className="font-medium">Time:</span> {formatTimestamp(latestLog.timestamp)}
            </div>
            <div className="text-gray-700 mt-2">
              {latestLog.message}
            </div>
          </div>
        </div>
      )}

      {/* Connection Details */}
      {connectionStatus.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <div className="text-sm text-yellow-800">
            <strong>Connection Error:</strong> {connectionStatus.error}
          </div>
        </div>
      )}
    </div>
  );
};
