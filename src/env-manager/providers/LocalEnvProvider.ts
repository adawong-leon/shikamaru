import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { EnvError } from "../errors/EnvError";
import { GlobalConfig } from "@/cli/exports";

export class LocalEnvProvider {
  private configPath: string;
  private frontendConfigPath: string;

  constructor() {
    const projectsDir = GlobalConfig.getInstance().getProjectsDir();
    this.configPath = path.resolve(projectsDir, "global.env");
    this.frontendConfigPath = path.resolve(projectsDir, "global.frontend.env");
  }

  async loadConfiguration(): Promise<{
    backend: Record<string, string>;
    frontend: Record<string, string>;
  }> {
    try {
      let backendConfig: Record<string, string> = {};
      let frontendConfig: Record<string, string> = {};

      // Load from global.env if it exists (backend variables)
      if (fs.existsSync(this.configPath)) {
        const envFile = fs.readFileSync(this.configPath);
        const parsed = dotenv.parse(envFile);
        backendConfig = { ...parsed };
        console.log("✅ Loaded global.env (backend variables)");
      } else {
        console.warn("⚠️ global.env not found at:", this.configPath);
      }

      // Load from global.frontend.env if it exists (frontend variables)
      if (fs.existsSync(this.frontendConfigPath)) {
        const frontendEnvFile = fs.readFileSync(this.frontendConfigPath);
        const frontendParsed = dotenv.parse(frontendEnvFile);
        frontendConfig = { ...frontendParsed };
        console.log("✅ Loaded global.frontend.env (frontend variables)");
      } else {
        console.warn(
          "⚠️ global.frontend.env not found at:",
          this.frontendConfigPath
        );
      }

      return {
        backend: backendConfig || {},
        frontend: frontendConfig || {},
      };
    } catch (error) {
      throw EnvError.fromFileError(error, this.configPath);
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }

  setConfigPath(path: string): void {
    this.configPath = path;
  }
}
