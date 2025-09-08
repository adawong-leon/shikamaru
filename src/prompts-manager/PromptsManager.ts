import fs from "fs";
import path from "path";
import type { DistinctChoice } from "inquirer";
import chalk from "chalk";
import { PromptsError } from "./errors/PromptsError";
import { RepoValidator } from "./validators/RepoValidator";

import { ProfileManager } from "./ProfileManager";
import type {
  RepoChoice,
  RepoSelection,
  WatchMode,
  PromptsState,
  WatchModeConfig,
  PromptsConfig,
  RepoExecutionMode,
  GlobalExecutionOverride,
  HybridRepoConfig,
  UnifiedExecutionConfig,
  RepoConfig,
  LoggingConfig,
} from "./types";
import { UnifiedConfig } from "../config/UnifiedConfig";

export interface PromptsManagerConfig {
  projectsDir: string;
  minRepos?: number;
  maxRepos?: number;
  enableValidation?: boolean;
  enableSearch?: boolean;
  pageSize?: number;
  enableProfiles?: boolean;
  profilesDir?: string;
  profileName?: string;
}

export interface PromptsManagerMetrics {
  startTime: number;
  endTime?: number;
  reposDiscovered: number;
  reposSelected: number;
  validationErrors: number;
  warnings: number;
  userInteractions: number;
}

export class PromptsManager {
  private state: PromptsState;
  private config: PromptsManagerConfig;
  private metrics: PromptsManagerMetrics;
  private validator: RepoValidator;
  private profileManager: ProfileManager | null = null;
  private isInitialized = false;

  constructor(config: PromptsManagerConfig) {
    this.config = {
      minRepos: 1,
      maxRepos: 50,
      enableValidation: true,
      enableSearch: true,
      pageSize: this.calculatePageSize(),
      ...config,
    };

    this.state = {
      discoveredRepos: [],
      selectedRepos: [],
      watchMode: null,
      watchModeConfig: null,
      errors: [],
      warnings: [],
    };

    this.metrics = {
      startTime: Date.now(),
      reposDiscovered: 0,
      reposSelected: 0,
      validationErrors: 0,
      warnings: 0,
      userInteractions: 0,
    };

    // Ensure minRepos is always a number for RepoValidator
    const validatorConfig = {
      ...this.config,
      minRepos: this.config.minRepos ?? 1,
      maxRepos: this.config.maxRepos ?? 14,
    };

    // Ensure maxRepos is always a number for RepoValidator
    if (validatorConfig.maxRepos === undefined) {
      this.validator = new RepoValidator(validatorConfig as PromptsConfig);
    }
    // Ensure enableSearch is always a boolean for RepoValidator
    if (validatorConfig.enableSearch === undefined) {
      validatorConfig.enableSearch = true;
    }

    this.validator = new RepoValidator(validatorConfig as PromptsConfig);

    // Initialize ProfileManager if profiles are enabled
    if (this.config.enableProfiles !== false) {
      const profilesDir =
        this.config.profilesDir ||
        path.join(process.cwd(), ".shikamaru-profiles");
      this.profileManager = new ProfileManager({ profilesDir });
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new PromptsError(
        "PromptsManager already initialized",
        null,
        "ALREADY_INITIALIZED"
      );
    }

    try {
      this.validateConfig();
      await this.discoverRepos();
      this.isInitialized = true;
    } catch (error) {
      this.recordError("Failed to initialize prompts manager", error);
      throw error;
    }
  }

  async selectRepos(): Promise<RepoSelection> {
    if (!this.isInitialized) {
      throw new PromptsError(
        "PromptsManager must be initialized before selecting repos",
        null,
        "NOT_INITIALIZED"
      );
    }

    try {
      if (this.state.discoveredRepos.length === 0) {
        throw new PromptsError(
          "No repositories discovered",
          null,
          "NO_REPOS_FOUND"
        );
      }

      const selectedRepos = await this.promptForRepoSelection();

      // Validate selection
      if (this.config.enableValidation) {
        await this.validateRepoSelection(selectedRepos);
      }

      this.state.selectedRepos = selectedRepos;
      this.metrics.reposSelected = selectedRepos.length;
      this.metrics.userInteractions++;

      console.log(chalk.green(`✅ Selected ${selectedRepos.length} repo(s).`));
      return selectedRepos;
    } catch (error) {
      this.recordError("Failed to select repositories", error);
      throw error;
    }
  }

  async promptForCloudOptions() {
    const inquirer = await import("inquirer");

    const { skipCloud, skipInstall } = await inquirer.default.prompt([
      {
        type: "confirm",
        name: "skipCloud",
        message: "Skip cloud environment setup?",
        default: false,
      },
      {
        type: "confirm",
        name: "skipInstall",
        message: "Skip dependency installation (npm install)?",
        default: false,
      },
    ]);

    // Cloud provider selection removed; default to Azure when not skipped
    const cloudProviders: string[] | undefined = skipCloud
      ? undefined
      : ["azure"];

    return { skipCloud, skipInstall, cloudProviders };
  }

  async promptForPortReusePreference(): Promise<{
    portReusePreference: boolean;
  }> {
    const inquirer = await import("inquirer");

    const { portReusePreference } = await inquirer.default.prompt([
      {
        type: "confirm",
        name: "portReusePreference",
        message: "Reuse existing ports?",
        default: true,
      },
    ]);

    return { portReusePreference };
  }

