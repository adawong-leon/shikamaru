import { Server as SocketIOServer } from "socket.io";
import type { Logger } from "@/cli/exports";
import { LogBuffer } from "@/modes/execution/services/LogBuffer";
import { detectLogLevel } from "../utils/processUtils";
import stripAnsi from "strip-ansi";
import AnsiToHtml from "ansi-to-html";
import { ProcItem } from "@/log-ui/types";
import { splitAnsiSmart } from "@/utils/splitLogs";

/** Types & configuration knobs for the streaming pipeline. */
type LogLevel = "debug" | "info" | "warn" | "error" | "trace";
type SourceType = "process" | "docker" | "file" | "api" | "custom";

type Source = {
  id: string;
  name: string;
  type: SourceType;
  stream?: NodeJS.ReadableStream;
  metadata?: Record<string, any>;
  isActive: boolean;
};

interface LogMessage {
  serviceName: string;
  timestamp: string; // ISO
  message: string;
  level: LogLevel;
  metadata?: Record<string, any>;
  html?: string;
}

interface LogProcessingConfig {
  enableBuffering: boolean;
  enableLevelDetection: boolean;
  enableMetadata: boolean;
  enableAnsiHtml: boolean; // gate ANSI→HTML conversion
  bufferSize: number;
  maxMessageLength: number;
  oneLinePerMessageForDocker?: boolean;
  socketBatchMs: number; // micro-batching window
  idleFlushMs: number; // flush partial tails on idle
  maxTailBytes: number; // bound memory per source
}

interface LogSourceHandlers {
  onData?: (sourceId: string, data: Buffer) => void;
  onError?: (sourceId: string, error: Error) => void;
  onEnd?: (sourceId: string) => void;
  onClose?: (sourceId: string) => void;
}

