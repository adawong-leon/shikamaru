// CLI Logger

import chalk from "chalk";
import readline from "readline";
import type { LogLevelType } from "../types";

// --- minimal ANSI stripper (for width calculation) ---
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  new RegExp(
    "[\\u001B\\u009B][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]",
    "g"
  );
function stripAnsi(s: string): string {
  return s.replace(ANSI_REGEX, "");
}

export class Logger {
  private verbose: boolean;
  private logLevel: LogLevelType = "info";

  // Spinner state
  private currentSpinner: NodeJS.Timeout | null = null;
  private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private spinnerIndex = 0;

  // Dynamic line management (row-aware)
  private dynamicLineActive = false; // whether we reserved a dynamic block
  private dynamicRows = 1; // how many terminal rows the block occupies
  private lastDynamicText = ""; // last colored text we rendered
  private termCols = Math.max(20, process.stdout.columns || 80);

  private static instance: Logger;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;

    if (process.stdout.isTTY) {
      process.stdout.on("resize", () => {
        this.termCols = Math.max(20, process.stdout.columns || 80);
        // Re-render with the new width if we have content on the dynamic line
        if (this.dynamicLineActive && this.lastDynamicText) {
          this._renderDynamic(this.lastDynamicText);
        }
      });
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  setLogLevel(level: LogLevelType): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevelType): boolean {
    if (this.verbose) return true;

    const levels: Record<LogLevelType, number> = {
      debug: 0,
      info: 1,
      step: 2,
      warning: 3,
      error: 4,
      success: 5,
    };

    return levels[level] >= levels[this.logLevel];
  }

  // ---------- Dynamic line helpers (row-aware) ----------

  private isTTY(): boolean {
    return Boolean(process.stdout.isTTY);
  }

  /** Detect basic terminal support for OSC 8 hyperlinks. */
  private supportsHyperlinks(): boolean {
    if (!this.isTTY()) return false;
    const termProgram = process.env.TERM_PROGRAM || "";
    const hasVSCode = Boolean(process.env.VSCODE_PID);
    const hasWezterm = Boolean(process.env.WEZTERM_EXECUTABLE);
    const force = process.env.FORCE_HYPERLINK === "1";
    return (
      force ||
      hasVSCode ||
      hasWezterm ||
      termProgram === "iTerm.app" ||
      termProgram === "Apple_Terminal" ||
      termProgram.toLowerCase().includes("kitty")
    );
  }

  /** Format a clickable terminal hyperlink if supported; otherwise return plain URL. */
  asHyperlink(text: string, url?: string): string {
    const href = url ?? text;
    if (!href || typeof href !== "string") return text;
    // Only hyperlink http(s) schemes to avoid odd terminals behavior
    const isHttp = href.startsWith("http://") || href.startsWith("https://");
    if (!isHttp) return href;
    if (!this.supportsHyperlinks()) return href;
    const OSC = "\u001B]8;;"; // ESC ] 8 ; ;
    const BEL = "\u0007"; // Bell terminator
    return `${OSC}${href}${BEL}${text}${OSC}${BEL}`;
  }

  /** Reserve a dedicated line (block) for dynamic output. */
  private ensureDynamicLine(): void {
    if (!this.isTTY()) return;
    if (!this.dynamicLineActive) {
      process.stdout.write("\n"); // anchor a block at the bottom
      this.dynamicLineActive = true;
      this.dynamicRows = 1;
    }
  }

  /** Count wrapped rows for given text (ANSI stripped, newline-aware). */
  private _calcRows(text: string): number {
    const s = stripAnsi(text);
    const parts = s.split("\n");
    let rows = 0;
    for (const part of parts) {
      const len = [...part].length; // approximate visual width
      rows += Math.max(1, Math.ceil(len / this.termCols));
    }
    return Math.max(1, rows);
  }