  async promptForLoggingChoice(): Promise<{
    loggingMode: "web" | "terminal";
  }> {
    const inquirer = await import("inquirer");

    const { loggingMode } = await inquirer.default.prompt([
      {
        type: "list",
        name: "loggingMode",
        message: "Choose logging interface:",
        choices: [
          {
            name: "🌐 Web Interface (Interactive log viewer in browser)",
            value: "web",
          },
          {
            name: "💻 Terminal (Real-time logs in terminal)",
            value: "terminal",
          },
        ],
      },
    ]);

    return { loggingMode };
  }

  async promptForRepoExecutionModes(
    selectedRepos: RepoSelection,
    skipInstall?: boolean,
    skipAzure?: boolean
  ): Promise<{
    unifiedConfig: UnifiedConfig;
  }> {
    const inquirer = await import("inquirer");

    // First, ask for global execution mode
    const { globalMode } = await inquirer.default.prompt([
      {
        type: "list",
        name: "globalMode",
        message: "Select global execution mode for all repositories:",
        choices: [
          {
            name: "🖥️  Local (all repos run locally with npm run start, dotnet run, etc.)",
            value: "local",
          },
          {
            name: "🐳 Docker (all repos run in Docker with docker-compose up)",
            value: "docker",
          },
          {
            name: "🔄 Hybrid (choose which repos run locally vs Docker)",
            value: "hybrid",
          },
        ],
      },
    ]);

    let globalInstallCommand: string | undefined;
    let globalStartupCommand: string | undefined;

    // Generate repo-specific configurations with individual Docker commands
    const defaultRepoConfigs: RepoConfig[] = [];

    for (const repo of selectedRepos) {
      // Check if this repo has a Dockerfile with install and startup commands
      const repoPath = path.join(this.config.projectsDir, repo);
      const {
        installCommand: dockerfileInstallCommand,
        startupCommand: dockerfileStartupCommand,
      } = await this.getCommandsFromDockerfile(repoPath);

      let repoInstallCommand = globalInstallCommand || "docker-compose build";
      let repoStartupCommand = globalStartupCommand || "docker-compose up";

      // Use repo-specific Docker commands if available
      if (dockerfileInstallCommand) {
        repoInstallCommand = dockerfileInstallCommand;
        console.log(
          `📦 Found Dockerfile install command for ${repo}: ${dockerfileInstallCommand}`
        );
      }

      if (dockerfileStartupCommand) {
        repoStartupCommand = dockerfileStartupCommand;
        console.log(
          `🚀 Found Dockerfile startup command for ${repo}: ${dockerfileStartupCommand}`
        );
      }

      defaultRepoConfigs.push({
        repo,
        mode: "docker",
        installCommand: repoInstallCommand,
        startupCommand: repoStartupCommand,
      });
    }

    if (globalMode === "hybrid") {
      // For hybrid mode, ask user which repos should run locally
      const repoConfigs = await this.promptForLocalOverrides(
        selectedRepos,
        defaultRepoConfigs,
        skipInstall
      );

      // Get UnifiedConfig singleton instance and set properties using setters
      const config = UnifiedConfig.getInstance();
      config.setGlobalMode(globalMode);
      config.setGlobalInstallCommand(globalInstallCommand);
      config.setGlobalStartupCommand(globalStartupCommand);
      config.setSkipInstall(skipInstall || false);
      config.setSkipAzure(skipAzure || false);
      config.setRepoConfigs(repoConfigs);

      return {
        unifiedConfig: config,
      };
    } else {
      // For local or docker mode, update the mode for all repositories while keeping their individual commands
      let repoConfigs = defaultRepoConfigs.map((config) => ({
        ...config,
        mode: globalMode,
      }));

      // For local mode, add selective override functionality
      if (globalMode === "local") {
        repoConfigs = await this.promptForLocalModeOverrides(
          selectedRepos,
          repoConfigs,
          skipInstall
        );
      }

      // Get UnifiedConfig singleton instance and set properties using setters
      const config = UnifiedConfig.getInstance();
      config.setGlobalMode(globalMode);
      config.setGlobalInstallCommand(globalInstallCommand);
      config.setGlobalStartupCommand(globalStartupCommand);
      config.setSkipInstall(skipInstall || false);
      config.setSkipAzure(skipAzure || false);
      config.setRepoConfigs(repoConfigs);

      return {
        unifiedConfig: config,
      };
    }
  }

