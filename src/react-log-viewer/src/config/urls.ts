// Centralized URL configuration for the React Log Viewer
// This provides a single source of truth for all backend connections

export const BACKEND_CONFIG = {
  // Main backend server
  BASE_URL: import.meta.env.VITE_BACKEND_URL || "http://localhost:3001",

  // API endpoints
  API: {
    SERVICES: "/api/services",
    PROCESS_ACTION: "/api/process-action",
    HEALTH: "/health",
  },

  // Socket.IO configuration
  SOCKET: {
    NAMESPACE: "/",
    TRANSPORTS: ["websocket", "polling"],
    TIMEOUT: 5000,
  },

  // Frontend configuration
  FRONTEND: {
    PORT: 3002,
    DEV_PORT: 3003, // Fallback port if 3002 is in use
  },
} as const;

// Helper functions for URL construction
export const getApiUrl = (endpoint: string): string => {
  return `${BACKEND_CONFIG.BASE_URL}${endpoint}`;
};

export const getSocketUrl = (): string => {
  return BACKEND_CONFIG.BASE_URL;
};

// Environment-specific configurations
export const isDevelopment = import.meta.env.DEV;
export const isProduction = import.meta.env.PROD;

// URL validation
export const validateBackendUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Default URLs for different environments
export const DEFAULT_URLS = {
  development: "http://localhost:3001",
  production: "https://your-production-backend.com", // Update this for production
} as const;

// Get the appropriate backend URL based on environment
export const getBackendUrl = (): string => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && validateBackendUrl(envUrl)) {
    return envUrl;
  }

  return isDevelopment ? DEFAULT_URLS.development : DEFAULT_URLS.production;
};

// Export the current backend URL
export const CURRENT_BACKEND_URL = getBackendUrl();