  /**
   * Render dynamic colored text inside the reserved block.
   * Moves cursor to TOP of dynamic block, clears BELOW, writes new text,
   * updates row count. Avoids overwriting the line above even with wrapping.
   */
  private _renderDynamic(coloredText: string): void {
    if (!this.isTTY()) {
      // Non-TTY: print lines normally to avoid control sequences in logs/pipes
      process.stdout.write(coloredText + "\n");
      return;
    }

    if (!this.dynamicLineActive) this.ensureDynamicLine();

    // Move to TOP of the dynamic block (go up dynamicRows - 1 lines)
    readline.moveCursor(process.stdout, 0, -(this.dynamicRows - 1));
    readline.cursorTo(process.stdout, 0);

    // Clear everything below (handles remnants from previous wider/longer frames)
    readline.clearScreenDown(process.stdout);

    // Write the new content (no trailing newline)
    process.stdout.write(coloredText);

    // Update state
    this.lastDynamicText = coloredText;
    this.dynamicRows = this._calcRows(coloredText);
    if (this.dynamicRows < 1) this.dynamicRows = 1;
  }

  /**
   * Clear the dynamic block content (keeps the reserved line).
   * Cursor goes to TOP of the block, clears downwards.
   */
  private clearDynamicLine(): void {
    if (!this.isTTY() || !this.dynamicLineActive) return;
    readline.moveCursor(process.stdout, 0, -(this.dynamicRows - 1));
    readline.cursorTo(process.stdout, 0);
    readline.clearScreenDown(process.stdout);
    this.lastDynamicText = "";
    this.dynamicRows = 1;
  }

  /**
   * Print a normal log above the spinner/progress without corrupting it.
   * Temporarily clears the dynamic block, prints, then re-renders the block.
   */
  private printAbove(fn: () => void): void {
    const hadDynamic = this.dynamicLineActive && !!this.lastDynamicText;

    if (this.dynamicLineActive) this.clearDynamicLine();
    fn();
    if (this.currentSpinner || this.dynamicLineActive) {
      this.ensureDynamicLine();
      if (hadDynamic && this.lastDynamicText)
        this._renderDynamic(this.lastDynamicText);
    }
  }

  // ---------- Basic logs ----------

