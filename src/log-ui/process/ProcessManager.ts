import { RingBuffer } from "../util/RingBuffer";
import {
  HistoryRecord,
  normalizeChunk,
  REQUIRE_EACH_SERVICE_FIRST_LINE,
} from "../types";
import { FilterState } from "../filters/FilterState";
import { TerminalViewport } from "../ui/TerminalViewport";
import { ProcItem } from "../types";
import { EventEmitter } from "events";
import stripAnsi from "strip-ansi";

// Split ONLY on \n where the NEXT chars are NOT an ANSI SGR like \x1b[90m
// ansiSmartSplit.ts
// Only split on \n when it's NOT right after an ANSI CSI sequence (ESC [ ... <final>).
// Keeps performance high via a single pass and tiny state machine.

const ESC = 0x1b;

function isCsiFinalByte(code: number) {
  // CSI final bytes are in the ASCII range 0x40..0x7E; SGR uses 'm' (0x6D)
  return code >= 0x40 && code <= 0x7e;
}

export function splitAnsiSmart(input: string) {
  // normalize CR/LF once
  const s = input.replace(/\r\n?/g, "\n");
  const out: string[] = [];
  let cur = "";
  let i = 0;

  // CSI parser flags
  let inCSI = false; // we're inside ESC[
  let justClosedCSI = false; // last char closed a CSI (no intervening text yet)

  while (i < s.length) {
    const ch = s.charCodeAt(i);

    if (inCSI) {
      cur += s[i];
      if (isCsiFinalByte(ch)) {
        inCSI = false;
        justClosedCSI = true; // we closed with ...m (or any CSI final)
      }
      i++;
      continue;
    }

    if (ch === ESC && i + 1 < s.length && s[i + 1] === "[") {
      inCSI = true;
      cur += s[i]; // add ESC
      i++;
      cur += s[i]; // add '['
      i++;
      continue;
    }

    if (s[i] === "\n") {
      if (justClosedCSI) {
        // Newline immediately after a styling sequence → keep inside the same entry
        cur += "\n";
        // still “special-adjacent”; keep justClosedCSI = true until real text arrives
      } else {
        // Hard boundary
        out.push(cur);
        cur = "";
      }
      i++;
      continue;
    }

    // Any normal character clears the "just closed" state
    justClosedCSI = false;
    cur += s[i];
    i++;
  }

  return { parts: out, tail: cur };
}

type StreamLike = NodeJS.ReadableStream & EventEmitter;

interface AttachArgs {
  procList: ProcItem[];
  serviceNames: string[];
  onAllFirstLinesSeen: () => void;
}

/**
 * Robust ProcessManager
 * - Debounced footer redraws to prevent flicker
 * - Burst handling with cooperative yielding
 * - Safe tail flush on "end"
 * - Detach for cleanup (avoid listener leaks)
 * - Runtime filter switching and active service control
 */
export class ProcessManager {
  private firstLineSeen = new Set<string>();
  private lineBuf = new Map<string, string>();
  private suppressed = new Map<string, number>();
  public hasAnyLogs = false;

  // Book-keeping for cleanup
  private attached = false;
  private streams: Map<string, StreamLike> = new Map();
  private removeHandlers: Map<
    string,
    { data: (chunk: any) => void; end: () => void; error: (err: any) => void }
  > = new Map();

  // Debounce state
  private footerTimer: NodeJS.Timeout | null = null;
  private readonly footerDebounceMs = 40;

  // Burst handling
  private readonly maxLinesPerTick = 100; // cooperative yield threshold

  constructor(
    private readonly history: RingBuffer<HistoryRecord>,
    private readonly filters: FilterState,
    private readonly viewport: TerminalViewport,
    private readonly printLine: (name: string, raw: string) => void
  ) {}

