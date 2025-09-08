import chalk from "chalk";
import fs from "fs";
import path from "path";
import { Logger } from "../logger/Logger";
import type { CliConfig } from "../types";

export class VersionCommand {
  private logger: Logger;
  private config: CliConfig;

  constructor(logger: Logger, config: CliConfig) {
    this.logger = logger;
    this.config = config;
  }

  static execute(): void {
    const version = VersionCommand.getVersion();
    console.log(chalk.blue(`🚀 shikamaru v${version}`));
    console.log(
      chalk.gray(
        "A powerful CLI tool for managing multi-repository development environments"
      )
    );
    console.log(chalk.gray("https://github.com/your-username/shikamaru"));
  }

  private static getVersion(): string {
    try {
      // dist/cli/commands -> ../../.. -> project root
      const pkgPath = path.resolve(__dirname, "../../../package.json");
      const raw = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw);
      return pkg.version || process.env.npm_package_version || "unknown";
    } catch {
      return process.env.npm_package_version || "unknown";
    }
  }
}
