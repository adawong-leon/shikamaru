import readline from "node:readline";
import { AtomicWriter } from "../util/AtomicWriter";
import { TerminalViewport } from "../ui/TerminalViewport";
import { OverlayView } from "../overlay/OverlayView";
import { FilterState } from "../filters/FilterState";
import { Mode, ESC } from "../types";

// Key binding configuration for better maintainability
interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  description: string;
  action: (controller: KeyController) => Promise<void> | void;
}

// Service selection state for better UX
interface ServiceSelectionState {
  isActive: boolean;
  buffer: string;
  onDataHandler?: (buffer: Buffer) => void;
}

export class KeyController {
  private mode: Mode = null;
  private paused = false;
  private pauseStartId = 0;
  private serviceSelection: ServiceSelectionState = {
    isActive: false,
    buffer: "",
  };

  // Key bindings configuration
  private readonly keyBindings: KeyBinding[] = [
    {
      key: "q",
      description: "Quit all services",
      action: async (controller) => await controller.handleQuit(),
    },
    {
      key: "space",
      description: "Toggle pause/resume",
      action: async (controller) => controller.handlePauseToggle(),
    },
    {
      key: "t",
      description: "Toggle timestamps",
      action: (controller) => controller.handleToggleTimestamps(),
    },
    {
      key: "k",
      description: "Toggle footer",
      action: (controller) => controller.handleToggleFooter(),
    },
    {
      key: "a",
      description: "Show all services",
      action: (controller) => controller.handleShowAllServices(),
    },
    {
      key: "c",
      description: "Clear filters",
      action: (controller) => controller.handleClearFilters(),
    },
    {
      key: "s",
      description: "Select service",
      action: (controller) => controller.handleServiceSelection(),
    },
    {
      key: "n",
      ctrl: true,
      description: "Next overlay",
      action: (controller) => controller.handleNextOverlay(),
    },
    {
      key: "p",
      ctrl: true,
      description: "Previous overlay",
      action: (controller) => controller.handlePrevOverlay(),
    },
  ];

  constructor(
    private readonly writer: AtomicWriter,
    private readonly viewport: TerminalViewport,
    private readonly overlay: OverlayView,
    private readonly filters: FilterState,
    private services: string[],
    private readonly getNextHistoryId: () => number,
    private readonly redrawAll: () => void,
    private readonly flushFrom: (id: number) => void,
    private readonly onToggleTimestamps: () => void,
    private readonly q: () => Promise<void>
  ) {}

  // Getter and setter for services
  get getServices(): string[] {
    return this.services;
  }

  set setServices(services: string[]) {
    this.services = services;
  }

  private redraw() {
    this.viewport.markFooterDirty();
    this.redrawAll();
  }

  private enterPause() {
    if (!this.paused) {
      this.paused = true;
      this.pauseStartId = this.getNextHistoryId();
      this.viewport.markFooterDirty();
    }
  }

  private resumeAndFlush() {
    if (this.paused) this.flushFrom(this.pauseStartId);
    this.paused = false;
    this.pauseStartId = 0;
    this.viewport.markFooterDirty();
  }

  // Key handling methods for better organization
  private async handleQuit(): Promise<void> {
    this.writer.enqueue(process.stdout, ["\n🛑 Quitting all services...\n"]);
    await this.q();
  }

  private handlePauseToggle(): void {
    if (this.paused) this.resumeAndFlush();
    else this.enterPause();
  }

  private handleToggleTimestamps(): void {
    this.onToggleTimestamps();
  }

  private handleToggleFooter(): void {
    this.viewport.toggleFooter();
  }

  private handleShowAllServices(): void {
    this.filters.activeService = null;
    this.redraw();
  }

  private handleClearFilters(): void {
    this.filters.clearCurrentScope();
    this.viewport.markFooterDirty();
    this.redrawAll();
  }

  private handleNextOverlay(): void {
    this.enterPause();
    this.overlay.openOverlay();
    this.overlay.next();
  }

  private handlePrevOverlay(): void {
    this.enterPause();
    this.overlay.openOverlay();
    this.overlay.prev();
  }

  private handleServiceSelection(): void {
    if (this.serviceSelection.isActive) return;

    const menu = this.services
      .map(
        (r, i) =>
          `${i + 1}. ${r}${this.filters.activeService === r ? "  ←" : ""}`
      )
      .join("\n");

    this.writer.enqueue(process.stdout, [
      "\nSelect service by number:\n",
      menu,
      "\n> ",
    ]);

    this.serviceSelection.isActive = true;
    this.serviceSelection.buffer = "";

    const onData = (b: Buffer) => {
      const t = b.toString().trim();
      if (!t) return;

      this.serviceSelection.buffer += t;
      const n = parseInt(this.serviceSelection.buffer, 10);

      if (!Number.isNaN(n) && n >= 1 && n <= this.services.length) {
        this.cleanupServiceSelection();
        this.filters.activeService = this.services[n - 1];
        this.redraw();
      } else if (this.serviceSelection.buffer.length > 2) {
        this.cleanupServiceSelection();
        this.writer.enqueue(process.stdout, ["Invalid selection\n"]);
        this.viewport.markFooterDirty();
      }
    };

    this.serviceSelection.onDataHandler = onData;
    process.stdin.on("data", onData);
  }

