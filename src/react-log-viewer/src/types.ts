export interface LogEntry {
  id?: string;
  timestamp: string;
  level: string;
  serviceName: string;
  message: string;
  html?: string; // HTML version with ANSI colors converted
  metadata?: {
    sourceId?: string;
    sourceType?: string;
    rawMessage?: string;
    [key: string]: any;
  };
  parsed?: {
    type: "json" | "text";
    data: any;
    level?: string;
    message?: string;
    timestamp?: string;
    service?: string;
    trace?: string;
    error?: string;
    metadata: Record<string, any>;
  };
}

export interface Service {
  name: string;
  type: "application" | "mock";
  status: "running" | "stopped" | "starting";
  port?: number;
  health?: "healthy" | "unhealthy" | "unknown";
  uptime?: string;
  memoryUsage?: string;
  cpuUsage?: string;
  pid?: number;
  isApplicationProcess?: boolean;
}

export interface LogFilters {
  services: string[];
  levels: string[];
  search: string;
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  error?: string;
}

export interface LogStats {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  debug: number;
  services: Set<string>;
}

export interface ServiceAction {
  type: "start" | "logs" | "health-check";
  target: string;
  targetType: "app" | "infra" | "all";
}
