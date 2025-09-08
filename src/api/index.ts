// Generic API Module Exports

// Express API
export { ProcessExpressAPI } from "./express/API";

// Controllers
export { HealthController } from "./express/controllers/HealthController";
export { ServicesController } from "./express/controllers/ServicesController";

// Services
export { SocketIOService } from "./express/services/SocketIOService";
export { LogStreamingService } from "./express/services/LogStreamingService";
export { ServiceManager } from "./express/services/ServiceManager";

// Routes
export { createHealthRoutes } from "./express/routes/healthRoutes";
export { createServicesRoutes } from "./express/routes/servicesRoutes";

// Types
export type {
  LogMessage,
  ServiceStatus,
  ProcessState,
  ServiceOperationResult,
  HealthCheckResponse,
  ServicesResponse,
} from "./express/types";

// Middleware
export { setupMiddleware } from "./express/middleware";