/** Precompiled regex patterns for low-latency log parsing. */
const RE = {
  composePrefix: /^[A-Za-z0-9._-]+\s+\|\s/,
  lineDockerTimestamp:
    /^(?<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(?<msg>[\s\S]*)$/,
  lineIsoWithLevel:
    /^(?<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\s+(?<lvl>[A-Z]+)\s*:\s*(?<msg>[\s\S]*)$/,
  lineBracketFull:
    /^\[(?<ts>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s+(?<lvl>[A-Z]+)\s*:\s*(?<msg>[\s\S]*)$/,
  lineBracketTime:
    /^\[(?<ts>\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s+[AP]M?)\]\s+(?<lvl>[A-Z]+)\s*:\s*(?<msg>[\s\S]*)$/,
  lineSyslog:
    /^(?<ts>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(?<lvl>[A-Z]+)\s*:\s*(?<msg>[\s\S]*)$/,
  lineRabbit:
    /^(?<ts>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[(?<lvl>debug|info|notice|warning|error|critical)\]\s+(?<msg>[\s\S]*)$/i,
  lineLevelPrefix:
    /^(?<lvl>TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRITICAL|NOTICE|ALERT|EMERGENCY)\s*:\s*(?<msg>[\s\S]*)$/i,
};

/** Small helpers. */
const clamp = (s: string, max: number) =>
  s.length <= max
    ? s
    : s.slice(0, max) + ` …[+${s.length - max} chars truncated]`;

const toLowerLevel = (v?: string): LogLevel | undefined => {
  if (!v) return;
  const m = v.toLowerCase();
  if (m === "warning") return "warn";
  if (m === "critical") return "error";
  return (["debug", "info", "warn", "error", "trace"] as LogLevel[]).includes(
    m as LogLevel
  )
    ? (m as LogLevel)
    : undefined;
};

/** Log streaming service: parses, batches, and emits logs via Socket.IO. */
export class LogStreamingService {
  private io: SocketIOServer;
  private logger: Logger;

  private logSources = new Map<string, Source>();
  private streamListenersAttached = new Set<string>();

  private logBuffer: LogBuffer = LogBuffer.getInstance();
  private config: LogProcessingConfig;

  private handlers: LogSourceHandlers = {};

  private tailBuffers = new Map<string, string>();
  private idleTimers = new Map<string, NodeJS.Timeout>();

  private outboundQueue: LogMessage[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  private ansi = new AnsiToHtml({
    fg: "#FFF",
    bg: "#000",
    newline: false,
    escapeXML: true,
    stream: false,
  });

  constructor(
    io: SocketIOServer,
    logger: Logger,
    config: Partial<LogProcessingConfig> = {}
  ) {
    this.io = io;
    this.logger = logger;
    this.config = {
      enableBuffering: true,
      enableLevelDetection: true,
      enableMetadata: true,
      enableAnsiHtml: true,
      bufferSize: 1000,
      maxMessageLength: 10_000,
      oneLinePerMessageForDocker: true,
      socketBatchMs: 40,
      idleFlushMs: 300,
      maxTailBytes: 256 * 1024,
      ...config,
    };

    // Without rooms: on connect, optionally flush buffered messages
    this.io.on("connection", () => {
      this.sendBufferedMessages();
    });
  }

  // Public API

  setHandlers(handlers: LogSourceHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  addLogSource(source: Source): void {
    this.logSources.set(source.id, source);
    this.tailBuffers.set(source.id, "");

    this.logger.info(`Added log source: ${source.name} (${source.type})`);
    if (source.stream && source.isActive) this.attachStreamListeners(source);
  }

  removeLogSource(sourceId: string): void {
    const source = this.logSources.get(sourceId);
    if (!source) return;

    this.detachStreamListeners(sourceId);
    this.clearSourceState(sourceId);

    this.logSources.delete(sourceId);
    this.logger.info(`Removed log source: ${source.name}`);
  }

  updateLogSource(sourceId: string, updates: Partial<Source>): void {
    const source = this.logSources.get(sourceId);
    if (!source) return;

    const updated = { ...source, ...updates };
    this.logSources.set(sourceId, updated);

    if (updates.stream && updated.isActive) {
      this.detachStreamListeners(sourceId);
      this.attachStreamListeners(updated);
    }
  }

  enableWebModeLogging(): void {
    this.logBuffer.enable();
    this.config.enableBuffering = true;
    this.logger.info("Web mode logging enabled - messages will be buffered");
  }

  disableWebModeLogging(): void {
    this.logBuffer.disable();
    this.config.enableBuffering = false;
    this.logger.info("Web mode logging disabled");
  }

  getBufferedMessages(): LogMessage[] {
    return this.logBuffer.getMessages();
  }

  clearBuffer(): void {
    this.logBuffer.clear();
  }

  getServiceLogs(serviceName: string, lines: number = 100): string[] {
    return this.logBuffer
      .getMessages()
      .filter((m) => m.serviceName === serviceName)
      .slice(-lines)
      .map((m) => m.message);
  }

  sendBufferedMessages(): void {
    const msgs = this.logBuffer.getMessages();
    if (!msgs.length) return;

    this.logger.info(`Sending ${msgs.length} buffered messages to web UI`);
    msgs.forEach((m) => this.enqueue(m));
    this.logBuffer.clear();
  }

  getLogSources(): Source[] {
    return Array.from(this.logSources.values());
  }

  getActiveLogSources(): Source[] {
    return this.getLogSources().filter((s) => s.isActive);
  }

  updateConfig(newConfig: Partial<LogProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info("Log streaming configuration updated");
  }

  getConfig(): LogProcessingConfig {
    return { ...this.config };
  }

  getLogStatistics(): {
    totalSources: number;
    activeSources: number;
    bufferedMessages: number;
    sourceStats: Array<{
      id: string;
      name: string;
      type: string;
      isActive: boolean;
      bufferSize: number;
    }>;
  } {
    const sources = this.getLogSources();
    return {
      totalSources: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
      bufferedMessages: this.logBuffer.getMessages().length,
      sourceStats: sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        isActive: s.isActive,
        bufferSize: this.tailBuffers.get(s.id)?.length || 0,
      })),
    };
  }

  reset(): void {
    this.tailBuffers.forEach((_, id) => this.clearSourceState(id));
    this.tailBuffers.clear();
    this.logSources.clear();
    // this.logBundlers.clear();
    this.logBuffer.clear();
    this.logger.info("Log streaming service reset");
  }

  parseLogEntry(rawLine: string): {
    ts?: string;
    level?: LogLevel;
    msg: string;
    html?: string;
  } {
    return this.parseStructured(rawLine);
  }

  testHtmlGeneration(rawLine: string): {
    original: string;
    clean: string;
    html: string;
    hasAnsi: boolean;
  } {
    const clean = stripAnsi(rawLine);
    const html = this.config.enableAnsiHtml ? this.ansi.toHtml(rawLine) : clean;
    return { original: rawLine, clean, html, hasAnsi: rawLine !== clean };
  }

  sendSystemMessage(
    message: string,
    level: "info" | "warn" | "error" | "debug" = "info"
  ): void {
    const m: LogMessage = {
      serviceName: "system",
      timestamp: new Date().toISOString(),
      message,
      level,
    };
    this.enqueue(m);
  }

  broadcastServicesUpdate(services: any[]): void {
    this.io.emit("services-update", services);
  }

  addProcessItems(procItems: ProcItem[], ports: Map<string, number>): void {
    procItems.forEach((p) =>
      this.addLogSource({
        id: p.name,
        name: p.name,
        type: "process",
        stream: p.stream,
        metadata: { pid: p.proc?.pid, port: ports.get(p.name) },
        isActive: !!p.stream,
      })
    );
  }

  attachProcessStreamListeners(procItem: ProcItem): void {
    this.addLogSource({
      id: procItem.name,
      name: procItem.name,
      type: "process",
      stream: procItem.stream,
      metadata: { pid: procItem.proc?.pid },
      isActive: !!procItem.stream,
    });
  }

  sendTestLog(): void {
    const raw =
      "This is a test with \x1b[32mgreen\x1b[0m and \x1b[31mred\x1b[0m";
    const html = this.config.enableAnsiHtml
      ? this.ansi.toHtml(raw)
      : stripAnsi(raw);
    const msg: LogMessage = {
      serviceName: "test",
      timestamp: new Date().toISOString(),
      message: raw,
      level: "info",
      html,
      metadata: { sourceId: "test", sourceType: "test", rawMessage: raw },
    };
    this.enqueue(msg);
    this.logger.info("Sent test log with ANSI colors");
  }

  // Internals

  private attachStreamListeners(source: Source): void {
    if (!source.stream || this.streamListenersAttached.has(source.id)) return;

    const onData = (data: Buffer) => {
      try {
        this.handlers.onData?.(source.id, data);
        this.processLogData(source, data);
      } catch (err) {
        this.handleLogError(source.id, err as Error);
      }
    };
    const onEnd = () => this.handleStreamEnd(source.id);
    const onClose = () => this.handleStreamClose(source.id);
    const onError = (e: Error) => this.handleStreamError(source.id, e);

    source.stream.on("data", onData);
    source.stream.on("end", onEnd);
    source.stream.on("close", onClose);
    source.stream.on("error", onError);

    (source as any).__listeners = { onData, onEnd, onClose, onError };
    this.streamListenersAttached.add(source.id);
    this.logger.debug(`Attached stream listeners to ${source.name}`);
  }

  private detachStreamListeners(sourceId: string): void {
    const source = this.logSources.get(sourceId);
    if (!source?.stream || !this.streamListenersAttached.has(sourceId)) return;

    const listeners = (source as any).__listeners;
    if (listeners) {
      source.stream.removeListener("data", listeners.onData);
      source.stream.removeListener("end", listeners.onEnd);
      source.stream.removeListener("close", listeners.onClose);
      source.stream.removeListener("error", listeners.onError);
      delete (source as any).__listeners;
    } else {
      source.stream.removeAllListeners();
    }
    this.streamListenersAttached.delete(sourceId);
    this.logger.debug(`Detached stream listeners from ${source.name}`);
  }

  private processLogData(source: Source, data: Buffer): void {
    const nowTail = this.tailBuffers.get(source.id) || "";
    const chunk = data.toString("utf8");
    let full = nowTail + chunk;

    if (full.length > this.config.maxTailBytes) {
      const cut = full.slice(-this.config.maxTailBytes);
      this.logger.warning(
        `[${source.name}] tail exceeded ${this.config.maxTailBytes} bytes; trimming older content`
      );
      full = cut;
    }

    const { parts, tail } = splitAnsiSmart(full);

    for (const rawLine of parts) {
      if (!rawLine.trim()) continue;

      if (this.config.oneLinePerMessageForDocker && source.type === "docker") {
        this.emitDirectLine(source, rawLine);
        continue;
      }

      const parsed = this.parseStructured(rawLine);
      const message = clamp(parsed.msg, this.config.maxMessageLength);

      const logMessage: LogMessage = {
        serviceName: source.name,
        timestamp: parsed.ts || new Date().toISOString(),
        message,
        level:
          parsed.level ||
          (this.config.enableLevelDetection
            ? (detectLogLevel(rawLine) as LogLevel)
            : "info"),
        html: this.config.enableAnsiHtml ? parsed.html : undefined,
        metadata: this.config.enableMetadata
          ? {
              sourceId: source.id,
              sourceType: source.type,
              rawMessage: rawLine,
              ...(source.metadata || {}),
            }
          : undefined,
      };

      this.enqueue(logMessage);
    }

    this.tailBuffers.set(source.id, tail);
    this.restartIdleFlushTimer(source.id);
  }

  private emitDirectLine(source: Source, rawLine: string): void {
    const line = rawLine.replace(RE.composePrefix, "");
    if (!line.trim()) return;

    const parsed = this.parseStructured(line);
    const message = clamp(parsed.msg, this.config.maxMessageLength);

    const msg: LogMessage = {
      serviceName: source.name,
      timestamp: parsed.ts || new Date().toISOString(),
      message,
      level:
        parsed.level ||
        (this.config.enableLevelDetection
          ? (detectLogLevel(line) as LogLevel)
          : "info"),
      html: this.config.enableAnsiHtml ? parsed.html : undefined,
      metadata: this.config.enableMetadata
        ? {
            sourceId: source.id,
            sourceType: source.type,
            rawMessage: rawLine,
            ...(source.metadata || {}),
          }
        : undefined,
    };
    this.enqueue(msg);
  }

  /** Micro-batching emit to all clients (no rooms) */
  private enqueue(logMessage: LogMessage): void {
    const sockets = this.connectedCount();
    if (!sockets) {
      if (this.config.enableBuffering)
        this.logBuffer.addMessage(logMessage as any);
      return;
    }

    this.outboundQueue.push(logMessage);
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        const batch = this.outboundQueue.splice(0, this.outboundQueue.length);
        this.batchTimer = null;
        if (batch.length) this.io.emit("log-message-batch", batch);
        for (const m of batch) this.io.emit("log-message", m); // legacy single events
      }, this.config.socketBatchMs);
    }
  }

  private connectedCount(): number {
    return this.io.sockets.sockets.size;
  }

  /** Idle flush: if a source stalls mid-line, emit tail as a line */
  private restartIdleFlushTimer(sourceId: string): void {
    const existing = this.idleTimers.get(sourceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const tail = this.tailBuffers.get(sourceId);
      if (tail && tail.trim()) {
        const source = this.logSources.get(sourceId);
        if (source) this.emitDirectLine(source, tail);
        this.tailBuffers.set(sourceId, "");
      }
    }, this.config.idleFlushMs);

    this.idleTimers.set(sourceId, timer);
  }

  /** Structured parsing across multiple formats */
  private parseStructured(lineRaw: string): {
    ts?: string;
    level?: LogLevel;
    msg: string;
    html?: string;
  } {
    const clean = stripAnsi(lineRaw);
    const html = this.config.enableAnsiHtml ? this.ansi.toHtml(lineRaw) : clean;

    // [YYYY-mm-dd HH:MM:SS(.sss)] LEVEL: msg
    let m = clean.match(RE.lineBracketFull);
    if (m?.groups) {
      const iso = new Date(m.groups.ts.replace(" ", "T")).toISOString();
      return {
        ts: iso,
        level: toLowerLevel(m.groups.lvl) || undefined,
        msg: m.groups.msg,
        html,
      };
    }

    // [HH:MM:SS(.sss) AM/PM] LEVEL: msg
    m = clean.match(RE.lineBracketTime);
    if (m?.groups) {
      const today = new Date().toISOString().split("T")[0];
      const timeStr = m.groups.ts.replace(/\s/g, "");
      const iso = new Date(`${today}T${timeStr}`).toISOString();
      return {
        ts: iso,
        level: toLowerLevel(m.groups.lvl) || undefined,
        msg: m.groups.msg,
        html,
      };
    }

    // ISO + LEVEL: msg
    m = clean.match(RE.lineIsoWithLevel);
    if (m?.groups) {
      const iso = new Date(m.groups.ts).toISOString();
      return {
        ts: iso,
        level: toLowerLevel(m.groups.lvl) || undefined,
        msg: m.groups.msg,
        html,
      };
    }

    // Syslog-ish
    m = clean.match(RE.lineSyslog);
    if (m?.groups) {
      const year = new Date().getFullYear();
      const iso = new Date(`${m.groups.ts} ${year}`).toISOString();
      return {
        ts: iso,
        level: toLowerLevel(m.groups.lvl) || undefined,
        msg: m.groups.msg,
        html,
      };
    }

    // Docker timestamp + msg
    m = clean.match(RE.lineDockerTimestamp);
    if (m?.groups) {
      const iso = new Date(m.groups.ts).toISOString();
      return {
        ts: iso,
        level: this.config.enableLevelDetection
          ? (detectLogLevel(clean) as LogLevel)
          : "info",
        msg: m.groups.msg,
        html,
      };
    }

    // RabbitMQ
    m = clean.match(RE.lineRabbit);
    if (m?.groups) {
      const iso = new Date(m.groups.ts.replace(" ", "T")).toISOString();
      return {
        ts: iso,
        level: toLowerLevel(m.groups.lvl) || undefined,
        msg: m.groups.msg,
        html,
      };
    }

    // JSON
    const trimmed = clean.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const j = JSON.parse(trimmed);
        const ts = j.timestamp || j.time || j.ts;
        const lvl = toLowerLevel(j.level || j.severity || j.log_level);
        const msg = j.message ?? j.msg ?? j.text ?? trimmed;
        return {
          ts: ts ? new Date(ts).toISOString() : undefined,
          level:
            lvl ||
            (this.config.enableLevelDetection
              ? (detectLogLevel(clean) as LogLevel)
              : "info"),
          msg: typeof msg === "string" ? msg : JSON.stringify(msg),
          html,
        };
      } catch {
        // fallthrough
      }
    }

    // LEVEL: msg
    m = clean.match(RE.lineLevelPrefix);
    if (m?.groups) {
      return {
        level: toLowerLevel(m.groups.lvl) || undefined,
        msg: m.groups.msg,
        html,
      };
    }

    // default
    return {
      msg: clean,
      level: this.config.enableLevelDetection
        ? (detectLogLevel(clean) as LogLevel)
        : "info",
      html,
    };
  }

  private handleLogError(sourceId: string, error: Error): void {
    this.logger.error(`Failed to process log for ${sourceId}:`, error);
    this.sendSystemMessage(
      `Failed to process log for ${sourceId}: ${error.message}`,
      "error"
    );
    this.clearSourceState(sourceId);
  }

  private handleStreamEnd(sourceId: string): void {
    this.detachStreamListeners(sourceId);
    this.clearSourceState(sourceId);
    this.handlers.onEnd?.(sourceId);
    this.logger.info(`Stream ended for source ${sourceId}`);
    this.sendSystemMessage(`Stream ended for source ${sourceId}`, "info");
  }

  private handleStreamClose(sourceId: string): void {
    this.detachStreamListeners(sourceId);
    this.clearSourceState(sourceId);
    this.handlers.onClose?.(sourceId);
    this.logger.info(`Stream closed for source ${sourceId}`);
    this.sendSystemMessage(`Stream closed for ${sourceId}`, "info");
  }

  private handleStreamError(sourceId: string, error: Error): void {
    this.detachStreamListeners(sourceId);
    this.clearSourceState(sourceId);
    this.handlers.onError?.(sourceId, error);
    this.logger.error(`Stream error for source ${sourceId}:`, error);
    this.sendSystemMessage(
      `Stream error for ${sourceId}: ${error.message}`,
      "error"
    );
  }

  private clearSourceState(sourceId: string): void {
    this.tailBuffers.delete(sourceId);
    const t = this.idleTimers.get(sourceId);
    if (t) clearTimeout(t);
    this.idleTimers.delete(sourceId);
  }
}
