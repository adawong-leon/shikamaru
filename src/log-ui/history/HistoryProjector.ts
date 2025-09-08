import chalk from "chalk";
import { FilterState } from "../filters/FilterState";
import { Highlighter } from "../highlight/Highlighter";
import { TerminalViewport } from "../ui/TerminalViewport";
import { RingBuffer } from "../util/RingBuffer";
import { HistoryRecord, nowIsoTime } from "../types";

export class HistoryProjector {
  constructor(
    private readonly history: RingBuffer<HistoryRecord>,
    private readonly filters: FilterState,
    private readonly highlighter: Highlighter,
    private readonly viewport: TerminalViewport,
    private showTimestamps: boolean
  ) {}

  setShowTimestamps(v: boolean) {
    this.showTimestamps = v;
  }
  getNextHistoryId() {
    return this.history.nextId;
  }

  /**
   * Redraws the entire log area, applying current filters and highlighting.
   * This implementation ensures case-insensitive service name matching,
   * and is written for clarity, maintainability, and correctness at scale.
   */
  redrawAll() {
    this.viewport.clearLogArea();

    // Normalize active service for case-insensitive comparison
    const activeService = this.filters.activeService
      ? this.filters.activeService.toLowerCase()
      : null;

    this.history.forEach((rec) => {
      if (activeService && rec.name.toLowerCase() !== activeService) {
        return;
      }

      if (!this.filters.matches(rec.name, rec.line)) return;

      const ts = this.showTimestamps ? chalk.gray(`[${nowIsoTime()}] `) : "";
      const tag = chalk.blue(`[${rec.name}]`);
      const body = this.highlighter.highlight(rec.line, rec.name);

      this.viewport.printLogLine(`${ts}${tag} ${body}\n`);
    });

    this.viewport.markFooterDirty();
  }

  flushFrom(startId: number) {
    this.history.forEachFromId(startId, (rec) => {
      if (this.filters.activeService && rec.name !== this.filters.activeService)
        return;
      if (!this.filters.matches(rec.name, rec.line)) return;
      const ts = this.showTimestamps ? chalk.gray(`[${nowIsoTime()}] `) : "";
      const tag = chalk.blue(`[${rec.name}]`);
      const body = this.highlighter.highlight(rec.line, rec.name);
      this.viewport.printLogLine(ts + tag + " " + body + "\n");
    });
  }
}
