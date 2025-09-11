import fs from "fs";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import type {
  RepoSelection,
  RepoExecutionMode,
  GlobalExecutionOverride,
  HybridRepoConfig,
  UnifiedExecutionConfig,
  LoggingConfig,
} from "./types";

export interface Profile {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  // All prompt steps consolidated in profile
  promptSteps: {
    // Step 1: Repository Selection
    selectedRepos: RepoSelection;

    // Step 2: Cloud Options
    skipCloud: boolean;
    skipInstall: boolean;
    cloudProviders?: string[];

    // Step 2.1: Environment generation
    useExistingEnvFiles?: boolean;

    // Step 3: Execution Modes
    unifiedConfig: UnifiedExecutionConfig;

    // Step 4: Logging Configuration
    loggingConfig: LoggingConfig;

    // Step 5: Port Management
    portReusePreference: boolean;
  };
}

export interface ProfileManagerConfig {
  profilesDir: string;
  maxProfiles?: number;
}

export class ProfileManager {
  private config: ProfileManagerConfig;
  private profilesPath: string;

  constructor(config: ProfileManagerConfig) {
    this.config = {
      maxProfiles: 10,
      ...config,
    };
    this.profilesPath = path.join(this.config.profilesDir, "profiles.json");
    this.ensureProfilesDir();
  }

  private ensureProfilesDir(): void {
    if (!fs.existsSync(this.config.profilesDir)) {
      fs.mkdirSync(this.config.profilesDir, { recursive: true });
    }
  }

  private loadProfiles(): Profile[] {
    try {
      if (!fs.existsSync(this.profilesPath)) {
        return [];
      }
      const data = fs.readFileSync(this.profilesPath, "utf8");
      const profiles = JSON.parse(data);

      // Migrate old profiles to new unified structure
      return profiles.map((profile: any) => this.migrateProfile(profile));
    } catch (error) {
      console.warn(chalk.yellow("⚠️  Could not load profiles, starting fresh"));
      return [];
    }
  }

  private migrateProfile(oldProfile: any): Profile {
    // If profile already has promptSteps structure, return as is
    if (oldProfile.promptSteps) {
      return oldProfile as Profile;
    }

    // If profile has unifiedConfig but not promptSteps, migrate to new structure
    if (oldProfile.unifiedConfig) {
      return {
        name: oldProfile.name,
        description: oldProfile.description,
        createdAt: oldProfile.createdAt,
        updatedAt: oldProfile.updatedAt,
        promptSteps: {
          selectedRepos: oldProfile.selectedRepos || [],
          skipCloud: oldProfile.skipCloud || false,
          skipInstall: oldProfile.skipInstall || false,
          cloudProviders: oldProfile.cloudProviders,
          useExistingEnvFiles: oldProfile.useExistingEnvFiles || false,
          unifiedConfig: oldProfile.unifiedConfig,
          loggingConfig: oldProfile.unifiedConfig.loggingConfig || {
            mode: "terminal",
          },
          portReusePreference: oldProfile.portReusePreference || true,
        },
      };
    }

    // Migrate from old structure to new unified structure
    const unifiedConfig: UnifiedExecutionConfig = {
      globalMode: oldProfile.globalOverride?.mode || "local",
      globalInstallCommand: oldProfile.globalOverride?.installCommand,
      globalStartupCommand: oldProfile.globalOverride?.startupCommand,
      skipInstall: oldProfile.skipInstall,
      skipAzure: oldProfile.skipCloud, // Map skipCloud to skipAzure for backward compatibility
      repoConfigs: [],
    };

    // Convert executionModes to repoConfigs
    if (oldProfile.executionModes) {
      unifiedConfig.repoConfigs = oldProfile.executionModes.map((em: any) => ({
        repo: em.repo,
        mode: em.mode,
        installCommand: em.installCommand,
        startupCommand: em.startupCommand,
      }));
    }

    // Convert hybridConfig to repoConfigs if it exists
    if (oldProfile.hybridConfig) {
      unifiedConfig.repoConfigs = oldProfile.hybridConfig.map((hc: any) => ({
        repo: hc.repo,
        mode: hc.mode,
        installCommand: hc.installCommand,
        startupCommand: hc.startupCommand,
      }));
    }

    // If no repoConfigs but global mode is hybrid, create default local configs
    if (
      unifiedConfig.repoConfigs.length === 0 &&
      unifiedConfig.globalMode === "hybrid"
    ) {
      unifiedConfig.repoConfigs = oldProfile.selectedRepos.map(
        (repo: string) => ({
          repo,
          mode: "local",
        })
      );
    }

    return {
      name: oldProfile.name,
      description: oldProfile.description,
      createdAt: oldProfile.createdAt,
      updatedAt: oldProfile.updatedAt,
      promptSteps: {
        selectedRepos: oldProfile.selectedRepos || [],
        skipCloud: oldProfile.skipCloud || false,
        skipInstall: oldProfile.skipInstall || false,
        cloudProviders: oldProfile.cloudProviders,
        useExistingEnvFiles: oldProfile.useExistingEnvFiles || false,
        unifiedConfig,
        loggingConfig: { mode: "terminal" }, // Default logging config
        portReusePreference: oldProfile.portReusePreference || true,
      },
    };
  }

  private saveProfiles(profiles: Profile[]): void {
    try {
      fs.writeFileSync(this.profilesPath, JSON.stringify(profiles, null, 2));
    } catch (error) {
      throw new Error(`Failed to save profiles: ${error}`);
    }
  }

