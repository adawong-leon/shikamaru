import { io, Socket } from "socket.io-client";
import { LogEntry, Service } from "../types";

export interface SocketEventHandlers {
  onConnect?: (socket: Socket) => void;
  onDisconnect?: () => void;
  onConnectError?: (error: Error) => void;
  onLogMessage?: (logMessage: LogEntry) => void;
  onLogBatch?: (logMessages: LogEntry[]) => void;
  onServicesUpdate?: (servicesData: Service[]) => void;
}

export interface ConnectionConfig {
  url: string;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  batchSize: number;
  batchTimeout: number;
}

export class OptimizedSocketService {
  private socket: Socket | null = null;
  private eventHandlers: SocketEventHandlers = {};
  private reconnectAttempts = 0;
  private isConnecting = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private logBatch: LogEntry[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private config: ConnectionConfig;

  constructor(config: Partial<ConnectionConfig> = {}) {
    this.config = {
      url: "http://localhost:3015",
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      batchSize: 50,
      batchTimeout: 100,
      ...config,
    };
  }

  /**
   * Connect to the socket server
   */
  connect(): Socket | null {
    if (this.isConnecting || this.socket?.connected) {
      return this.socket;
    }

    this.isConnecting = true;

    try {
      this.socket = io(this.config.url, {
        transports: ["websocket", "polling"],
        timeout: 10000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: this.config.maxReconnectAttempts,
        reconnectionDelay: this.config.reconnectDelay,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: this.config.maxReconnectAttempts,
      });

      this.setupEventListeners();
      this.startHeartbeat();
      this.startLogBatching();

      return this.socket;
    } catch (error) {
      console.error("Failed to create socket connection:", error);
      this.isConnecting = false;
      return null;
    }
  }

  /**
   * Disconnect from the socket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.stopLogBatching();
    this.flushLogBatch();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    transport?: string;
  } {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      transport: this.socket?.io.engine.transport.name,
    };
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: SocketEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Emit event to server
   */
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`Cannot emit ${event}: socket not connected`);
    }
  }

  /**
   * Setup socket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ Connected to ProcessExpressAPI at:", this.config.url);
      console.log("Socket ID:", this.socket?.id);
      console.log("Transport:", this.socket?.io.engine.transport.name);

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.eventHandlers.onConnect?.(this.socket!);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected from ProcessExpressAPI:", reason);
      this.isConnecting = false;
      this.eventHandlers.onDisconnect?.();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      this.reconnectAttempts++;
      this.isConnecting = false;

      if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
        console.error("Max reconnection attempts reached");
      }

      this.eventHandlers.onConnectError?.(error);
    });

    this.socket.on("log-message", (logMessage: LogEntry) => {
      this.addToBatch(logMessage);
    });

    this.socket.on("log-batch", (logMessages: LogEntry[]) => {
      this.eventHandlers.onLogBatch?.(logMessages);
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

    this.socket.on("heartbeat", () => {
      // Respond to heartbeat
      this.emit("heartbeat-ack");
    });
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.emit("heartbeat");
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Start log batching mechanism
   */
  private startLogBatching(): void {
    this.batchTimer = setInterval(() => {
      this.flushLogBatch();
    }, this.config.batchTimeout);
  }

  /**
   * Stop log batching mechanism
   */
  private stopLogBatching(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Add log to batch
   */
  private addToBatch(logMessage: LogEntry): void {
    this.logBatch.push(logMessage);

    // Flush batch if it reaches the configured size
    if (this.logBatch.length >= this.config.batchSize) {
      this.flushLogBatch();
    }
  }

  /**
   * Flush log batch
   */
  private flushLogBatch(): void {
    if (this.logBatch.length === 0) return;

    const batch = [...this.logBatch];
    this.logBatch = [];

    // Send individual logs if batch handler is not available
    if (!this.eventHandlers.onLogBatch) {
      batch.forEach((log) => this.eventHandlers.onLogMessage?.(log));
    } else {
      this.eventHandlers.onLogBatch?.(batch);
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    batchSize: number;
    batchTimeout: number;
    reconnectAttempts: number;
    transport: string | undefined;
    latency: number | null;
  } {
    return {
      batchSize: this.config.batchSize,
      batchTimeout: this.config.batchTimeout,
      reconnectAttempts: this.reconnectAttempts,
      transport: this.socket?.io.engine.transport.name,
      latency: this.socket?.io.engine.ping || null,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConnectionConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart batching if config changed
    if (newConfig.batchSize || newConfig.batchTimeout) {
      this.stopLogBatching();
      this.startLogBatching();
    }
  }

  /**
   * Force reconnection
   */
  forceReconnect(): void {
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 1000);
  }
}

export default OptimizedSocketService;
