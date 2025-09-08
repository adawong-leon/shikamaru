import { LogEntry } from "../types";

export interface CompressionOptions {
  maxLogs?: number;
  compressionRatio?: number;
  preserveRecent?: number;
  enableDeduplication?: boolean;
}

export interface CompressedLogEntry extends Omit<LogEntry, "message" | "html"> {
  messageHash: string;
  messageIndex: number;
  htmlHash?: string;
  htmlIndex?: number;
}

export interface CompressedLogData {
  logs: CompressedLogEntry[];
  messagePool: string[];
  htmlPool: string[];
  metadata: {
    compressedAt: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}

export class LogCompressor {
  private messagePool: Map<string, number> = new Map();
  private htmlPool: Map<string, number> = new Map();
  private messageIndex: string[] = [];
  private htmlIndex: string[] = [];
  private options: CompressionOptions;

  constructor(options: CompressionOptions = {}) {
    this.options = {
      maxLogs: 10000,
      compressionRatio: 0.7,
      preserveRecent: 1000,
      enableDeduplication: true,
      ...options,
    };
  }

  /**
   * Compress logs for storage
   */
  compress(logs: LogEntry[]): CompressedLogData {
    const startTime = Date.now();
    const originalSize = this.calculateSize(logs);

    // Sort logs by timestamp (newest first)
    const sortedLogs = [...logs].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Preserve recent logs
    const recentLogs = sortedLogs.slice(0, this.options.preserveRecent!);
    const olderLogs = sortedLogs.slice(this.options.preserveRecent!);

    // Compress older logs
    const compressedOlderLogs = this.compressLogs(olderLogs);

    // Combine with recent logs
    const allCompressedLogs = [
      ...this.compressLogs(recentLogs),
      ...compressedOlderLogs,
    ];

    const compressedSize = this.calculateCompressedSize(allCompressedLogs);
    const compressionRatio =
      originalSize > 0 ? compressedSize / originalSize : 0;

    return {
      logs: allCompressedLogs,
      messagePool: this.messageIndex,
      htmlPool: this.htmlIndex,
      metadata: {
        compressedAt: new Date().toISOString(),
        originalSize,
        compressedSize,
        compressionRatio,
      },
    };
  }

  /**
   * Decompress logs from storage
   */
  decompress(compressedData: CompressedLogData): LogEntry[] {
    return compressedData.logs.map((compressedLog) => {
      const message = compressedData.messagePool[compressedLog.messageIndex];
      const html =
        compressedLog.htmlIndex !== undefined
          ? compressedData.htmlPool[compressedLog.htmlIndex]
          : undefined;

      return {
        ...compressedLog,
        message,
        html,
      };
    });
  }

  /**
   * Compress individual logs
   */
  private compressLogs(logs: LogEntry[]): CompressedLogEntry[] {
    const compressedLogs: CompressedLogEntry[] = [];
    const seenMessages = new Set<string>();

    for (const log of logs) {
      // Deduplication
      if (this.options.enableDeduplication && seenMessages.has(log.message)) {
        continue;
      }
      seenMessages.add(log.message);

      const messageIndex = this.addToMessagePool(log.message);
      const htmlIndex = log.html ? this.addToHtmlPool(log.html) : undefined;

      compressedLogs.push({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level,
        serviceName: log.serviceName,
        metadata: log.metadata,
        parsed: log.parsed,
        messageHash: this.hashString(log.message),
        messageIndex,
        htmlHash: log.html ? this.hashString(log.html) : undefined,
        htmlIndex,
      });
    }

    return compressedLogs;
  }

  /**
   * Add message to pool and return index
   */
  private addToMessagePool(message: string): number {
    if (this.messagePool.has(message)) {
      return this.messagePool.get(message)!;
    }

    const index = this.messageIndex.length;
    this.messageIndex.push(message);
    this.messagePool.set(message, index);
    return index;
  }

  /**
   * Add HTML to pool and return index
   */
  private addToHtmlPool(html: string): number {
    if (this.htmlPool.has(html)) {
      return this.htmlPool.get(html)!;
    }

    const index = this.htmlIndex.length;
    this.htmlIndex.push(html);
    this.htmlPool.set(html, index);
    return index;
  }

  /**
   * Calculate size of logs in bytes
   */
  private calculateSize(logs: LogEntry[]): number {
    return JSON.stringify(logs).length;
  }

  /**
   * Calculate size of compressed data in bytes
   */
  private calculateCompressedSize(
    compressedLogs: CompressedLogEntry[]
  ): number {
    return JSON.stringify(compressedLogs).length;
  }

  /**
   * Simple hash function for strings
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Get compression statistics
   */
  getStats(compressedData: CompressedLogData): {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    spaceSaved: number;
    spaceSavedPercentage: number;
    messagePoolSize: number;
    htmlPoolSize: number;
    uniqueMessages: number;
    uniqueHtml: number;
  } {
    const { originalSize, compressedSize, compressionRatio } =
      compressedData.metadata;
    const spaceSaved = originalSize - compressedSize;
    const spaceSavedPercentage =
      originalSize > 0 ? (spaceSaved / originalSize) * 100 : 0;

    return {
      originalSize,
      compressedSize,
      compressionRatio,
      spaceSaved,
      spaceSavedPercentage,
      messagePoolSize: compressedData.messagePool.length,
      htmlPoolSize: compressedData.htmlPool.length,
      uniqueMessages: compressedData.messagePool.length,
      uniqueHtml: compressedData.htmlPool.length,
    };
  }

  /**
   * Optimize compression settings based on data
   */
  optimizeSettings(logs: LogEntry[]): CompressionOptions {
    const totalLogs = logs.length;
    const uniqueMessages = new Set(logs.map((log) => log.message)).size;
    const uniqueHtml = new Set(logs.map((log) => log.html).filter(Boolean))
      .size;

    const messageDeduplicationRatio = uniqueMessages / totalLogs;
    const htmlDeduplicationRatio = uniqueHtml / totalLogs;

    return {
      maxLogs: Math.min(totalLogs, 50000),
      compressionRatio: 0.6,
      preserveRecent: Math.min(2000, Math.floor(totalLogs * 0.1)),
      enableDeduplication: messageDeduplicationRatio < 0.8,
    };
  }
}