  async promptForProfileAction(): Promise<"new" | "load" | "continue"> {
    const profiles = this.loadProfiles();

    if (profiles.length === 0) {
      return "new";
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "🆕 Create new configuration", value: "new" },
          { name: "📂 Load saved profile", value: "load" },
          { name: "➡️  Continue without profile", value: "continue" },
        ],
      },
    ]);

    return action;
  }

  async promptForProfileName(): Promise<string> {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Enter a name for this profile:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Profile name cannot be empty";
          }
          if (input.length > 50) {
            return "Profile name must be 50 characters or less";
          }
          return true;
        },
      },
    ]);

    return name.trim();
  }

  async promptForProfileDescription(): Promise<string | undefined> {
    const { description } = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Enter a description (optional):",
        default: "",
      },
    ]);

    return description.trim() || undefined;
  }

  async promptForProfileSelection(): Promise<Profile | null> {
    const profiles = this.loadProfiles();

    if (profiles.length === 0) {
      return null;
    }

    const choices = profiles.map((profile) => ({
      name: `${profile.name}${
        profile.description ? ` - ${profile.description}` : ""
      } (${profile.promptSteps.selectedRepos.length} repos)`,
      value: profile,
    }));

    const { selectedProfile } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedProfile",
        message: "Select a profile to load:",
        choices: [
          ...choices,
          new inquirer.Separator(),
          { name: "❌ Cancel", value: "cancel" },
        ],
      },
    ]);

    return selectedProfile === "cancel" ? null : selectedProfile;
  }

  async saveProfile(
    name: string,
    description: string | undefined,
    selectedRepos: RepoSelection,
    skipCloud: boolean,
    skipInstall: boolean,
    unifiedConfig: UnifiedExecutionConfig,
    cloudProviders?: string[],
    loggingConfig?: LoggingConfig,
    portReusePreference?: boolean,
    useExistingEnvFiles?: boolean
  ): Promise<void> {
    const profiles = this.loadProfiles();

    // Check if profile with same name exists
    const existingIndex = profiles.findIndex((p) => p.name === name);

    const profile: Profile = {
      name,
      description,
      createdAt:
        existingIndex >= 0
          ? profiles[existingIndex].createdAt
          : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      promptSteps: {
        selectedRepos,
        skipCloud,
        skipInstall,
        cloudProviders,
        useExistingEnvFiles: useExistingEnvFiles || false,
        unifiedConfig,
        loggingConfig: loggingConfig || { mode: "terminal" },
        portReusePreference: portReusePreference ?? true, // Default to true for new profiles
      },
    };

    if (existingIndex >= 0) {
      // Update existing profile
      profiles[existingIndex] = profile;
      console.log(chalk.green(`✅ Updated profile: ${name}`));
    } else {
      // Check if we've reached the maximum number of profiles
      if (profiles.length >= (this.config.maxProfiles || 10)) {
        const { shouldDelete } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldDelete",
            message: `You have ${profiles.length} profiles. Would you like to delete an old one to make room?`,
            default: false,
          },
        ]);

        if (shouldDelete) {
          const { profileToDelete } = await inquirer.prompt([
            {
              type: "list",
              name: "profileToDelete",
              message: "Select a profile to delete:",
              choices: profiles.map((p) => ({
                name: `${p.name} (${p.promptSteps.selectedRepos.length} repos)`,
                value: p.name,
              })),
            },
          ]);

          profiles.splice(
            profiles.findIndex((p) => p.name === profileToDelete),
            1
          );
        } else {
          throw new Error(
            `Maximum number of profiles (${this.config.maxProfiles}) reached`
          );
        }
      }

      // Add new profile
      profiles.push(profile);
      console.log(chalk.green(`✅ Saved new profile: ${name}`));
    }

    this.saveProfiles(profiles);
  }

  async promptForSaveProfile(
    selectedRepos: RepoSelection,
    skipCloud: boolean,
    skipInstall: boolean,
    unifiedConfig: UnifiedExecutionConfig,
    cloudProviders?: string[],
    loggingConfig?: LoggingConfig,
    portReusePreference?: boolean,
    useExistingEnvFiles?: boolean
  ): Promise<void> {
    const { shouldSave } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldSave",
        message: "Would you like to save this configuration as a profile?",
        default: true,
      },
    ]);

    if (!shouldSave) {
      return;
    }

    const name = await this.promptForProfileName();
    const description = await this.promptForProfileDescription();

    await this.saveProfile(
      name,
      description,
      selectedRepos,
      skipCloud,
      skipInstall,
      unifiedConfig,
      cloudProviders,
      loggingConfig,
      portReusePreference,
      useExistingEnvFiles
    );
  }

  getProfiles(): Profile[] {
    return this.loadProfiles();
  }

  getProfileByName(name: string): Profile | null {
    const profiles = this.loadProfiles();
    return profiles.find((profile) => profile.name === name) || null;
  }

  deleteProfile(name: string): boolean {
    const profiles = this.loadProfiles();
    const index = profiles.findIndex((p) => p.name === name);

    if (index >= 0) {
      profiles.splice(index, 1);
      this.saveProfiles(profiles);
      return true;
    }

    return false;
  }

  clearAllProfiles(): void {
    this.saveProfiles([]);
  }
}