  private async promptForLocalOverrides(
    selectedRepos: RepoSelection,
    defaultRepoConfigs: RepoConfig[],
    skipInstall: boolean = false
  ): Promise<RepoConfig[]> {
    const inquirer = await import("inquirer");
    const repoConfigs = [...defaultRepoConfigs]; // Start with Docker defaults

    console.log(
      "🐳 All repositories will run in Docker with their individual commands by default."
    );
    console.log("🔄 Select which repositories should run locally instead:");

    const { reposToRunLocally } = await inquirer.default.prompt([
      {
        type: "checkbox",
        name: "reposToRunLocally",
        message:
          "Select repositories to run locally (space to select, enter to confirm):",
        choices: selectedRepos.map((repo) => {
          const repoConfig = repoConfigs.find((config) => config.repo === repo);
          const installCommand = repoConfig?.installCommand || "npm install";
          const startupCommand = repoConfig?.startupCommand || "npm run start";

          return {
            name: skipInstall
              ? `🖥️  ${repo} (local development)\n   🚀 Startup: ${startupCommand}`
              : `🖥️  ${repo} (local development)\n   📦 Install: ${installCommand}\n   🚀 Startup: ${startupCommand}`,
            value: repo,
            checked: false,
          };
        }),
      },
    ]);

    // First, ask which repos the user wants to override commands for
    if (reposToRunLocally.length > 0) {
      console.log(
        chalk.blue(
          `ℹ️ You selected ${reposToRunLocally.length} repo(s) to run locally.`
        )
      );

      const { reposToOverride } = await inquirer.default.prompt([
        {
          type: "checkbox",
          name: "reposToOverride",
          message:
            "Select which repos you want to override Docker commands for (space to select, enter to confirm):",
          choices: reposToRunLocally.map((repo: string) => {
            const repoConfig = repoConfigs.find(
              (config) => config.repo === repo
            );
            const installCommand = repoConfig?.installCommand || "npm install";
            const startupCommand =
              repoConfig?.startupCommand || "npm run start";

            return {
              name: skipInstall
                ? `🔧 ${repo} (override startup command)\n   🚀 Startup: ${startupCommand}`
                : `🔧 ${repo} (override commands)\n   📦 Install: ${installCommand}\n   🚀 Startup: ${startupCommand}`,
              value: repo,
              checked: false,
            };
          }),
        },
      ]);

      // Update selected repos to run locally
      for (const repo of reposToRunLocally) {
        const repoConfig = repoConfigs.find((config) => config.repo === repo);
        if (repoConfig) {
          // Use the existing Docker commands from the config as defaults
          const existingConfig = repoConfigs.find(
            (config) => config.repo === repo
          );
          let defaultInstallCommand =
            existingConfig?.installCommand || "npm install";
          let defaultStartupCommand =
            existingConfig?.startupCommand || "npm run start";

          // Variables to track Docker commands for feedback
          let dockerfileInstallCommand: string | null = null;
          let dockerfileStartupCommand: string | null = null;

          // If we don't have specific commands, try to detect from Dockerfile
          if (
            !existingConfig?.installCommand ||
            !existingConfig?.startupCommand
          ) {
            const repoPath = path.join(this.config.projectsDir, repo);
            const {
              installCommand: detectedInstallCommand,
              startupCommand: detectedStartupCommand,
            } = await this.getCommandsFromDockerfile(repoPath);

            dockerfileInstallCommand = detectedInstallCommand;
            dockerfileStartupCommand = detectedStartupCommand;

            if (dockerfileInstallCommand && !existingConfig?.installCommand) {
              defaultInstallCommand = dockerfileInstallCommand;
              console.log(
                `📦 Found Dockerfile install command for ${repo}: ${dockerfileInstallCommand}`
              );
            }

            if (dockerfileStartupCommand && !existingConfig?.startupCommand) {
              defaultStartupCommand = dockerfileStartupCommand;
              console.log(
                `🚀 Found Dockerfile startup command for ${repo}: ${dockerfileStartupCommand}`
              );
            }
          }

          // Check if user wants to override commands for this repo
          const shouldOverride = reposToOverride.includes(repo);

          if (shouldOverride) {
            let customInstallCommand: string | undefined;

            // Only prompt for install command if not skipping installation
            if (!skipInstall) {
              const installPrompt = await inquirer.default.prompt([
                {
                  type: "input",
                  name: "customInstallCommand",
                  message: `Enter custom install command for ${repo} (leave empty to use default):`,
                  default: defaultInstallCommand,
                },
              ]);
              customInstallCommand = installPrompt.customInstallCommand;
            }

            const { customStartupCommand } = await inquirer.default.prompt([
              {
                type: "input",
                name: "customStartupCommand",
                message: `Enter custom startup command for ${repo} (leave empty to use default):`,
                default: defaultStartupCommand,
              },
            ]);

            // Only update install command if not skipping installation
            if (!skipInstall) {
              repoConfig.installCommand =
                customInstallCommand || defaultInstallCommand;
            }
            repoConfig.startupCommand =
              customStartupCommand || defaultStartupCommand;

            console.log(chalk.green(`✅ Overridden commands for ${repo}:`));
            if (!skipInstall) {
              console.log(
                chalk.green(`  📦 Install: ${repoConfig.installCommand}`)
              );
            }
            console.log(
              chalk.green(`  🚀 Startup: ${repoConfig.startupCommand}`)
            );
          } else {
            // Use Docker commands as defaults when not overriding
            repoConfig.installCommand = defaultInstallCommand;
            repoConfig.startupCommand = defaultStartupCommand;

            if (dockerfileInstallCommand || dockerfileStartupCommand) {
              console.log(
                chalk.blue(`ℹ️ Using Docker commands as defaults for ${repo}:`)
              );
              if (dockerfileInstallCommand) {
                console.log(
                  chalk.blue(`  📦 Install: ${dockerfileInstallCommand}`)
                );
              }
              if (dockerfileStartupCommand) {
                console.log(
                  chalk.blue(`  🚀 Startup: ${dockerfileStartupCommand}`)
                );
              }
            }
          }

          repoConfig.mode = "local";
        }
      }

      // Show summary of all local repos and their commands
      if (reposToRunLocally.length > 0) {
        console.log(
          chalk.cyan("\n📋 Summary of local repos and their commands:")
        );
        for (const repo of reposToRunLocally) {
          const repoConfig = repoConfigs.find((config) => config.repo === repo);
          if (repoConfig) {
            console.log(chalk.cyan(`\n🖥️  ${repo}:`));
            if (!skipInstall) {
              console.log(
                chalk.cyan(`  📦 Install: ${repoConfig.installCommand}`)
              );
            }
            console.log(
              chalk.cyan(`  🚀 Startup: ${repoConfig.startupCommand}`)
            );
          }
        }
        console.log(chalk.cyan("\n"));
      }
    }

    return repoConfigs;
  }

