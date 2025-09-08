import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { EnvError } from "../errors/EnvError";
import { UnifiedConfig } from "@/config/UnifiedConfig";

const DEFAULTS: Record<
  "postgres" | "timescaledb" | "redis" | "rabbitmq",
  Record<string, string>
> = {
  postgres: {
    POSTGRES_HOST: "postgres",
    POSTGRES_DATABASE: "default_db",
    POSTGRES_USERNAME: "default_user",
    POSTGRES_PASSWORD: "default_password",
    POSTGRES_PORT: "5432",
  },
  timescaledb: {
    POSTGRES_TIMESCALE_HOST: "timescaledb",
    POSTGRES_TIMESCALE_DATABASE: "default_timescale_db",
    POSTGRES_TIMESCALE_USERNAME: "default_user",
    POSTGRES_TIMESCALE_PASSWORD: "default_password",
    POSTGRES_TIMESCALE_PORT: "5432",
  },
  redis: {
    REDIS_CONNECTION_URL: "redis://localhost:6379",
    HIGHLOAD_REDIS_CONNECTION_URL: "redis://localhost:6379",
    REQUEST_REDIS_CONNECTION_URL: "redis://localhost:6379",
    SESSION_REDIS_CONNECTION_URL: "redis://localhost:6379",
    CACHE_REDIS_CONNECTION_URL: "redis://localhost:6379",
    SEARCH_REDIS_CONNECTION_URL: "redis://localhost:6379",
    QUEUES_REDIS_CONNECTION_URL: "redis://localhost:6379",
  },
  rabbitmq: {
    RABBITMQ_PROTOCOL: "amqp",
    RABBITMQ_HOSTNAME: "localhost",
    RABBITMQ_PORT: "5672",
    RABBITMQ_USERNAME: "guest",
    RABBITMQ_PASSWORD: "guest",
  },
};

export class LocalEnvProvider {
  private configPath: string;
  private frontendConfigPath: string;

  constructor() {
    const projectsDir = UnifiedConfig.getInstance().getProjectsDir();
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

      // Apply intelligent defaults to backend config
      backendConfig = this.applyIntelligentDefaults(backendConfig);

      return {
        backend: backendConfig,
        frontend: frontendConfig,
      };
    } catch (error) {
      throw EnvError.fromFileError(error, this.configPath);
    }
  }

  private applyIntelligentDefaults(
    config: Record<string, string>
  ): Record<string, string> {
    const result = { ...config };

    // Iterate over entries to apply intelligent defaults
    for (const [key, raw] of Object.entries(config)) {
      const kLower = key.toLowerCase();
      const value = String(raw ?? "");
      const vLower = value.toLowerCase();

      const isDbValue =
        kLower.includes("postgres") ||
        kLower.includes("timescaledb") ||
        kLower.includes("redis") ||
        kLower.includes("rabbitmq");

      const isInternal =
        kLower.includes("cluster") ||
        vLower.includes("internal") ||
        vLower.includes("local") ||
        !value.trim();

      if (isDbValue && isInternal) {
        if (kLower.includes("postgres") && !kLower.includes("timescale")) {
          Object.assign(result, DEFAULTS.postgres, { pg: "true" });
        }
        if (kLower.includes("timescaledb")) {
          Object.assign(result, DEFAULTS.timescaledb, { ts: "true" });
        }
        if (kLower.includes("redis")) {
          Object.assign(result, DEFAULTS.redis, { rs: "true" });
        }
        if (kLower.includes("rabbitmq")) {
          Object.assign(result, DEFAULTS.rabbitmq, { mq: "true" });
        }
      }
    }

    return result;
  }

  private getBasicDefaults(): Record<string, string> {
    return {
      ...DEFAULTS.postgres,
      ...DEFAULTS.redis,
      ...DEFAULTS.rabbitmq,
      pg: "true",
      rs: "true",
      mq: "true",
    };
  }

  // private async saveConstructedConfig(
  //   config: Record<string, string>
  // ): Promise<void> {
  //   try {
  //     const outputDir = path.dirname(this.outputPath);
  //     if (!fs.existsSync(outputDir)) {
  //       fs.mkdirSync(outputDir, { recursive: true });
  //     }

  //     fs.writeFileSync(this.outputPath, JSON.stringify(config, null, 2));
  //     console.log(`✅ Environment loaded and written to ${this.outputPath}`);
  //   } catch (error) {
  //     console.warn("⚠️ Failed to save constructed config:", error);
  //   }
  // }

  getConfigPath(): string {
    return this.configPath;
  }

  // getOutputPath(): string {
  //   return this.outputPath;
  // }

  setConfigPath(path: string): void {
    this.configPath = path;
  }

  // setOutputPath(path: string): void {
  //   this.outputPath = path;
  // }
}
