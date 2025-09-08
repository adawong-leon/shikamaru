import chalk from "chalk";
import { FilterState } from "../filters/FilterState";
import { Highlighter } from "../highlight/Highlighter";
import { TerminalViewport } from "../ui/TerminalViewport";
import { RingBuffer } from "../util/RingBuffer";
import { ESC, HistoryRecord, nowIsoTime } from "../types";

export enum OverlayMode {
  REVIEW = "review",
  SEARCH = "search",
  FILTER = "filter",
}

type MatchFn = (rec: HistoryRecord, filters: FilterState) => boolean;

type Hotkeys = Record<string, string>; // e.g. { "Ctrl+N": "next", "Ctrl+P": "prev" }

class HotkeyFooter {
  private perMode: Partial<Record<OverlayMode, Hotkeys>>;
  private fallback: Hotkeys | undefined;

  constructor(opts: {
    perMode?: Partial<Record<OverlayMode, Hotkeys>>;
    fallback?: Hotkeys;
  }) {
    this.perMode = opts.perMode ?? {};
    this.fallback = opts.fallback;
  }

  render(mode: OverlayMode, extraText?: string): string {
    const map = this.perMode[mode] ?? this.fallback ?? {};
    const parts = Object.entries(map).map(
      ([key, desc]) => chalk.dim(`${key}`) + chalk.gray(` ${desc}`)
    );
    const left = parts.join(chalk.gray("  |  "));
    const right = extraText ? chalk.dim(extraText) : "";
    const cols = process.stdout.columns || 80;

    // simple left/right packing
    const space = Math.max(
      1,
      cols - stripAnsi(left).length - stripAnsi(right).length - 1
    );
    return left + " ".repeat(space) + right;
  }
}

// Strip ANSI for width calc (minimal)
function stripAnsi(s: string): string {
  return s.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B\[[0-9;]*m/g,
    ""
  );
}

export class OverlayView {
  private matches: Array<HistoryRecord> = [];
  private cursor = -1;
  private open = false;
  private mode: OverlayMode = OverlayMode.REVIEW;

  constructor(
    private readonly history: RingBuffer<HistoryRecord>,
    private readonly filters: FilterState,
    private readonly highlighter: Highlighter,
    private readonly viewport: TerminalViewport,
    private readonly showTimestampsRef: () => boolean,
    private readonly footerTextFn: () => string,
    private readonly footer: HotkeyFooter = new HotkeyFooter({
      perMode: {
        [OverlayMode.REVIEW]: {
          "Ctrl+N": "next",
          "Ctrl+P": "prev",
          "Enter/Esc": "resume",
          t: "toggle timestamps",
        },
        [OverlayMode.SEARCH]: {
          "/": "live search",
          "Ctrl+N": "next",
          "Ctrl+P": "prev",
          "Enter/Esc": "resume",
        },
        [OverlayMode.FILTER]: {
          f: "live filter",
          c: "clear",
          "Ctrl+N": "next",
          "Ctrl+P": "prev",
          "Enter/Esc": "resume",
        },
      },
    }),
    private readonly matchers?: Partial<Record<OverlayMode, MatchFn>>
  ) {}

  setMode(mode: OverlayMode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.cursor = -1; // fresh focus per mode
      if (this.open) this.render();
    }
  }

  getMode() {
    return this.mode;
  }

  openOverlay() {
    if (this.open) return;
    this.viewport.openAlt();
    this.open = true;
  }

  closeOverlay() {
    if (!this.open) return;
    this.viewport.closeAlt();
    this.open = false;
    this.setMode(OverlayMode.REVIEW);
  }

  isOpen() {
    return this.open;
  }

  next() {
    if (this.matches.length && this.cursor < this.matches.length - 1)
      this.cursor++;
    else if (this.matches.length) this.cursor = 0;
    this.render();
  }

  prev() {
    if (this.matches.length && this.cursor > 0) this.cursor--;
    else if (this.matches.length) this.cursor = this.matches.length - 1;
    this.render();
  }

  /** Recompute matches using current mode’s predicate */
  private recompute() {
    const matcher =
      this.matchers?.[this.mode] ??
      ((rec: HistoryRecord, f: FilterState) => {
        // Default: use existing FilterState logic, but respect activeService
        if (f.activeService && rec.name !== f.activeService) return false;
        return f.matches(rec.name, rec.line);
      });

    const out: HistoryRecord[] = [];
    this.history.forEach((rec) => {
      if (matcher(rec, this.filters)) out.push(rec);
    });

    this.matches = out;
    if (!this.matches.length) this.cursor = -1;
    else if (this.cursor < 0 || this.cursor >= this.matches.length)
      this.cursor = this.matches.length - 1;
  }

  render() {
    this.recompute();

    const rows = process.stdout.rows || 24;
    const bodyRows = Math.max(1, rows - 2);
    const header = this.headerLine();
    if (!this.matches.length) {
      const msg = chalk.dim("No matches for current scope/filter.");
      const blank = Array.from({ length: bodyRows - 1 }, () => "");
      this.viewport.printLogLine(
        [`${ESC}[H`, `${ESC}[2J`, header, msg, ...blank].join("\n")
      );
      return;
    }

    const winHalf = Math.floor(bodyRows / 2);
    const start = Math.max(0, this.cursor - winHalf);
    const end = Math.min(this.matches.length - 1, start + bodyRows - 1);
    const slice = this.matches.slice(start, end + 1);

    const lines = slice.map((rec, i) => {
      const isCursor = start + i === this.cursor;
      const ts = this.showTimestampsRef()
        ? chalk.gray(`[${nowIsoTime()}] `)
        : "";
      const tag = chalk.blue(`[${rec.name}]`);
      const body = this.highlighter.highlight(rec.line, rec.name);
      const row = `${ts}${tag} ${body}`;
      return isCursor ? chalk.inverse(row) : row;
    });

    while (lines.length < bodyRows) lines.push("");
    this.viewport.printLogLine(
      [`${ESC}[H`, `${ESC}[2J`, ...lines, header].join("\n")
    );
  }

  private headerLine(): string {
    const label =
      this.mode === OverlayMode.SEARCH
        ? "search review"
        : this.mode === OverlayMode.FILTER
        ? "filter review"
        : "review";
    const text = `─── ${label} (Ctrl+N next, Ctrl+P prev, Enter/Esc resume) ───`;
    return chalk.dim(text);
  }
}