  private async promptForLocalModeOverrides(
    selectedRepos: RepoSelection,
    repoConfigs: RepoConfig[],
    skipInstall: boolean = false
  ): Promise<RepoConfig[]> {
    const inquirer = await import("inquirer");

    // Show all selected repos and their commands
    console.log(
      chalk.blue(
        `ℹ️ You selected ${selectedRepos.length} repo(s) to run locally.`
      )
    );

    // Ask which repos the user wants to override commands for
    const { reposToOverride } = await inquirer.default.prompt([
      {
        type: "checkbox",
        name: "reposToOverride",
        message:
          "Select which repos you want to override commands for (space to select, enter to confirm):",
        choices: selectedRepos.map((repo: string) => {
          const repoConfig = repoConfigs.find((config) => config.repo === repo);
          const installCommand = repoConfig?.installCommand || "npm install";
          const startupCommand = repoConfig?.startupCommand || "npm run start";

          return {
            name: skipInstall
              ? `🔧 ${repo} (override startup command)\n   🚀 Startup: ${startupCommand}`
              : `🔧 ${repo} (override commands)\n   📦 Install: ${installCommand}\n   🚀 Startup: ${startupCommand}`,
            value: repo,
            checked: false,
          };
        }),
      },
    ]);

    // Update selected repos with overrides
    for (const repo of reposToOverride) {
      const repoConfig = repoConfigs.find((config) => config.repo === repo);
      if (repoConfig) {
        let customInstallCommand: string | undefined;

        // Only prompt for install command if not skipping installation
        if (!skipInstall) {
          const installPrompt = await inquirer.default.prompt([
            {
              type: "input",
              name: "customInstallCommand",
              message: `Enter custom install command for ${repo} (leave empty to use default):`,
              default: repoConfig.installCommand,
            },
          ]);
          customInstallCommand = installPrompt.customInstallCommand;
        }

        const { customStartupCommand } = await inquirer.default.prompt([
          {
            type: "input",
            name: "customStartupCommand",
            message: `Enter custom startup command for ${repo} (leave empty to use default):`,
            default: repoConfig.startupCommand,
          },
        ]);

        // Only update install command if not skipping installation
        if (!skipInstall) {
          repoConfig.installCommand =
            customInstallCommand || repoConfig.installCommand;
        }
        repoConfig.startupCommand =
          customStartupCommand || repoConfig.startupCommand;

        console.log(chalk.green(`✅ Overridden commands for ${repo}:`));
        if (!skipInstall) {
          console.log(
            chalk.green(`  📦 Install: ${repoConfig.installCommand}`)
          );
        }
        console.log(chalk.green(`  🚀 Startup: ${repoConfig.startupCommand}`));
      }
    }

    // Show final summary of all local repos and their commands
    console.log(
      chalk.cyan("\n📋 Final summary of local repos and their commands:")
    );
    for (const repo of selectedRepos) {
      const repoConfig = repoConfigs.find((config) => config.repo === repo);
      if (repoConfig) {
        console.log(chalk.cyan(`\n🖥️  ${repo}:`));
        console.log(chalk.cyan(`  📦 Install: ${repoConfig.installCommand}`));
        console.log(chalk.cyan(`  🚀 Startup: ${repoConfig.startupCommand}`));
      }
    }
    console.log(chalk.cyan("\n"));

    return repoConfigs;
  }

  async runFullSelection() {
    if (!this.isInitialized) {
      throw new PromptsError(
        "PromptsManager must be initialized before running full selection",
        null,
        "NOT_INITIALIZED"
      );
    }

    try {
      // Check if profiles are enabled and handle profile flow
      if (this.profileManager) {
        const result = await this.handleProfileFlow();
        if (result) {
          return result;
        }
      }

      // Fall back to normal flow
      return await this.runNormalFlow();
    } catch (error) {
      this.recordError("Failed to run full selection", error);
      throw error;
    }
  }

  private async getCommandsFromDockerfile(
    repoPath: string
  ): Promise<{ installCommand: string | null; startupCommand: string | null }> {
    const dockerfilePath = path.join(repoPath, "Dockerfile");
    if (!fs.existsSync(dockerfilePath))
      return { installCommand: null, startupCommand: null };

    const content = fs.readFileSync(dockerfilePath, "utf8");

    // 1) Normalize logical lines (handle backslash-continued lines)
    const lines = this.toLogicalLines(content);

    // 2) Parse instructions, track stages, last CMD/ENTRYPOINT per stage, collect RUNs
    let stageIndex = -1;
    const stageCountPerFrom: number[] = [];
    const runsByStage: string[][] = [];
    const cmdByStage: Array<{ exec?: string[]; shell?: string } | null> = [];
    const entryByStage: Array<{ exec?: string[]; shell?: string } | null> = [];

    function ensureStage(i: number) {
      while (runsByStage.length <= i) runsByStage.push([]);
      while (cmdByStage.length <= i) cmdByStage.push(null);
      while (entryByStage.length <= i) entryByStage.push(null);
    }

    for (const raw of lines) {
      const line = this.stripInlineComment(raw).trim();
      if (!line) continue;

      const m = /^([A-Z]+)\s+(.*)$/i.exec(line);
      if (!m) continue;

      const instr = m[1].toUpperCase();
      const rest = m[2].trim();

      if (instr === "FROM") {
        stageIndex++;
        stageCountPerFrom.push(stageIndex);
        ensureStage(stageIndex);
        continue;
      }

      if (stageIndex < 0) {
        // Dockerfile must start with FROM, but be defensive
        stageIndex = 0;
        ensureStage(stageIndex);
      }

      if (instr === "RUN") {
        runsByStage[stageIndex].push(rest);
      } else if (instr === "CMD") {
        const parsed = this.parseExecOrShell(rest);
        cmdByStage[stageIndex] = parsed;
      } else if (instr === "ENTRYPOINT") {
        const parsed = this.parseExecOrShell(rest);
        entryByStage[stageIndex] = parsed;
      }
    }

    const finalStage = Math.max(0, stageIndex);

    // 3) Detect install command: prefer final-stage RUNs, else fallback earlier
    const installCommand =
      this.detectInstallInRuns(runsByStage[finalStage]) ??
      this.detectInstallInRuns(this.flatten(runsByStage.slice(0, finalStage)));

    // 4) Detect startup: merge ENTRYPOINT + CMD of final stage (Docker behavior)
    const startupCommand = this.resolveStartup(
      entryByStage[finalStage],
      cmdByStage[finalStage]
    );

    return { installCommand, startupCommand };
  }

