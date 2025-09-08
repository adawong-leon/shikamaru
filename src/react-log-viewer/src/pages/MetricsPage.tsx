import React from "react";
import { ServiceList } from "../components/ServiceList";
import { useLogViewer } from "../contexts/LogViewerContext";

export const MetricsPage: React.FC = () => {
  const { services, refreshServices, servicesLoading, socket } = useLogViewer();

  return (
    <div className="space-y-6">
      {/* Metrics Page */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Service Metrics</h2>
          <button
            onClick={refreshServices}
            disabled={servicesLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {servicesLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <ServiceList
          services={services}
          onRefresh={refreshServices}
          socket={socket}
        />
      </div>
    </div>
  );
};
