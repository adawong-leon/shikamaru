import { AtomicWriter } from "../util/AtomicWriter";
import { ESC } from "../types";

export class TerminalViewport {
  regionSet = false;
  private lastFooter = "";
  private footerEnabled = false;
  private footerDirty = true;

  isResizing = false;

  constructor(
    private readonly writer: AtomicWriter,
    private readonly redrawAll: () => void
  ) {
    // Configure terminal for proper scrolling
    this.configureTerminal();
  }

  private configureTerminal() {
    // Enable scrolling and ensure proper terminal behavior
    this.writer.enqueue(process.stdout, [
      `${ESC}[?25h`, // Show cursor
      `${ESC}[?7h`, // Enable auto-wrap
      `${ESC}[?1049l`, // Ensure we're not in alt screen mode
    ]);
  }

  toggleFooter() {
    this.footerEnabled = !this.footerEnabled;
    this.redrawAll();
  }

  enableFooter() {
    this.footerEnabled = true;
    this.markFooterDirty();
  }

  isFooterEnabled() {
    return this.footerEnabled;
  }

  markFooterDirty() {
    this.footerDirty = true;
  }

  drawFooter(text: string, force = false) {
    if (!this.footerEnabled) return;
    const rows = process.stdout.rows || 24;
    if (!force && text === this.lastFooter) return;
    this.lastFooter = text;
    this.writer.enqueue(process.stdout, [
      `${ESC}[s`, // Save cursor position
      `${ESC}[${rows};1H`, // Move to footer line
      `${ESC}[2K`, // Clear the line
      text, // Write footer text
      `${ESC}[u`, // Restore cursor position
    ]);
  }

  startFooterRefresher(getText: () => string, refreshMs: number) {
    setInterval(() => {
      if (this.footerDirty) {
        this.drawFooter(getText(), true);
        this.footerDirty = false;
      }
    }, refreshMs);
  }

  setScrollRegionForFooter() {
    // Don't use scroll regions - they prevent natural terminal scrolling
    // Instead, just clear the screen and let the terminal handle scrolling naturally
    this.writer.enqueue(process.stdout, [
      `${ESC}[H`, // Move cursor to home position
      `${ESC}[2J`, // Clear entire screen
      `${ESC}[?25h`, // Show cursor
    ]);
    this.regionSet = true;
  }
  resetScrollRegion() {
    // No scroll region to reset since we're not using them
    this.regionSet = false;
  }

  cleanup() {
    // Restore terminal settings
    this.writer.enqueue(process.stdout, [
      `${ESC}[?25h`, // Show cursor
      `${ESC}[?7h`, // Enable auto-wrap
    ]);
  }

  clearLogArea() {
    // Clear the entire screen except the footer line
    const rows = process.stdout.rows || 24;
    const chunks = [`${ESC}[s`, `${ESC}[1;1H`];
    const max = this.footerEnabled ? Math.max(1, rows - 1) : rows;
    for (let r = 1; r <= max; r++) {
      chunks.push(`${ESC}[${r};1H`, `${ESC}[2K`);
    }
    chunks.push(`${ESC}[u`);
    this.writer.enqueue(process.stdout, chunks);
  }

  openAlt() {
    this.writer.enqueue(process.stdout, [
      `${ESC}[?1049h`,
      `${ESC}[H`,
      `${ESC}[2J`,
    ]);
  }
  closeAlt() {
    this.writer.enqueue(process.stdout, [`${ESC}[?1049l`]);
    this.setScrollRegionForFooter();
    this.markFooterDirty();
  }

  printLogLine(s: string) {
    // Ensure we're initialized
    if (!this.regionSet) {
      this.setScrollRegionForFooter();
    }

    // Write the log line normally - let the terminal handle scrolling
    this.writer.enqueue(process.stdout, s);
  }
}
