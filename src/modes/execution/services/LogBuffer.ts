import { LogMessage } from "@/api/express/types";

/**
 * Fixed-size in-memory log queue for web logging mode.
 * Implements a circular buffer to keep the most recent N log messages
 * with O(1) enqueue and eviction.
 */
export class LogBuffer {
  private static instance: LogBuffer | null = null;
  // Use a circular queue to avoid O(n) Array.shift()
  private buffer: (LogMessage | undefined)[] = new Array(10000);
  private maxBufferSize: number = 10000;
  private startIndex: number = 0; // points to the oldest element
  private size: number = 0; // number of valid elements in the buffer
  private isEnabled: boolean = false;

  private constructor() {}

  public static getInstance(): LogBuffer {
    if (!LogBuffer.instance) {
      LogBuffer.instance = new LogBuffer();
    }
    return LogBuffer.instance;
  }

  /** Enable in-memory buffering. */
  public enable(): void {
    this.isEnabled = true;
    console.log("Log buffer enabled - messages will be captured");
  }

  /** Disable in-memory buffering. */
  public disable(): void {
    this.isEnabled = false;
    console.log("Log buffer disabled");
  }

  /** Enqueue a log message. Evicts the oldest when full. */
  public addMessage(logMessage: LogMessage): void {
    // Write at tail position
    const writeIndex = (this.startIndex + this.size) % this.maxBufferSize;
    this.buffer[writeIndex] = logMessage;

    if (this.size < this.maxBufferSize) {
      this.size++;
    } else {
      // Buffer is full, advance start to drop the oldest in O(1)
      this.startIndex = (this.startIndex + 1) % this.maxBufferSize;
    }
  }

  /** Convenience: enqueue a message from the system logger. */
  public addSystemMessage(
    message: string,
    level: "info" | "warn" | "error" | "debug" = "info"
  ): void {
    const logMessage: LogMessage = {
      serviceName: "system",
      timestamp: new Date().toISOString(),
      message,
      level,
    };

    this.addMessage(logMessage);
  }

  /** Snapshot buffered messages in chronological order. */
  public getMessages(): LogMessage[] {
    const result: LogMessage[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.startIndex + i) % this.maxBufferSize;
      const item = this.buffer[idx];
      if (item) result.push(item);
    }
    return result;
  }

  /** Remove all buffered messages. */
  public clear(): void {
    this.buffer = new Array(this.maxBufferSize);
    this.startIndex = 0;
    this.size = 0;
  }

  /** Whether buffering is currently enabled. */
  public isBufferEnabled(): boolean {
    return this.isEnabled;
  }

  /** Current number of buffered messages. */
  public getBufferSize(): number {
    return this.size;
  }
}
