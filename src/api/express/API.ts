import express from "express";
import path from "path";
import { createServer, Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { Socket as NetSocket } from "net";
import type { Logger } from "@/cli/exports";
import { ProcItem } from "@/log-ui/types";

import { setupMiddleware } from "./middleware";
import { createHealthRoutes } from "./routes/healthRoutes";
import { createServicesRoutes } from "./routes/servicesRoutes";
import { HealthController } from "./controllers/HealthController";
import { ServicesController } from "./controllers/ServicesController";
import { ServiceManager } from "./services/ServiceManager";
import { LogStreamingService } from "./services/LogStreamingService";
import { SocketIOService } from "./services/SocketIOService";
import { DockerMetricsCollector } from "./services/DockerMetricsCollector";
import { AppServiceManager } from "@/modes/execution/services/AppServiceManager";

// Generic service manager interface
export interface IServiceManager {
  getRunningServices(): Map<string, any>;
  isServiceRunning(serviceName: string): boolean;
  getServiceStatus(serviceName: string): any;
}

// Generic execution config interface
export interface IExecutionConfig {
  [key: string]: any;
}

/**
 * Express-based web API and WebSocket gateway for shikamaru.
 *
 * Responsibilities:
 * - Serve REST endpoints for health and service information
 * - Host Socket.IO for real-time log streaming
 * - Serve the built React log UI assets
 */
export class ProcessExpressAPI {
  /** Application logger used across API components. */
  private logger: Logger;

  private app: express.Application;
  private server!: HTTPServer;
  private io!: SocketIOServer;

  private port: number;
  private readonly corsOrigins?: string[] | "*";

  private serverRunning = false;
  private startPromise = null;
  private stopPromise: Promise<void> | null = null;

  // Track raw TCP sockets for graceful shutdown
  private sockets = new Set<NetSocket>();

  // Services
  private serviceManager: ServiceManager;
  private logStreamingService: LogStreamingService;
  private socketIOService!: SocketIOService;
  private dockerMetricsCollector?: DockerMetricsCollector;

  // Controllers
  private healthController: HealthController;
  private servicesController: ServicesController;

  // Debounce broadcast timer
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor(
    logger: Logger,
    port: number = Number(process.env.PORT) || 3015,
    serviceManager: IServiceManager,
    private appProcesses: ProcItem[],
    private ports: Map<string, number>,
    private executionConfig: IExecutionConfig,
    private manager: AppServiceManager,
    corsOrigins?: string[] | "*"
  ) {
    this.logger = logger;
    this.port = port;
    this.corsOrigins = corsOrigins ?? "*";

    // Initialize Express app
    this.app = express();
    setupMiddleware(this.app);

    // Create HTTP server
    this.server = createServer(this.app);

    // Track open sockets (so we can destroy them on shutdown)
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });

    // Initialize Socket.IO
    this.io = new SocketIOServer(this.server, {
      path: "/socket.io",
      cors: {
        origin: this.corsOrigins,
        methods: ["GET", "POST"],
      },
    });

    // Initialize services
    // Start background docker metrics collector (non-blocking)
    this.dockerMetricsCollector = new DockerMetricsCollector(this.logger, {
      pollIntervalMs: 3000,
      enabled: true,
    });
    this.dockerMetricsCollector.start();

    this.serviceManager = new ServiceManager(
      logger,
      appProcesses,
      ports,
      serviceManager,
      manager,
      this.dockerMetricsCollector
    );

    this.logStreamingService = new LogStreamingService(this.io, logger);

    // Add process items to the streaming service
    this.logStreamingService.addProcessItems(appProcesses, ports);

    this.socketIOService = new SocketIOService(
      this.io,
      this.logStreamingService,
      logger
    );

    // Initialize controllers
    this.healthController = new HealthController(
      () => this.socketIOService.getConnectedClientsCount(),
      () => this.serviceManager.getAppProcesses().length
    );

    this.servicesController = new ServicesController(
      this.serviceManager,
      this.logStreamingService
    );

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Wire up REST routes and static UI handlers.
   */
  private setupRoutes(): void {
    // Health routes
    const healthRoutes = createHealthRoutes(this.healthController);
    this.app.use("/", healthRoutes);

    // Services routes
    const servicesRoutes = createServicesRoutes(this.servicesController);
    this.app.use("/", servicesRoutes);

    // Serve React UI build under /ui (resolve relative to compiled dist folder)
    const uiDir = path.resolve(__dirname, "../../../dist/public/ui");
    this.app.use(express.static(uiDir));

    this.app.get(/^\/(.*)?$/, (_req, res) => {
      res.sendFile(path.join(uiDir, "index.html"));
    });
  }
  /**
   * Start the HTTP server and Socket.IO (idempotent).
   * Automatically retries on EADDRINUSE by incrementing the port.
   */
  async start() {
    if (this.serverRunning) {
      this.logger.warning("Express API is already running");
      return ``;
    }
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = new Promise<string>((resolve, reject) => {
      const maxRetries = 10;
      let attempts = 0;
      const tryListen = () => {
        attempts++;
        this.server
          .once("listening", () => {
            this.serverRunning = true;
            resolve(this.printBanner());
          })
          .once("error", (error: any) => {
            if (error?.code === "EADDRINUSE" && attempts < maxRetries) {
              const oldPort = this.port;
              this.port++;
              this.logger.warning(
                `⚠️  Port ${oldPort} in use, retrying on ${this.port} (attempt ${attempts}/${maxRetries})`
              );
              // Give the event loop a tick before re-listen
              setTimeout(tryListen, 50);
            } else if (error?.code === "EADDRINUSE") {
              reject(
                new Error(
                  `Failed to bind after ${maxRetries} attempts starting from ${
                    this.port - (attempts - 1)
                  }`
                )
              );
            } else {
              reject(error);
            }
          });

        this.server.listen(this.port);
      };

      tryListen();
    }).catch((e) => {
      // Clear startPromise on failure so caller can retry
      this.startPromise = null;
      throw e;
    });

    return this.startPromise;
  }

  private printBanner() {
    const mode = (process.env.NODE_ENV || "development").toLowerCase();
    const uiUrl = `http://localhost:${this.port}`;
    this.logger.success(
      `✅ Web logging API started on port ${this.port} (${mode})`
    );
    const clickable = this.logger.asHyperlink(uiUrl);
    if (mode === "production") {
      this.logger.info(
        `🧩 Serving built UI assets from dist/public/ui (single-bundle mode)`
      );
    } else {
      this.logger.info(
        `🛠️ Development mode active. If running Vite separately, ensure VITE_BACKEND_URL points to ${uiUrl}`
      );
    }
    this.logger.info(`🔗 Open the UI in your browser: ${clickable}`);
    return clickable;
  }

  /** Stop the HTTP and Socket.IO servers (idempotent). */
  async stop(): Promise<void> {
    if (!this.serverRunning) {
      this.logger.warning("Express API is not running");
      return;
    }
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = new Promise<void>((resolve) => {
      this.logger.info("🛑 Stopping Express API server...");

      // Stop background collectors first
      try {
        this.dockerMetricsCollector?.stop();
      } catch (e) {
        this.logger.debug?.("DockerMetricsCollector stop error ignored");
      }

      // Close all socket connections
      this.sockets.forEach((socket) => {
        socket.destroy();
      });
      this.sockets.clear();

      // Close Socket.IO
      this.io.close(() => {
        this.logger.debug("Socket.IO server closed");
      });

      // Close HTTP server
      this.server.close(() => {
        this.serverRunning = false;
        this.logger.success("✅ Express API server stopped");
        resolve();
      });
    });

    return this.stopPromise;
  }

  /** Current listening port (can differ from requested when retried). */
  getPort(): number {
    return this.port;
  }

  /** Whether the server is currently accepting connections. */
  isRunning(): boolean {
    return this.serverRunning;
  }

  /** Expose the Socket.IO server instance when needed. */
  getSocketIO(): SocketIOServer {
    return this.io;
  }

  /** Expose the Express application instance for integration. */
  getApp(): express.Application {
    return this.app;
  }

  /** Expose the underlying Node HTTP server. */
  getServer(): HTTPServer {
    return this.server;
  }

  /** Emit a Socket.IO event to all connected clients. */
  broadcast(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /** Fetch current application service status snapshot. */
  getServicesStatus(): any[] {
    return this.serviceManager.getServicesStatus();
  }

  /** Return recent logs for a given service. */
  getServiceLogs(serviceName: string, lines: number = 100): string[] {
    return this.logStreamingService.getServiceLogs(serviceName, lines);
  }

  /** Attempt to stop a specific service by name. */
  async stopService(serviceName: string): Promise<any> {
    return this.serviceManager.stopServiceByName(serviceName);
  }

  /** Compute and return the current health status object. */
  getHealthStatus(): any {
    return this.healthController.retrieveCurrentSystemHealthStatus();
  }

  /** Number of active Socket.IO clients. */
  getConnectedClientsCount(): number {
    return this.socketIOService.getConnectedClientsCount();
  }

  /** Debounced broadcast to avoid spamming clients with rapid updates. */
  broadcastDebounced(event: string, data: any, delay: number = 100): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
    }

    this.broadcastTimer = setTimeout(() => {
      this.broadcast(event, data);
      this.broadcastTimer = null;
    }, delay);
  }
}
