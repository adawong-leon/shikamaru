import React from "react";
import { ConnectionStatus as ConnectionStatusType } from "../types";
import { cn } from "../utils/cn";
import { Wifi, WifiOff, AlertCircle } from "lucide-react";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
}) => {
  const getStatusIcon = () => {
    if (status.connecting) {
      return (
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      );
    }
    if (status.connected) {
      return <Wifi className="w-4 h-4 text-green-500" />;
    }
    if (status.error) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    return <WifiOff className="w-4 h-4 text-gray-500" />;
  };

  const getStatusText = () => {
    if (status.connecting) return "Connecting...";
    if (status.connected) return "Connected";
    if (status.error) return "Connection Error";
    return "Disconnected";
  };

  const getStatusColor = () => {
    if (status.connecting) return "text-blue-500";
    if (status.connected) return "text-green-500";
    if (status.error) return "text-red-500";
    return "text-gray-500";
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center space-x-3">
        {getStatusIcon()}
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">
            Connection Status
          </h3>
          <p className={cn("text-xs", getStatusColor())}>{getStatusText()}</p>
          {status.error && (
            <p className="text-xs text-red-500 mt-1">{status.error}</p>
          )}
        </div>
      </div>
    </div>
  );
};