  /** Attach streams and start consumption */
  attach({ procList, serviceNames, onAllFirstLinesSeen }: AttachArgs) {
    this.detach(); // idempotent: clear any previous attachments

    this.firstLineSeen.clear();
    this.suppressed.clear();
    this.hasAnyLogs = false;
    this.attached = true;

    procList.forEach(({ stream, name }) => {
      if (!stream) return;

      const s = stream as StreamLike;
      this.streams.set(name, s);

      const onData = (chunk: any) => {
        // normalize + line framing with sticky tail buffer
        const text = normalizeChunk(chunk);

        const prev = this.lineBuf.get(name) || "";
        const combined = prev + text;

        // Split into lines using ANSI-safe splitting, preserve partial tail
        const { parts, tail } = splitAnsiSmart(combined);
        this.lineBuf.set(name, tail);

        // Process lines in bursts to keep UI responsive
        let i = 0;
        const processBatch = () => {
          if (!this.attached) return; // stop if detached
          const limit = Math.min(i + this.maxLinesPerTick, parts.length);

          for (; i < limit; i++) {
            const raw = parts[i];
            // preserve formatting; only skip truly empty lines
            if (raw.length === 0) continue;

            // first-line handshake per service
            if (!this.firstLineSeen.has(name)) {
              this.firstLineSeen.add(name);
              if (
                REQUIRE_EACH_SERVICE_FIRST_LINE &&
                this.firstLineSeen.size === serviceNames.length
              ) {
                // notify in a microtask to avoid reentrancy issues
                queueMicrotask(() => onAllFirstLinesSeen());
              }
            }

            // Service filter fast-path
            if (
              this.filters.activeService &&
              name !== this.filters.activeService
            ) {
              this.bumpSuppressed(name);
              this.queueFooterDirty();
              continue;
            }

            if (!this.filters.matches(name, raw)) continue;

            this.history.push({ name, line: raw } as any);
            this.printLine(name, raw);
            this.hasAnyLogs = true;
          }

          if (i < parts.length) {
            // yield back to event loop for big bursts
            setImmediate(processBatch);
          } else {
            this.queueFooterDirty();
          }
        };

        processBatch();
      };

      const onEnd = () => {
        const tail = this.lineBuf.get(name);
        if (
          tail &&
          (!this.filters.activeService ||
            name === this.filters.activeService) &&
          this.filters.matches(name, tail)
        ) {
          this.history.push({ name, line: tail } as any);
          this.printLine(name, tail);
          this.hasAnyLogs = true;
        }
        this.lineBuf.delete(name);
        this.queueFooterDirty();
      };

      const onError = (err: any) => {
        const msg = `[ERROR] ${err?.message || String(err)}`;
        if (
          !this.filters.activeService ||
          name === this.filters.activeService
        ) {
          this.history.push({ name, line: msg } as any);
          this.printLine(name, msg);
        } else {
          this.bumpSuppressed(name);
        }
        this.queueFooterDirty();
      };

      // Attach listeners
      s.on("data", onData);
      s.on("end", onEnd);
      s.on("error", onError);

      this.removeHandlers.set(name, {
        data: onData,
        end: onEnd,
        error: onError,
      });
    });
  }

  /** Detach all streams and cleanup listeners/timers */
  detach() {
    if (!this.attached) return;
    this.attached = false;

    // Remove stream listeners safely
    for (const [name, s] of this.streams.entries()) {
      const handlers = this.removeHandlers.get(name);
      if (handlers) {
        s.off("data", handlers.data);
        s.off("end", handlers.end);
        s.off("error", handlers.error);
      }
    }
    this.streams.clear();
    this.removeHandlers.clear();

    // Clear debouncers
    if (this.footerTimer) {
      clearTimeout(this.footerTimer);
      this.footerTimer = null;
    }
  }

  /** Change active service at runtime */
  setActiveService(name: string | null) {
    this.filters.activeService = name;
    // Reset suppressed counters when switching focus
    this.suppressed.clear();
    this.queueFooterDirty();
  }

  /** Replace/refresh filters; clears suppressed counts */
  updateFilters(update: (f: FilterState) => void) {
    update(this.filters);
    this.suppressed.clear();
    this.queueFooterDirty();
  }

  /** Summarize suppressed lines for footer/status bar */
  getSuppressedSummary() {
    return [...this.suppressed.entries()]
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `[${r} hidden ${n}]`)
      .join(" ");
  }

  /** Increment suppressed counter without hot allocations */
  private bumpSuppressed(name: string) {
    const prev = this.suppressed.get(name) || 0;
    this.suppressed.set(name, prev + 1);
  }

  /** Debounced footer redraw to avoid UI thrash */
  private queueFooterDirty() {
    if (this.footerTimer) return;
    this.footerTimer = setTimeout(() => {
      this.footerTimer = null;
      // minimal coupling: just mark dirty; outer loop decides when to render
      try {
        this.viewport.markFooterDirty();
      } catch {
        /* no-op */
      }
    }, this.footerDebounceMs);
  }
}
