import { useState, useCallback, useEffect, useRef } from "react";
import { Service } from "../types";
import { getApiUrl, BACKEND_CONFIG } from "../config/urls";

export interface UseServicesReturn {
  services: Service[];
  setServices: (services: Service[]) => void;
  refreshServices: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  isAutoRefreshEnabled: boolean;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
  toggleAutoRefresh: () => void;
}

export const useServices = (): UseServicesReturn => {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const REFRESH_INTERVAL = 15000; // 15 seconds

  const refreshServices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl(BACKEND_CONFIG.API.SERVICES));

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log("Services fetched successfully:", result.data);
        setServices(result.data);
      } else {
        throw new Error(result.message || "Failed to fetch services");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("Failed to refresh services:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsAutoRefreshEnabled(true);
    intervalRef.current = setInterval(() => {
      refreshServices();
    }, REFRESH_INTERVAL);

    console.log("Auto-refresh started - refreshing services every 15 seconds");
  }, [refreshServices]);

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsAutoRefreshEnabled(false);
    console.log("Auto-refresh stopped");
  }, []);

  const toggleAutoRefresh = useCallback(() => {
    if (isAutoRefreshEnabled) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  }, [isAutoRefreshEnabled, startAutoRefresh, stopAutoRefresh]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    // Fetch services immediately on mount
    refreshServices();

    // Start auto-refresh if enabled
    if (isAutoRefreshEnabled) {
      startAutoRefresh();
    }

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []); // Only run on mount

  return {
    services,
    setServices,
    refreshServices,
    isLoading,
    error,
    isAutoRefreshEnabled,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,
  };
};
