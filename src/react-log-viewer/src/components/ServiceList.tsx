import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Socket } from "socket.io-client";
import { Service } from "../types";
import { cn } from "../utils/cn";
import { BACKEND_CONFIG } from "../config/urls";
import { useLogViewer } from "../contexts/LogViewerContext";
import {
  Server,
  Clock,
  Cpu,
  HardDrive,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  Square,
} from "lucide-react";

interface ServiceListProps {
  services: Service[];
  onRefresh: () => void;
  socket: Socket | null;
}

export const ServiceList: React.FC<ServiceListProps> = ({
  services,
  onRefresh,
  socket,
}) => {
  const { servicesLoading } = useLogViewer();

  const navigate = useNavigate();

  const [, setLastRefreshTime] = useState<Date | null>(null);
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const [stopAllStatus, setStopAllStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Update last refresh time when services are loaded
  React.useEffect(() => {
    if (!servicesLoading && services.length > 0) {
      setLastRefreshTime(new Date());
    }
  }, [servicesLoading, services.length]);

  const handleStopAllServices = async () => {
    // Add confirmation dialog
    const confirmed = window.confirm(
      "Are you sure you want to stop all services? This action cannot be undone."
    );

    if (!confirmed) return;

    setIsStoppingAll(true);

    try {
      const response = await fetch(
        `${BACKEND_CONFIG.BASE_URL}/api/services/stop-all`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (result.success) {
        // Emit action to socket for real-time updates (optional)
        socket?.emit("service-action", {
          action: "stop-all",
          success: true,
        });

        console.log("✅ All services stopped successfully");
        setStopAllStatus({
          type: "success",
          message: "All services stopped successfully!",
        });

        // Refresh services list after stopping all
        setTimeout(() => {
          onRefresh();
          // Clear status after 3 seconds
          setTimeout(() => {
            setStopAllStatus({ type: null, message: "" });
          }, 3000);
        }, 1000);
      } else {
        console.error(
          "❌ Failed to stop all services:",
          result.error || result.message
        );
        setStopAllStatus({
          type: "error",
          message:
            result.error || result.message || "Failed to stop all services",
        });
      }
    } catch (error) {
      console.error("❌ Failed to stop all services:", error);
      setStopAllStatus({
        type: "error",
        message: "Network error occurred while stopping services",
      });
    } finally {
      setIsStoppingAll(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "stopped":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "starting":
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  // Parse metrics for better display
  const parseMemory = (memory: string) => {
    if (!memory) return null;
    // Handle format like "35MB", "36MB", "49MB"
    const match = memory.match(/^(\d+(?:\.\d+)?)(MB|GB|KB)$/);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: match[2],
        raw: memory,
      };
    }
    console.warn("Failed to parse memory:", memory);
    return null;
  };

  const parseCPU = (cpu: string) => {
    if (!cpu) return null;
    // Handle format like "0.00%"
    const match = cpu.match(/^(\d+(?:\.\d+)?)%$/);
    if (match) {
      return parseFloat(match[1]);
    }
    console.warn("Failed to parse CPU:", cpu);
    return null;
  };

  const parseUptime = (uptime: string) => {
    if (!uptime) return null;
    // Handle format like "0h 27m 38s"
    const match = uptime.match(/^(\d+)h\s+(\d+)m\s+(\d+)s$/);
    if (match) {
      return {
        hours: parseInt(match[1]),
        minutes: parseInt(match[2]),
        seconds: parseInt(match[3]),
        raw: uptime,
      };
    }
    console.warn("Failed to parse uptime:", uptime);
    return null;
  };

  const { setFilters } = useLogViewer();

  const handleViewLogs = (serviceName: string) => {
    setFilters({
      services: [serviceName],
      levels: ["info", "warn", "error", "debug"],
      search: "",
    });
    // Navigate to logs page (root route renders LogsPage)
    navigate("/");
  };

  return (
    <div className="space-y-4">
      {/* Stop All Services Button */}
      {services.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-3 text-red-800">
              <Square className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Stop All Services</span>
                <span className="text-xs text-red-600">
                  {services.length} service{services.length !== 1 ? "s" : ""}{" "}
                  will be stopped
                </span>
              </div>
            </div>
            <button
              onClick={handleStopAllServices}
              disabled={isStoppingAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-md transition-colors"
            >
              {isStoppingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Stopping…</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  <span>Stop All</span>
                </>
              )}
            </button>
          </div>

          {stopAllStatus.type && (
            <div
              className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
                stopAllStatus.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {stopAllStatus.type === "success" ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>{stopAllStatus.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Table Header */}
      <div className="service-table">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Uptime</th>
                <th>Port</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const memoryData = parseMemory(service.memoryUsage || "");
                const cpuData = parseCPU(service.cpuUsage || "");
                const uptimeData = parseUptime(service.uptime || "");

                return (
                  <tr key={service.name}>
                    {/* Service Name */}
                    <td>
                      <div className="service-name">
                        {getStatusIcon(service.status)}
                        <div className="details">
                          <div className="name">{service.name}</div>
                          <div className="pid">PID: {service.pid || "N/A"}</div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <span
                        className={cn(
                          "status-badge",
                          service.status === "running" && "running",
                          service.status === "stopped" && "stopped",
                          service.status === "starting" && "starting"
                        )}
                      >
                        {service.status === "running" && (
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1.5"></div>
                        )}
                        {service.status}
                      </span>
                    </td>

                    {/* CPU */}
                    <td>
                      <div className="metric-display">
                        <Cpu className="icon text-blue-500" />
                        <span className="value">
                          {cpuData ? `${cpuData}%` : service.cpuUsage || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Memory */}
                    <td>
                      <div className="metric-display">
                        <HardDrive className="icon text-green-500" />
                        <span className="value">
                          {memoryData
                            ? `${memoryData.value}${memoryData.unit}`
                            : service.memoryUsage || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Uptime */}
                    <td>
                      <div className="metric-display">
                        <Clock className="icon text-purple-500" />
                        <span className="value">
                          {uptimeData
                            ? `${uptimeData.hours}h ${uptimeData.minutes}m`
                            : service.uptime || "N/A"}
                        </span>
                      </div>
                    </td>

                    {/* Port */}
                    <td>
                      <span className="text-sm text-muted-foreground">
                        {service.port ? `:${service.port}` : "N/A"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="flex items-center space-x-2">
                        {service.status === "starting" && (
                          <div className="action-button">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Starting
                          </div>
                        )}

                        <button
                          onClick={() => handleViewLogs(service.name)}
                          className="action-button secondary"
                        >
                          <FileText className="w-3 h-3" />
                          Logs
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {services.length === 0 && (
        <div className="text-center py-12">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No Services Found
          </h3>
          <p className="text-muted-foreground">
            No services are currently available.
          </p>
        </div>
      )}
    </div>
  );
};
