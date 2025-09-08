export interface LogMessage {
  serviceName: string;
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error" | "debug";
  metadata?: {
    requestId?: string;
    userId?: string;
    endpoint?: string;
    responseTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
    pid?: number;
    port?: number;
    sourceId?: string;
    sourceType?: "process" | "docker" | "file" | "api" | "custom";
    [key: string]: any; // Allow additional metadata fields
  };
}

export interface ServiceStatus {
  name: string;
  type: "app" | "infra" | "database" | "cache" | "queue" | "application";
  status: "running" | "starting" | "stopped" | "error";
  port?: number;
  uptime?: string;
  memoryUsage?: string;
  cpuUsage?: string;
  pid?: number;
}

export interface ProcessState {
  totalServices: number;
  runningServices: number;
  stoppedServices: number;
  services: Array<{
    name: string;
    pid?: number;
    status: "running" | "stopped";
    uptime: string;
    memoryUsage: string;
    cpuUsage: string;
  }>;
}

export interface ServiceOperationResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
  connectedClients: number;
  applicationProcesses: number;
}

export interface ServicesResponse {
  success: boolean;
  data: ServiceStatus[];
  summary?: {
    total: number;
    application: number;
    running: number;
  };
  count?: number;
  timestamp: string;
}