  /* ---------------- helpers ---------------- */

  private toLogicalLines(text: string): string[] {
    const raw = text.replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];
    let buf = "";
    let cont = false;

    for (let line of raw) {
      // Preserve trailing spaces relevant to parsing; trim right only for backslash test
      const endsWithSlash = /\\\s*$/.test(line);
      line = line.replace(/\s+$/g, ""); // rtrim

      if (cont) buf += " " + line.replace(/\\\s*$/, "");
      else buf = line.replace(/\\\s*$/, "");

      cont = endsWithSlash;
      if (!cont) {
        out.push(buf);
        buf = "";
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  private stripInlineComment(s: string): string {
    // Remove comments when '#' not inside quotes
    let inS = false,
      inD = false,
      esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (!inD && c === "'") inS = !inS;
      else if (!inS && c === '"') inD = !inD;
      else if (!inS && !inD && c === "#") return s.slice(0, i);
    }
    return s;
  }

  private parseExecOrShell(rest: string): { exec?: string[]; shell?: string } {
    const trimmed = rest.trim();
    if (trimmed.startsWith("["))
      return { exec: this.safeParseJsonArray(trimmed) ?? undefined } as any;

    return { shell: trimmed };
  }

  private safeParseJsonArray(s: string): string[] | null {
    try {
      // Dockerfile JSON array must use double quotes; leave as-is
      const arr = JSON.parse(s);
      return Array.isArray(arr) && arr.every((x) => typeof x === "string")
        ? arr
        : null;
    } catch {
      return null;
    }
  }

  private resolveStartup(
    entry: { exec?: string[]; shell?: string } | null,
    cmd: { exec?: string[]; shell?: string } | null
  ): string | null {
    if (!entry && !cmd) return null;

    // Prefer exec-form merge: ENTRYPOINT + CMD
    if (entry?.exec && cmd?.exec) {
      return this.shellJoin([...entry.exec, ...cmd.exec]);
    }
    if (entry?.exec && !cmd) return this.shellJoin(entry.exec);
    if (!entry && cmd?.exec) return this.shellJoin(cmd.exec);

    // If any shell-form present, fall back to the last one (Docker shell semantics are messy)
    // Prefer ENTRYPOINT shell, else CMD shell.
    if (entry?.shell) return entry.shell;
    if (cmd?.shell) return cmd.shell;

    return null;
  }

  private shellJoin(tokens: string[]): string {
    // Join tokens with quoting when needed (very simple)
    return tokens
      .map((t) => (/\s|["'\\]/.test(t) ? JSON.stringify(t) : t))
      .join(" ");
  }

  private flatten<T>(arrs: T[][]): T[] {
    return ([] as T[]).concat(...arrs);
  }

  private detectInstallInRuns(runLines: string[]): string | null {
    // Split compound RUN commands by && and ; while respecting quotes
    for (const run of runLines.slice().reverse()) {
      const parts = this.splitCompound(run);
      for (const part of parts) {
        const tokens = this.tokenize(part);
        const cmd = this.classifyInstall(tokens);
        if (cmd) return cmd;
      }
    }
    return null;
  }

  private splitCompound(s: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inS = false,
      inD = false,
      esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (esc) {
        cur += c;
        esc = false;
        continue;
      }
      if (c === "\\") {
        cur += c;
        esc = true;
        continue;
      }
      if (c === "'" && !inD) {
        inS = !inS;
        cur += c;
        continue;
      }
      if (c === '"' && !inS) {
        inD = !inD;
        cur += c;
        continue;
      }

      // split on && or ; when not quoted
      if (!inS && !inD) {
        if (c === ";") {
          push();
          continue;
        }
        if (c === "&" && s[i + 1] === "&") {
          push();
          i++;
          continue;
        }
        if (c === "|" && s[i + 1] === "|") {
          push();
          i++;
          continue;
        }
      }
      cur += c;
    }
    push();
    return out;

    function push() {
      const t = cur.trim();
      if (t) out.push(t);
      cur = "";
    }
  }

  // Very small shell tokenizer (handles quotes and basic escapes)
  private tokenize(cmd: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inS = false,
      inD = false,
      esc = false;

    for (let i = 0; i < cmd.length; i++) {
      const c = cmd[i];
      if (esc) {
        cur += c;
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }

      if (!inD && c === "'") {
        inS = !inS;
        continue;
      }
      if (!inS && c === '"') {
        inD = !inD;
        continue;
      }

      if (!inS && !inD && /\s/.test(c)) {
        if (cur) {
          out.push(cur);
          cur = "";
        }
        continue;
      }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Return normalized install command string if the tokens represent dependency install; otherwise null */
  private classifyInstall(tokens: string[]): string | null {
    if (!tokens.length) return null;
    const [bin, ...rest] = tokens;
    const first = bin.toLowerCase();

    // Ignore OS package managers
    if (
      ["apt-get", "apt", "apk", "dnf", "yum", "zypper", "pacman"].includes(
        first
      )
    )
      return null;

    // Node
    if (first === "npm") {
      if (this.hasAny(rest, ["ci"]) || this.hasAny(rest, ["install", "i"]))
        return [
          "npm",
          this.pick(["ci", "install", "i"], rest) ?? "install",
          ...rest.filter((x) => !["ci", "install", "i"].includes(x)),
        ].join(" ");
    }
    if (first === "yarn") {
      if (this.hasAny(rest, ["install"]))
        return ["yarn", "install", ...rest.filter((x) => x !== "install")].join(
          " "
        );
    }
    if (first === "pnpm") {
      if (
        this.hasAny(rest, ["install", "i", "ci", "install --frozen-lockfile"])
      )
        return [
          "pnpm",
          this.pick(["ci", "install", "i"], rest) ?? "install",
          ...rest.filter((x) => !["install", "i", "ci"].includes(x)),
        ].join(" ");
    }
    if (first === "bun") {
      if (this.hasAny(rest, ["install", "i"]))
        return [
          "bun",
          this.pick(["install", "i"], rest) ?? "install",
          ...rest.filter((x) => !["install", "i"].includes(x)),
        ].join(" ");
    }

    // Python
    if (first === "pip" || first === "pip3") {
      if (this.hasAny(rest, ["install"])) return tokens.join(" ");
    }
    if (first === "poetry" && this.hasAny(rest, ["install"]))
      return tokens.join(" ");
    if (first === "pipenv" && this.hasAny(rest, ["install"]))
      return tokens.join(" ");

    // Go
    if (first === "go" && this.hasAny(rest, ["mod"])) {
      if (
        rest[rest.indexOf("mod") + 1]?.toLowerCase() === "tidy" ||
        rest[rest.indexOf("mod") + 1]?.toLowerCase() === "download"
      ) {
        return tokens.join(" ");
      }
    }

    // .NET
    if (first === "dotnet" && this.hasAny(rest, ["restore"]))
      return tokens.join(" ");
    if (first === "nuget" && this.hasAny(rest, ["restore"]))
      return tokens.join(" ");

    // Java
    if (
      (first === "mvn" || first === "mvnw") &&
      (this.hasAny(rest, ["install"]) ||
        this.hasAny(rest, ["dependency:resolve"]))
    )
      return [
        first,
        this.pick(["install", "dependency:resolve"], rest) ?? "install",
        ...rest.filter((x) => x !== "install" && x !== "dependency:resolve"),
      ].join(" ");
    if (
      (first === "gradle" || first === "./gradlew") &&
      this.hasAny(rest, ["build", "assemble", "dependencies"])
    )
      return tokens.join(" ");

    // PHP
    if (first === "composer" && this.hasAny(rest, ["install"]))
      return tokens.join(" ");

    // Ruby
    if (
      (first === "bundle" || first === "bundler") &&
      this.hasAny(rest, ["install"])
    )
      return tokens.join(" ");

    // Rust
    if (first === "cargo" && this.hasAny(rest, ["fetch", "build"]))
      return tokens.join(" ");

    // Elixir
    if (first === "mix" && this.hasAny(rest, ["deps.get"]))
      return tokens.join(" ");

    // Dart/Flutter
    if (
      first === "flutter" &&
      this.hasAny(rest, ["pub"]) &&
      rest[rest.indexOf("pub") + 1]?.toLowerCase() === "get"
    )
      return tokens.join(" ");

    // SwiftPM
    if (
      first === "swift" &&
      this.hasAny(rest, ["package"]) &&
      rest.includes("resolve")
    )
      return tokens.join(" ");

    return null;
  }

  private hasAny(arr: string[], options: string[]): boolean {
    const set = new Set(arr.map((x) => x.toLowerCase()));
    return options.some((o) => set.has(o.toLowerCase()));
  }

  private pick(options: string[], arr: string[]): string | undefined {
    const set = new Set(arr.map((x) => x.toLowerCase()));
    return options.find((o) => set.has(o.toLowerCase()));
  }

  private loadProfileConfiguration(profile: any): {
    repos: RepoSelection;
    skipCloud: boolean;
    skipInstall: boolean;
    cloudProviders?: string[];
    unifiedConfig: UnifiedConfig;
    loggingConfig: LoggingConfig;
    portReusePreference: boolean;
  } {
    try {
      const { promptSteps } = profile;
      if (!promptSteps) throw new Error("Profile is missing promptSteps.");

      // Destructure with defaults to guard against partial profiles
      const {
        unifiedConfig: uc = {},
        selectedRepos = [],
        skipCloud = false,
        skipInstall = false,
        cloudProviders = [],
        loggingConfig = { mode: "terminal" },
        portReusePreference = true,
      } = promptSteps;

      // Apply profile -> UnifiedConfig singleton
      const config = UnifiedConfig.getInstance();
      this.applyProfileToUnifiedConfig({
        config,
        profileUnifiedConfig: uc,
        projectsDir: this.config.projectsDir,
        loggingConfig,
      });

      console.log(chalk.green(`✅ Loaded profile: ${profile.name}`));

      return {
        repos: selectedRepos,
        skipCloud,
        skipInstall,
        cloudProviders,
        unifiedConfig: config,
        loggingConfig,
        portReusePreference,
      };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to load profile: ${profile?.name}`));
      console.error(error);
      throw error;
    }
  }

  private async handleProfileFlow(): Promise<{
    repos: RepoSelection;
    skipCloud: boolean;
    skipInstall: boolean;
    cloudProviders?: string[];
    unifiedConfig: UnifiedConfig;
    loggingConfig: LoggingConfig;
    portReusePreference: boolean;
  } | null> {
    if (!this.profileManager) {
      return null;
    }

    // Check if a profile name was provided via CLI argument
    if (this.config.profileName) {
      const profile = this.profileManager.getProfileByName(
        this.config.profileName
      );
      if (!profile) {
        throw new PromptsError(
          `Profile "${this.config.profileName}" not found`,
          null,
          "PROFILE_NOT_FOUND"
        );
      }

      // Load the specified profile directly
      return this.loadProfileConfiguration(profile);
    }

    const action = await this.profileManager.promptForProfileAction();

    switch (action) {
      case "load": {
        // Ask user to pick a profile
        const profile = await this.profileManager.promptForProfileSelection();
        if (!profile) break; // user cancelled → fall through to normal flow

        try {
          return this.loadProfileConfiguration(profile);
        } catch (err) {
          console.error(
            chalk.red(`Failed to load profile: ${(err as Error).message}`)
          );
          // Intentionally fall through to normal flow if loading fails
        }

        break;
      }

      case "continue":
        // User chose to continue without profile, mark this to skip profile save later
        this.state.skipProfileSave = true;
        break;

      case "new":
        // User chose to create new configuration, run normal flow
        break;
    }

    return null;
  }

  /**
   * Applies a profile's unified config + logging to the given UnifiedConfig singleton.
   * Guards against undefined fields and avoids mutating external references.
   */
  private applyProfileToUnifiedConfig(opts: {
    config: UnifiedConfig;
    profileUnifiedConfig: Partial<{
      globalMode: string;
      globalInstallCommand: string;
      globalStartupCommand: string;
      skipInstall: boolean;
      skipAzure: boolean;
      repoConfigs: any[];
    }>;
    projectsDir: string;
    loggingConfig: LoggingConfig;
  }) {
    const {
      config,
      profileUnifiedConfig: uc,
      projectsDir,
      loggingConfig,
    } = opts;

    if (uc.globalMode !== undefined)
      config.setGlobalMode(uc.globalMode as "local" | "docker" | "hybrid");
    if (uc.globalInstallCommand !== undefined)
      config.setGlobalInstallCommand(uc.globalInstallCommand);
    if (uc.globalStartupCommand !== undefined)
      config.setGlobalStartupCommand(uc.globalStartupCommand);

    config.setSkipInstall(Boolean(uc.skipInstall));
    config.setSkipAzure(Boolean(uc.skipAzure));

    // Defensive copy to avoid accidental external mutation
    if (Array.isArray(uc.repoConfigs)) {
      const safeRepoConfigs = uc.repoConfigs.map((r) =>
        typeof r === "object" && r !== null ? { ...r } : r
      ) as any[];
      config.setRepoConfigs(safeRepoConfigs);
    }

    // Always ensure projectsDir + logging are applied from the chosen profile
    if (projectsDir) config.setProjectsDir(projectsDir);
    if (loggingConfig) config.setLoggingConfig(loggingConfig);
  }

  private async runNormalFlow() {
    try {
      const repos = await this.selectRepos();
      const { skipCloud, skipInstall, cloudProviders } =
        await this.promptForCloudOptions();

      // Add execution mode selection
      const { unifiedConfig } = await this.promptForRepoExecutionModes(
        repos,
        skipInstall,
        skipCloud
      );

      // Add port reuse preference
      const { portReusePreference } = await this.promptForPortReusePreference();

      // Add logging choice
      const { loggingMode } = await this.promptForLoggingChoice();

      // Get UnifiedConfig singleton instance and set all properties using setters
      const config = UnifiedConfig.getInstance();

      // Set basic properties
      config.setProjectsDir(this.config.projectsDir);
      config.setSkipAzure(skipCloud);
      config.setSkipInstall(skipInstall);

      // Set execution mode properties from unifiedConfig
      config.setGlobalMode(unifiedConfig.globalMode);
      config.setGlobalInstallCommand(unifiedConfig.globalInstallCommand);
      config.setGlobalStartupCommand(unifiedConfig.globalStartupCommand);
      config.setRepoConfigs(unifiedConfig.repoConfigs);

      // Set logging configuration
      config.setLoggingConfig({
        mode: loggingMode,
      });

      this.metrics.endTime = Date.now();

      // Prompt to save as profile if enabled and user didn't choose to continue without profile
      if (this.profileManager && !this.state.skipProfileSave) {
        await this.profileManager.promptForSaveProfile(
          repos,
          skipCloud,
          skipInstall,
          unifiedConfig,
          cloudProviders,
          { mode: loggingMode },
          portReusePreference
        );
      }

      return {
        repos,
        unifiedConfig: config,
        portReusePreference,
      };
    } catch (error) {
      throw new PromptsError(
        "Failed to complete repository and execution mode selection",
        error
      );
    }
  }

  private validateConfig(): void {
    if (
      !this.config.projectsDir ||
      typeof this.config.projectsDir !== "string"
    ) {
      throw new PromptsError(
        "Valid projectsDir is required",
        null,
        "INVALID_CONFIG"
      );
    }

    if (this.config.minRepos && this.config.minRepos < 1) {
      throw new PromptsError(
        "minRepos must be at least 1",
        null,
        "INVALID_CONFIG"
      );
    }

    if (this.config.maxRepos && this.config.maxRepos < this.config.minRepos!) {
      throw new PromptsError(
        "maxRepos must be greater than or equal to minRepos",
        null,
        "INVALID_CONFIG"
      );
    }
  }

  private async discoverRepos(): Promise<void> {
    try {
      const dirs = fs
        .readdirSync(this.config.projectsDir)
        .filter((f) => {
          const p = path.join(this.config.projectsDir, f);
          return (
            fs.statSync(p).isDirectory() &&
            fs.existsSync(path.join(p, ".env.example"))
          );
        })
        .sort((a, b) => a.localeCompare(b));

      this.state.discoveredRepos = dirs;
      this.metrics.reposDiscovered = dirs.length;

      if (dirs.length === 0) {
        throw new PromptsError(
          "No repos with .env.example found",
          null,
          "NO_REPOS_FOUND"
        );
      }
    } catch (error) {
      throw new PromptsError("Failed to discover repositories", error);
    }
  }

  private async promptForRepoSelection(): Promise<RepoSelection> {
    try {
      const inquirer = await import("inquirer");

      // Register checkbox-plus if available
      if (this.config.enableSearch) {
        try {
          // @ts-ignore
          const checkboxPlus = await import("inquirer-checkbox-plus-prompt");
          if ("registerPrompt" in inquirer.default) {
            (inquirer.default as any).registerPrompt(
              "checkbox-plus",
              checkboxPlus.default
            );
          }
        } catch (error) {
          this.recordWarning(
            "Checkbox-plus not available, falling back to standard checkbox"
          );
        }
      }

      const promptType = this.config.enableSearch
        ? "checkbox-plus"
        : "checkbox";
      const promptConfig: any = {
        type: promptType,
        name: "picked",
        message: `Select repos (minimum ${this.config.minRepos}, maximum ${this.config.maxRepos}):`,
        pageSize: this.config.pageSize,
        validate: (input: RepoChoice[]) => {
          if (!input || input.length === 0) {
            return `Please select at least ${this.config.minRepos} repository`;
          }
          if (input.length < this.config.minRepos!) {
            return `Please select at least ${this.config.minRepos} repository(ies)`;
          }
          if (input.length > this.config.maxRepos!) {
            return `Please select no more than ${this.config.maxRepos} repository(ies)`;
          }
          return true;
        },
      };

      if (promptType === "checkbox-plus") {
        promptConfig.searchable = true;
        promptConfig.highlight = true;
        promptConfig.source = async (_answers: unknown, input: string) => {
          const term = (input || "").toLowerCase();
          const filtered = term
            ? this.state.discoveredRepos.filter((d) =>
                d.toLowerCase().includes(term)
              )
            : this.state.discoveredRepos;
          return this.toChoices(filtered);
        };
      } else {
        promptConfig.choices = this.toChoices(this.state.discoveredRepos);
      }

      const { picked } = await inquirer.default.prompt<{
        picked: RepoChoice[];
      }>([promptConfig]);

      // Expand selections
      const expanded = new Set<string>();
      for (const it of picked) {
        if (it.kind === "repo") expanded.add(it.name);
      }

      return [...expanded];
    } catch (error) {
      throw new PromptsError(
        "Failed to prompt for repository selection",
        error
      );
    }
  }

  private async validateRepoSelection(
    selectedRepos: RepoSelection
  ): Promise<void> {
    try {
      const validationResult = await this.validator.validateRepos(
        selectedRepos,
        this.state.discoveredRepos
      );

      if (validationResult.errors.length > 0) {
        validationResult.errors.forEach((error) =>
          this.recordError(error, null)
        );
        this.metrics.validationErrors += validationResult.errors.length;
      }

      if (validationResult.warnings.length > 0) {
        validationResult.warnings.forEach((warning) =>
          this.recordWarning(warning)
        );
        this.metrics.warnings += validationResult.warnings.length;
      }

      if (validationResult.errors.length > 0) {
        throw new PromptsError(
          "Repository selection validation failed",
          null,
          "VALIDATION_FAILED"
        );
      }
    } catch (error) {
      throw new PromptsError("Failed to validate repository selection", error);
    }
  }

  private toChoices(items: string[]): DistinctChoice<RepoChoice>[] {
    const cols = process.stdout?.columns || 120;
    const maxLabel = Math.max(18, Math.min(80, cols - 10));

    return items.map((name) => ({
      name: this.ellipsize(name, maxLabel),
      short: name,
      value: { kind: "repo", name },
    }));
  }

  private ellipsize(str: string, max: number): string {
    if (str.length <= max) return str;
    if (max <= 1) return "…";
    return str.slice(0, Math.max(1, max - 1)) + "…";
  }

  private calculatePageSize(): number {
    const rows = process.stdout?.rows || 24;
    return Math.max(6, Math.min(50, rows - 6));
  }

  private recordError(message: string, error?: any): void {
    const errorMessage = error ? `${message}: ${error}` : message;
    this.state.errors.push(errorMessage);
  }

  private recordWarning(message: string): void {
    this.state.warnings.push(message);
  }

  // Public API methods
  getState(): PromptsState {
    return { ...this.state };
  }

  getMetrics(): PromptsManagerMetrics {
    return { ...this.metrics };
  }

  getErrors(): string[] {
    return [...this.state.errors];
  }

  getWarnings(): string[] {
    return [...this.state.warnings];
  }

  hasErrors(): boolean {
    return this.state.errors.length > 0;
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  // Method to reset the manager for reuse
  reset(): void {
    this.state = {
      discoveredRepos: [],
      selectedRepos: [],
      watchMode: null,
      watchModeConfig: null,
      errors: [],
      warnings: [],
    };
    this.metrics = {
      startTime: Date.now(),
      reposDiscovered: 0,
      reposSelected: 0,
      validationErrors: 0,
      warnings: 0,
      userInteractions: 0,
    };
    this.isInitialized = false;
  }

  // Method to get discovered repos
  getDiscoveredRepos(): string[] {
    return [...this.state.discoveredRepos];
  }

  // Method to get selected repos
  getSelectedRepos(): string[] {
    return [...this.state.selectedRepos];
  }

  // Method to get watch mode
  getWatchMode(): WatchMode | null {
    return this.state.watchMode;
  }
}
