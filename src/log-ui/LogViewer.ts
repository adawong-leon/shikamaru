import chalk from "chalk";
import { AtomicWriter } from "./util/AtomicWriter";
import { TerminalViewport } from "./ui/TerminalViewport";
import { RingBuffer } from "./util/RingBuffer";
import { FilterState } from "./filters/FilterState";
import { SearchHighlighter } from "./highlight/SearchHighlighter";
import { HistoryProjector } from "./history/HistoryProjector";
import { OverlayView } from "./overlay/OverlayView";
import { ProcessManager } from "./process/ProcessManager";
import {
  FOOTER_REFRESH_MS,
  STARTUP_GRACE_MS,
  HISTORY_LIMIT,
  HistoryRecord,
  ProcItem,
  nowIsoTime,
} from "./types";

import { KeyController } from "./input/KeyController";

export class LogViewer {
  private writer = new AtomicWriter();
  private viewport = new TerminalViewport(this.writer, () =>
    this.projector.redrawAll()
  );
  private history = new RingBuffer<HistoryRecord>(HISTORY_LIMIT);
  private filters = new FilterState();
  private highlighter = new SearchHighlighter(this.filters);
  private projector = new HistoryProjector(
    this.history,
    this.filters,
    this.highlighter,
    this.viewport,
    false
  );

  private overlay = new OverlayView(
    this.history,
    this.filters,
    this.highlighter,
    this.viewport,
    () => this.showTimestamps,
    () => this.footerText()
  );

  private key: KeyController;
  private processes: ProcItem[] = [];
  private serviceNames: string[] = [];
  private firstLineTimer: NodeJS.Timeout | null = null;
  private showTimestamps = false;
  private customCleanup?: () => Promise<void>;

  private processManager = new ProcessManager(
    this.history,
    this.filters,
    this.viewport,
    (name, raw) => {
      this.printRepoLine(name, raw);
      // Force a redraw to ensure logs appear immediately
      // this.forceRedraw();
    }
  );

  constructor(customCleanup?: () => Promise<void>) {
    this.customCleanup = customCleanup;
    this.viewport.startFooterRefresher(
      () => this.footerText(),
      FOOTER_REFRESH_MS
    );

    this.key = new KeyController(
      this.writer,
      this.viewport,
      this.overlay,
      this.filters,
      this.serviceNames,
      () => this.projector.getNextHistoryId(),
      () => this.projector.redrawAll(),
      (id) => this.projector.flushFrom(id),
      () => this.toggleTimestamps(),
      async () => {
        this.writer.enqueue(process.stdout, [
          "\n🛑 Quitting all services...\n",
        ]);
        await this.writer.flush();

        await this.customCleanup();
      }
    );
    process.stdout.on?.("resize", () => {
      if (this.overlay.isOpen()) this.overlay.render();
      else this.projector.redrawAll();
      this.viewport.markFooterDirty();
    });
  }

  private footerText() {
    let scope = "";
    if (this.filters.activeService) {
      scope = `logs: [${this.filters.activeService}]`;
    } else if (this.serviceNames?.length == 1) {
      scope = `logs: [${this.serviceNames[0]}]`;
    } else {
      scope = `logs: [all]`;
    }
    const curFilter = this.filters.getCurrentFilterText();
    const curSearch = this.filters.getCurrentSearchText();
    let input = "";
    const mode = this.key.getState().mode;
    if (mode === "filter") input += chalk.cyan(`  Filter: ${curFilter}`);
    if (mode === "search") input += chalk.cyan(`  Search: ${curSearch}`);
    const controls = chalk.dim(
      " — a: all  [: prev  ]: next  s: select    /: filter  c: clear  t: ts  q: quit"
    );
    let text = chalk.cyan(scope) + input + controls;
    const cols = process.stdout.columns || 120;
    if (text.length > cols) text = text.slice(0, cols - 1);
    return text;
  }

  private printRepoLine(name: string, raw: string) {
    const ts = this.showTimestamps ? chalk.gray(`[${nowIsoTime()}] `) : "";
    const tag = chalk.blue(`[${name}]`);
    const body = this.highlighter.highlight(raw, name);
    this.viewport.printLogLine(ts + tag + " " + body + "\n");
  }

  toggleTimestamps() {
    this.showTimestamps = !this.showTimestamps;
    this.projector.setShowTimestamps(this.showTimestamps);
    this.viewport.markFooterDirty();
    this.projector.redrawAll();
  }

  async stopAll(items: ProcItem[]) {
    const { ProcessManager } = await import("../utils/ProcessManager.js");
    await ProcessManager.stopAll(items);
  }

  async stream(procList: ProcItem[]) {
    this.processes = procList;
    this.serviceNames = [...new Set(procList.map((p) => p.name))];
    this.key.setServices = this.serviceNames;

    this.viewport.setScrollRegionForFooter();
    const enableFooter = !(
      process.env.REQUIRE_EACH_SERVICE_FIRST_LINE === "true" &&
      this.serviceNames.length > 1
    );
    if (enableFooter) this.viewport.enableFooter();
    else {
      if (this.firstLineTimer) clearTimeout(this.firstLineTimer);
      this.firstLineTimer = setTimeout(
        () => this.viewport.enableFooter(),
        STARTUP_GRACE_MS
      );
    }

    this.key.init();

    this.processManager.attach({
      procList,
      serviceNames: this.serviceNames,
      onAllFirstLinesSeen: () => {
        this.viewport.enableFooter();
      },
    });

    this.viewport.markFooterDirty();
  }
}
