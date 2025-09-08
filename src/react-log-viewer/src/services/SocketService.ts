import { io, Socket } from "socket.io-client";
import { getSocketUrl } from "../config/urls";
import { LogEntry, Service } from "../types";

export interface SocketEventHandlers {
  onConnect?: (socket: Socket) => void;
  onDisconnect?: () => void;
  onConnectError?: (error: Error) => void;
  onLogMessage?: (logMessage: LogEntry) => void;
  onServicesUpdate?: (servicesData: Service[]) => void;
}

export class SocketService {
  private socket: Socket | null = null;
  private eventHandlers: SocketEventHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private url: string = getSocketUrl()) {}

  public setEventHandlers(handlers: SocketEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  public connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    console.log("Attempting to connect to:", this.url);

    this.socket = io(this.url, {
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 20000,
    });

    this.setupEventListeners();
    return this.socket;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  public emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`Cannot emit ${event}: socket not connected`);
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ Connected to ProcessExpressAPI at:", this.url);
      console.log("Socket ID:", this.socket?.id);
      console.log("Transport:", this.socket?.io.engine.transport.name);

      this.reconnectAttempts = 0;
      this.eventHandlers.onConnect?.(this.socket!);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected from ProcessExpressAPI:", reason);
      this.eventHandlers.onDisconnect?.();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error("Max reconnection attempts reached");
      }

      this.eventHandlers.onConnectError?.(error);
    });

    this.socket.on("log-message", (logMessage: LogEntry) => {
      console.log("Received log message:", logMessage);
      this.eventHandlers.onLogMessage?.(logMessage);
    });

    this.socket.on("services-update", (servicesData: Service[]) => {
      console.log("Received services update:", servicesData);
      this.eventHandlers.onServicesUpdate?.(servicesData);
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
    });

    this.socket.on("reconnect_error", (error) => {
      console.error("Reconnection error:", error);
    });
  }
}

export default SocketService;
