// Profile Command

import chalk from "chalk";
import inquirer from "inquirer";
import { Logger } from "../logger/Logger";
import { ProfileManager } from "@/prompts-manager/ProfileManager";
import type { CliConfig } from "../types";

export class ProfileCommand {
  private logger: Logger;
  private config: CliConfig;
  private profileManager: ProfileManager;

  constructor(logger: Logger, config: CliConfig) {
    this.logger = logger;
    this.config = config;
    this.profileManager = new ProfileManager({
      profilesDir: `${config.projectsDir}/.shikamaru-profiles`,
    });
  }

  async execute(): Promise<void> {
    try {
      this.logger.sectionHeader("Profile Management");
      this.logger.info("🔧 shikamaru Profile Manager");

      const action = await this.promptForAction();

      switch (action) {
        case "list":
          await this.listProfiles();
          break;
        case "show":
          await this.showProfile();
          break;
        case "delete":
          await this.deleteProfile();
          break;
        case "clear":
          await this.clearAllProfiles();
          break;
        default:
          this.logger.info("Operation cancelled.");
          break;
      }
    } catch (error) {
      this.logger.error(
        `Profile command failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exit(1);
    }
  }

  private async promptForAction(): Promise<string> {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "📋 List all profiles", value: "list" },
          { name: "👁️  Show profile details", value: "show" },
          { name: "🗑️  Delete a profile", value: "delete" },
          { name: "🧹 Clear all profiles", value: "clear" },
          new inquirer.Separator(),
          { name: "❌ Cancel", value: "cancel" },
        ],
      },
    ]);

    return action;
  }

  private async listProfiles(): Promise<void> {
    const profiles = this.profileManager.getProfiles();

    if (profiles.length === 0) {
      this.logger.info("📭 No profiles found.");
      this.logger.info(
        "💡 Profiles are created when you save configurations during the start command."
      );
      return;
    }

    this.logger.info(`📋 Found ${profiles.length} profile(s):`);
    console.log();

    const profileData = profiles.map((profile) => ({
      Name: profile.name,
      Description: profile.description || "No description",
      Repositories: profile.promptSteps.selectedRepos.length.toString(),
      "Global Mode": profile.promptSteps.unifiedConfig.globalMode || "N/A",
      "Skip Cloud": profile.promptSteps.skipCloud ? "Yes" : "No",
      Created: new Date(profile.createdAt).toLocaleDateString(),
    }));

    this.logger.table(profileData);
  }

  private async showProfile(): Promise<void> {
    const profiles = this.profileManager.getProfiles();

    if (profiles.length === 0) {
      this.logger.info("📭 No profiles found.");
      return;
    }

    const { selectedProfile } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedProfile",
        message: "Select a profile to view:",
        choices: [
          ...profiles.map((profile) => ({
            name: `${profile.name}${
              profile.description ? ` - ${profile.description}` : ""
            } (${profile.promptSteps.selectedRepos.length} repos)`,
            value: profile.name,
          })),
          new inquirer.Separator(),
          { name: "❌ Cancel", value: "cancel" },
        ],
      },
    ]);

    if (selectedProfile === "cancel") {
      return;
    }

    const profile = this.profileManager.getProfileByName(selectedProfile);
    if (!profile) {
      this.logger.error(`Profile "${selectedProfile}" not found.`);
      return;
    }

    this.logger.sectionHeader(`Profile: ${profile.name}`);

    if (profile.description) {
      console.log(chalk.gray(`Description: ${profile.description}`));
    }

    console.log(
      chalk.gray(`Created: ${new Date(profile.createdAt).toLocaleString()}`)
    );
    console.log(
      chalk.gray(`Updated: ${new Date(profile.updatedAt).toLocaleString()}`)
    );
    console.log();

    // Display selected repositories
    this.logger.info(
      `📁 Selected Repositories (${profile.promptSteps.selectedRepos.length}):`
    );
    profile.promptSteps.selectedRepos.forEach((repo, index) => {
      console.log(chalk.blue(`  ${index + 1}. ${repo}`));
    });
    console.log();

    // Display configuration
    this.logger.info("⚙️ Configuration:");
    console.log(
      chalk.blue(
        `  Global Mode: ${
          profile.promptSteps.unifiedConfig.globalMode || "N/A"
        }`
      )
    );
    console.log(
      chalk.blue(
        `  Skip Cloud: ${profile.promptSteps.skipCloud ? "Yes" : "No"}`
      )
    );
    console.log(
      chalk.blue(
        `  Skip Install: ${profile.promptSteps.skipInstall ? "Yes" : "No"}`
      )
    );

    if (
      profile.promptSteps.cloudProviders &&
      profile.promptSteps.cloudProviders.length > 0
    ) {
      console.log(
        chalk.blue(
          `  Cloud Providers: ${profile.promptSteps.cloudProviders.join(", ")}`
        )
      );
    }

    console.log(
      chalk.blue(
        `  Logging Mode: ${
          profile.promptSteps.loggingConfig?.mode || "terminal"
        }`
      )
    );
    console.log(
      chalk.blue(
        `  Port Reuse: ${
          profile.promptSteps.portReusePreference ? "Yes" : "No"
        }`
      )
    );

    // Display repo configurations if they exist
    if (
      profile.promptSteps.unifiedConfig.repoConfigs &&
      profile.promptSteps.unifiedConfig.repoConfigs.length > 0
    ) {
      console.log();
      this.logger.info("🔧 Repository Configurations:");
      profile.promptSteps.unifiedConfig.repoConfigs.forEach(
        (repoConfig, index) => {
          console.log(chalk.yellow(`  ${index + 1}. ${repoConfig.repo}:`));
          console.log(chalk.gray(`     Mode: ${repoConfig.mode}`));
          if (repoConfig.installCommand) {
            console.log(
              chalk.gray(`     Install: ${repoConfig.installCommand}`)
            );
          }
          if (repoConfig.startupCommand) {
            console.log(
              chalk.gray(`     Startup: ${repoConfig.startupCommand}`)
            );
          }
        }
      );
    }
  }

  private async deleteProfile(): Promise<void> {
    const profiles = this.profileManager.getProfiles();

    if (profiles.length === 0) {
      this.logger.info("📭 No profiles found.");
      return;
    }

    const { selectedProfile } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedProfile",
        message: "Select a profile to delete:",
        choices: [
          ...profiles.map((profile) => ({
            name: `${profile.name}${
              profile.description ? ` - ${profile.description}` : ""
            } (${profile.promptSteps.selectedRepos.length} repos)`,
            value: profile.name,
          })),
          new inquirer.Separator(),
          { name: "❌ Cancel", value: "cancel" },
        ],
      },
    ]);

    if (selectedProfile === "cancel") {
      return;
    }

    const { confirmDelete } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmDelete",
        message: `Are you sure you want to delete profile "${selectedProfile}"?`,
        default: false,
      },
    ]);

    if (!confirmDelete) {
      this.logger.info("Deletion cancelled.");
      return;
    }

    const success = this.profileManager.deleteProfile(selectedProfile);
    if (success) {
      this.logger.success(
        `✅ Profile "${selectedProfile}" deleted successfully.`
      );
    } else {
      this.logger.error(`❌ Failed to delete profile "${selectedProfile}".`);
    }
  }

  private async clearAllProfiles(): Promise<void> {
    const profiles = this.profileManager.getProfiles();

    if (profiles.length === 0) {
      this.logger.info("📭 No profiles to clear.");
      return;
    }

    const { confirmClear } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmClear",
        message: `Are you sure you want to delete ALL ${profiles.length} profiles? This action cannot be undone.`,
        default: false,
      },
    ]);

    if (!confirmClear) {
      this.logger.info("Clear operation cancelled.");
      return;
    }

    const { doubleConfirm } = await inquirer.prompt([
      {
        type: "input",
        name: "doubleConfirm",
        message: `Type "DELETE ALL" to confirm deletion of all profiles:`,
        validate: (input: string) => {
          return input === "DELETE ALL"
            ? true
            : "Please type exactly 'DELETE ALL' to confirm.";
        },
      },
    ]);

    if (doubleConfirm === "DELETE ALL") {
      this.profileManager.clearAllProfiles();
      this.logger.success(
        `✅ All ${profiles.length} profiles have been deleted.`
      );
    } else {
      this.logger.info("Clear operation cancelled.");
    }
  }
}