  info(message: string): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => console.log(chalk.blue(`ℹ️  ${message}`)));
  }

  success(message: string): void {
    if (!this.shouldLog("success")) return;
    this.printAbove(() => console.log(chalk.green(`✅ ${message}`)));
  }

  warning(message: string): void {
    if (!this.shouldLog("warning")) return;
    this.printAbove(() => console.log(chalk.yellow(`⚠️  ${message}`)));
  }

  error(message: string, error?: Error): void {
    if (!this.shouldLog("error")) return;
    this.printAbove(() => {
      console.error(chalk.red(`❌ ${message}`));
      if (error && this.verbose) {
        console.error(chalk.gray(error.stack));
      }
    });
  }

  debug(message: string): void {
    if (!this.shouldLog("debug")) return;
    this.printAbove(() => console.log(chalk.gray(`🔍 ${message}`)));
  }

  step(message: string): void {
    if (!this.shouldLog("step")) return;
    this.printAbove(() => console.log(chalk.cyan(`🚀 ${message}`)));
  }

  // ---------- Simple spinner (single-frame) ----------

  spinner(message: string): void {
    if (!this.shouldLog("info")) return;
    this.ensureDynamicLine();
    this._renderDynamic(chalk.blue(`⏳ ${message}...`));
  }

  spinnerStop(success: boolean = true, message?: string): void {
    if (!this.shouldLog("info")) return;
    this.stopProgress(success, message);
  }

  updateProgress(message: string): void {
    if (!this.shouldLog("info") || !this.currentSpinner) return;
    try {
      const frame = this.spinnerFrames[this.spinnerIndex];
      this._renderDynamic(chalk.blue(`${frame} ${message}`));
    } catch {
      this.stopProgress();
    }
  }

  stopProgress(success: boolean = true, message?: string): void {
    if (this.currentSpinner) {
      clearInterval(this.currentSpinner);
      this.currentSpinner = null;
    }

    // Clear the block first, then print the final line cleanly
    if (this.dynamicLineActive) this.clearDynamicLine();

    if (success)
      this.printAbove(() =>
        console.log(chalk.green(`✅ ${message || "Completed"}`))
      );
    else
      this.printAbove(() =>
        console.error(chalk.red(`❌ ${message || "Failed"}`))
      );
  }

  // ---------- Dots (non-animated API kept for compatibility) ----------

  spinnerWithDots(message: string): void {
    if (!this.shouldLog("info")) return;
    this.ensureDynamicLine();
    this._renderDynamic(chalk.blue(`⏳ ${message}`));
  }

  spinnerUpdate(message: string): void {
    if (!this.shouldLog("info")) return;
    this.ensureDynamicLine();
    this._renderDynamic(chalk.blue(`⏳ ${message}`));
  }

  // ---------- Repo lifecycle messages ----------

  repoStarted(repo: string, port?: number): void {
    if (!this.shouldLog("info")) return;
    const portInfo = port ? ` on port ${port}` : "";
    this.printAbove(() =>
      console.log(chalk.green(`✅ ${repo} started successfully${portInfo}`))
    );
  }

  servicesSummary(services: string[]): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => {
      console.log(chalk.cyan("\n📊 Services Summary:"));
      services.forEach((service, index) => {
        console.log(chalk.green(`  ${index + 1}. ${service} - Running`));
      });
      console.log(chalk.cyan("🎉 All services are ready for development!\n"));
    });
  }

  // Comprehensive services status table
  servicesStatusTable(
    services: Array<{
      name: string;
      status: "healthy" | "starting" | "unhealthy" | "stopped";
      port?: number;
      pid?: number;
      memory?: string;
      cpu?: string;
      uptime?: string;
      url?: string;
      runtime?: string;
    }>
  ): void {
    if (!this.shouldLog("info")) return;

    this.printAbove(() => {
      console.log(chalk.cyan("\n📊 Services Status Table"));
      console.log(chalk.gray("=".repeat(120)));

      const tableData = services.map((service) => ({
        Repository: service.name,
        Status: this.getStatusIcon(service.status) + " " + service.status,
        Runtime: service.runtime || "Local",
        Port: service.port ? service.port.toString() : "N/A",
        PID: service.pid ? service.pid.toString() : "N/A",
        Memory: service.memory || "N/A",
        CPU: service.cpu || "N/A",
        Uptime: service.uptime || "N/A",
        URL: service.url || "N/A",
      }));

      this.table(tableData);

      // Summary statistics
      const healthyCount = services.filter(
        (s) => s.status === "healthy"
      ).length;
      const totalCount = services.length;

      console.log(chalk.gray("-".repeat(120)));
      console.log(
        chalk.cyan(`📈 Summary: ${healthyCount}/${totalCount} services healthy`)
      );

      if (healthyCount === totalCount) {
        console.log(chalk.green("🎉 All services are running successfully!"));
      } else {
        console.log(
          chalk.yellow(
            `⚠️  ${totalCount - healthyCount} service(s) need attention`
          )
        );
      }
      console.log(chalk.gray("=".repeat(120)));
    });
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case "healthy":
        return "🟢";
      case "starting":
        return "🟡";
      case "unhealthy":
        return "🔴";
      case "stopped":
        return "⚫";
      default:
        return "❓";
    }
  }

  installStart(repo: string, framework?: string): void {
    if (!this.shouldLog("info")) return;
    const frameworkInfo = framework ? ` (${framework})` : "";
    this.printAbove(() =>
      console.log(
        chalk.blue(`📦 Installing dependencies for ${repo}${frameworkInfo}...`)
      )
    );
  }

  installStep(repo: string, step: string): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => console.log(chalk.gray(`   🔧 ${repo}: ${step}`)));
  }

  installSuccess(repo: string, duration?: number): void {
    if (!this.shouldLog("info")) return;
    const durationInfo = duration ? ` (${duration}s)` : "";
    this.printAbove(() =>
      console.log(
        chalk.green(
          `   ✅ ${repo}: Dependencies installed successfully${durationInfo}`
        )
      )
    );
  }

  installFailure(repo: string, error?: string): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => {
      console.log(chalk.red(`   ❌ ${repo}: Installation failed`));
      if (error && this.verbose)
        console.log(chalk.gray(`      Error: ${error}`));
    });
  }

  startupStart(repo: string, command?: string): void {
    if (!this.shouldLog("info")) return;
    const commandInfo = command ? ` with: ${command}` : "";
    this.printAbove(() =>
      console.log(chalk.blue(`🚀 Starting ${repo}${commandInfo}...`))
    );
  }

  startupStep(repo: string, step: string): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => console.log(chalk.gray(`   ⚙️  ${repo}: ${step}`)));
  }

  startupSuccess(repo: string, port?: number, pid?: number): void {
    if (!this.shouldLog("info")) return;
    const portInfo = port ? ` on port ${port}` : "";
    const pidInfo = pid ? ` (PID: ${pid})` : "";
    this.printAbove(() =>
      console.log(
        chalk.green(`   ✅ ${repo}: Started successfully${portInfo}${pidInfo}`)
      )
    );
  }

  startupFailure(repo: string, error?: string): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => {
      console.log(chalk.red(`   ❌ ${repo}: Startup failed`));
      if (error && this.verbose)
        console.log(chalk.gray(`      Error: ${error}`));
    });
  }

  // ---------- Structured/status logs ----------

  statusUpdate(repo: string, status: string, details?: string): void {
    if (!this.shouldLog("info")) return;
    const detailsText = details ? ` - ${details}` : "";
    this.printAbove(() =>
      console.log(chalk.cyan(`📊 ${repo}: ${status}${detailsText}`))
    );
  }

  warningWithSuggestions(message: string, suggestions: string[]): void {
    if (!this.shouldLog("warning")) return;
    this.printAbove(() => {
      console.log(chalk.yellow(`⚠️  ${message}`));
      if (suggestions.length > 0) {
        console.log(chalk.yellow("💡 Suggestions:"));
        suggestions.forEach((suggestion, index) => {
          console.log(chalk.gray(`   ${index + 1}. ${suggestion}`));
        });
      }
    });
  }

  errorWithDetails(
    message: string,
    details: string[],
    suggestions?: string[]
  ): void {
    if (!this.shouldLog("error")) return;
    this.printAbove(() => {
      console.error(chalk.red(`❌ ${message}`));
      if (details.length > 0) {
        console.error(chalk.red("🔍 Details:"));
        details.forEach((detail) =>
          console.error(chalk.gray(`   • ${detail}`))
        );
      }
      if (suggestions && suggestions.length > 0) {
        console.log(chalk.yellow("💡 Suggestions:"));
        suggestions.forEach((suggestion, index) =>
          console.log(chalk.gray(`   ${index + 1}. ${suggestion}`))
        );
      }
    });
  }

  // ---------- Sections & tables ----------

  sectionHeader(title: string): void {
    if (!this.shouldLog("info")) return;
    this.printAbove(() => {
      console.log(chalk.bold.cyan(`${"=".repeat(50)}`));
      console.log(chalk.bold.cyan(`📋 ${title}`));
      console.log(chalk.bold.cyan(`${"=".repeat(50)}`));
    });
  }

  ensureCleanState(): void {
    if (this.currentSpinner) this.stopProgress();
  }

  table(data: Record<string, any>[]): void {
    if (!this.shouldLog("info")) return;

    if (data.length === 0) {
      this.info("No data to display");
      return;
    }

    // Stop spinner temporarily, print table above, then restore spinner
    const headers = Object.keys(data[0]);
    const maxWidths = headers.map((header) => {
      const maxLength = Math.max(
        header.length,
        ...data.map((row) => String(row[header] ?? "").length)
      );
      return Math.min(maxLength, 50);
    });

    this.printAbove(() => {
      const headerRow = headers
        .map((h, i) => h.padEnd(maxWidths[i]))
        .join(" | ");
      console.log(chalk.bold(headerRow));
      console.log(chalk.gray("-".repeat(headerRow.length)));

      data.forEach((row) => {
        const dataRow = headers
          .map((h, i) => {
            const value = String(row[h] ?? "");
            return value.length > maxWidths[i]
              ? value.substring(0, maxWidths[i] - 3) + "..."
              : value.padEnd(maxWidths[i]);
          })
          .join(" | ");
        console.log(dataRow);
      });
    });
  }
}