  private cleanupServiceSelection(): void {
    if (this.serviceSelection.onDataHandler) {
      process.stdin.off("data", this.serviceSelection.onDataHandler);
      this.serviceSelection.onDataHandler = undefined;
    }
    this.serviceSelection.isActive = false;
    this.serviceSelection.buffer = "";
  }

  private handleModeInput(str: string, key: readline.Key): void {
    if (key.ctrl && (key.name === "n" || key.name === "p")) {
      this.mode = null;
      if (key.name === "n") this.handleNextOverlay();
      else this.handlePrevOverlay();
      return;
    }

    if (key.name === "backspace") {
      this.handleModeBackspace();
      return;
    }

    if (str && str.length === 1 && !key.ctrl && !key.meta) {
      this.handleModeCharacter(str);
    }
  }

  private handleModeBackspace(): void {
    if (this.mode === "filter") {
      const currentText = this.filters.getCurrentFilterText();
      this.filters.setFilterForScope(currentText.slice(0, -1));
    }
    if (this.mode === "search") {
      const currentText = this.filters.getCurrentSearchText();
      this.filters.setSearchForScope(currentText.slice(0, -1));
    }
    if (this.overlay.isOpen()) this.overlay.render();
    else this.redraw();
  }

  private handleModeCharacter(str: string): void {
    if (this.mode === "filter") {
      const currentText = this.filters.getCurrentFilterText();
      this.filters.setFilterForScope(currentText + str);
    }
    if (this.mode === "search") {
      const currentText = this.filters.getCurrentSearchText();
      this.filters.setSearchForScope(currentText + str);
    }
    if (this.overlay.isOpen()) this.overlay.render();
    else this.redraw();
  }

  private handleNavigationKey(key: string): void {
    if (!this.services.length) return;

    const currentIndex = this.filters.activeService
      ? this.services.indexOf(this.filters.activeService)
      : -1;

    let newIndex: number;
    if (key === "[") {
      newIndex =
        currentIndex === -1
          ? this.services.length - 1
          : (currentIndex - 1 + this.services.length) % this.services.length;
    } else {
      newIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % this.services.length;
    }

    this.filters.activeService = this.services[newIndex];
    this.redraw();
  }

  private handleEscapeOrReturn(): void {
    const rows = process.stdout.rows || 24;
    this.writer.enqueue(process.stdout, [
      `${ESC}[s`,
      `${ESC}[${rows};1H`,
      `${ESC}[2K`,
      `${ESC}[u`,
    ]);

    if (this.paused) this.resumeAndFlush();
    if (this.overlay.isOpen()) this.overlay.closeOverlay();

    this.filters.clearCurrentScope();
    //this.viewport.toggleFooter();

    this.mode = null;
    this.redraw();
  }

  private findKeyBinding(key: readline.Key): KeyBinding | undefined {
    return this.keyBindings.find((binding) => {
      const keyMatch = binding.key === key.name;
      const ctrlMatch =
        binding.ctrl === undefined || binding.ctrl === !!key.ctrl;
      const metaMatch =
        binding.meta === undefined || binding.meta === !!key.meta;
      return keyMatch && ctrlMatch && metaMatch;
    });
  }

  private async handleKeypress(str: string, key: readline.Key): Promise<void> {
    if (!key) return;

    // Handle special keys first
    if (key.name === "return" || key.name === "escape") {
      this.handleEscapeOrReturn();
      return;
    }

    // Handle mode-specific input
    if (this.mode) {
      this.handleModeInput(str, key);
      return;
    }

    // Handle navigation keys
    if (key.sequence === "[" || key.sequence === "]") {
      this.handleNavigationKey(key.sequence);
      return;
    }

    // Handle filter mode activation
    if (key.sequence === "/") {
      this.mode = "filter";
      if (!this.viewport.isFooterEnabled()) this.viewport.enableFooter();
      this.viewport.markFooterDirty();
      return;
    }

    // Handle configured key bindings
    const binding = this.findKeyBinding(key);
    if (binding) {
      try {
        await binding.action(this);
      } catch (error) {
        console.error(`Error executing key binding for ${binding.key}:`, error);
      }
      return;
    }
  }

  init(): void {
    try {
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.resume();

      process.stdin.on("keypress", async (str, key) => {
        try {
          await this.handleKeypress(str, key);
        } catch (error) {
          console.error("Error handling keypress:", error);
        }
      });

      // Setup process event handlers
      // process.on("SIGINT", async () => await this.q());
      // process.on("SIGTERM", async () => await this.q());
      process.on("exit", () => this.cleanupTTY());
    } catch (error) {
      console.error("Error initializing KeyController:", error);
      throw error;
    }
  }

  private cleanupTTY(): void {
    try {
      this.cleanupServiceSelection();

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();

      this.viewport.resetScrollRegion();
      this.viewport.cleanup();
    } catch (error) {
      console.error("Error during TTY cleanup:", error);
    }
  }

  // Public method to get available key bindings for help/UI
  getKeyBindings(): KeyBinding[] {
    return this.keyBindings.map((binding) => ({ ...binding }));
  }

  // Public method to check current state
  getState() {
    return {
      mode: this.mode,
      paused: this.paused,
      activeService: this.filters.activeService,
      serviceSelectionActive: this.serviceSelection.isActive,
    };
  }
}
