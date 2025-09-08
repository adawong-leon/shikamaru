import { Server as SocketIOServer } from "socket.io";
import type { Logger } from "@/cli/exports";
import { LogMessage } from "../types";
import { LogStreamingService } from "./LogStreamingService";

/**
 * Socket.IO façade used by the API to track client connections and
 * forward buffered log batches to new clients.
 */
export class SocketIOService {
  private io: SocketIOServer;
  private logger: Logger;
  private connectedClients: Set<string> = new Set();
  private logStreamingService: LogStreamingService;
  constructor(
    io: SocketIOServer,
    logStreamingService: LogStreamingService,
    logger: Logger
  ) {
    this.io = io;
    this.logger = logger;
    this.logStreamingService = logStreamingService;
    this.setupEventHandlers();
  }

  /** Register connection/disconnect handlers. */
  private setupEventHandlers(): void {
    this.io.on("connection", (socket) => {
      const clientId = socket.id;
      this.connectedClients = new Set([clientId]);

      this.logger.info(
        `📶 Web UI connected via Socket.IO (clients: ${this.connectedClients.size})`
      );

      // Send welcome message
      const welcomeMessage: LogMessage = {
        serviceName: "system",
        timestamp: new Date().toISOString(),
        message: `Welcome! You are client ${clientId}. Real-time log streaming is active.`,
        level: "info",
      };

      socket.emit("log-message", welcomeMessage);

      this.logger.info("🔄 Sending buffered logs to newly connected client");
      this.logStreamingService.sendBufferedMessages();

      // Handle disconnect
      socket.on("disconnect", () => {
        this.connectedClients.delete(clientId);
        this.logger.info(
          `📴 Web UI disconnected (clients: ${this.connectedClients.size})`
        );
      });
    });
  }

  /** Connected clients count. */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /** Set of connected client IDs. */
  getConnectedClients(): Set<string> {
    return this.connectedClients;
  }

  /** Emit an event to all clients. */
  emit(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /** Emit an event to a specific client by ID. */
  emitToClient(clientId: string, event: string, data: any): void {
    this.io.to(clientId).emit(event, data);
  }
}
