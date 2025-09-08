import fs from "fs";
import path from "path";
import { RepoClassification } from "../types";

interface ClassifierConstants {
  backendIndicators: string[];
  backendPackages: string[];
  databasePackages: string[];
}
export class RepoClassifier {
  private static constants: ClassifierConstants | undefined = undefined;

  private static loadConstants(): ClassifierConstants {
    if (this.constants) {
      return this.constants;
    }

    try {
      const constantsPath = path.resolve(
        __dirname,
        "classifier-constants.json"
      );
      const constantsData = fs.readFileSync(constantsPath, "utf-8");
      this.constants = JSON.parse(constantsData);
      return this.constants!;
    } catch (error) {
      console.warn(
        "Failed to load classifier constants, using defaults:",
        error
      );
      // Fallback to default constants
      this.constants = {
        backendIndicators: ["nest-cli.json", "nest.json"],
        backendPackages: [
          "@nestjs/core",
          "@nestjs/common",
          "@nestjs/platform-express",
          "@nestjs/typeorm",
          "@nestjs/mongoose",
          "@nestjs/passport",
          "@nestjs/jwt",
          "@nestjs/config",
          "@nestjs/swagger",
          "@nestjs/terminus",
          "@nestjs/bull",
          "@nestjs/bull-board",
          "@nestjs/schedule",
          "@nestjs/microservices",
          "nestjs",
        ],
        databasePackages: [
          "mysql2",
          "mysql",
          "pg",
          "postgres",
          "postgresql",
          "sqlite3",
          "better-sqlite3",
          "mariadb",
          "oracledb",
          "mssql",
          "tedious",
          "sql.js",
          "typeorm",
          "sequelize",
          "prisma",
          "knex",
          "objection",
          "bookshelf",
          "waterline",
          "doctrine",
          "drizzle-orm",
          "mongoose",
          "mongodb",
          "redis",
          "ioredis",
          "memcached",
          "cassandra-driver",
          "couchbase",
          "dynamodb",
          "firebase-admin",
          "firebase",
          "amqplib",
          "rabbitmq",
          "kafka-node",
          "kafkajs",
          "bull",
          "bull-board",
          "agenda",
          "bee-queue",
          "db-migrate",
          "umzug",
          "migrate-mongo",
          "knex-migrator",
        ],
      };
      return this.constants!;
    }
  }

  async classify(repoPath: string): Promise<RepoClassification> {
    try {
      const hasBackendConfig = this.hasBackendConfig(repoPath);
      const hasBackendPackages = await this.hasBackendPackages(repoPath);
      const hasDatabasePackages = await this.hasDatabasePackages(repoPath);

      // If it has backend config, backend packages, or database packages, it's a backend
      if (hasBackendConfig || hasBackendPackages || hasDatabasePackages) {
        let reason = "";
        if (hasBackendConfig) reason = "Backend config found";
        else if (hasBackendPackages) reason = "Backend packages found";
        else if (hasDatabasePackages) reason = "Database packages found";

        return {
          type: "back",
          confidence: 1.0,
          metadata: {
            hasBackendConfig,
            hasBackendPackages,
            hasDatabasePackages,
            reason,
          },
        };
      }

      // Otherwise, it's a frontend
      return {
        type: "front",
        confidence: 1.0,
        metadata: {
          hasBackendConfig,
          hasBackendPackages,
          hasDatabasePackages,
          reason: "No backend indicators found",
        },
      };
    } catch (error) {
      return {
        type: "unknown",
        confidence: 0,
        metadata: { error: String(error) },
      };
    }
  }

  private hasBackendConfig(repoPath: string): boolean {
    const constants = RepoClassifier.loadConstants();
    return constants.backendIndicators.some((indicator) =>
      this.fileExists(repoPath, indicator)
    );
  }

  private async hasBackendPackages(repoPath: string): Promise<boolean> {
    const packageJsonPath = path.join(repoPath, "package.json");

    if (!this.fileExists(repoPath, "package.json")) {
      return false;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const constants = RepoClassifier.loadConstants();
      return constants.backendPackages.some((pkg) => dependencies[pkg]);
    } catch (error) {
      return false;
    }
  }

  private async hasDatabasePackages(repoPath: string): Promise<boolean> {
    const packageJsonPath = path.join(repoPath, "package.json");

    if (!this.fileExists(repoPath, "package.json")) {
      return false;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const constants = RepoClassifier.loadConstants();
      return constants.databasePackages.some((pkg) => dependencies[pkg]);
    } catch (error) {
      return false;
    }
  }

  private fileExists(repoPath: string, filename: string): boolean {
    try {
      return fs.existsSync(path.join(repoPath, filename));
    } catch {
      return false;
    }
  }

  private directoryExists(repoPath: string, dirname: string): boolean {
    try {
      const fullPath = path.join(repoPath, dirname);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  }

  // Public method to get classification details for debugging
  async getClassificationDetails(
    repoPath: string
  ): Promise<Record<string, any>> {
    const classification = await this.classify(repoPath);
    return {
      classification,
      hasBackendConfig: this.hasBackendConfig(repoPath),
      hasBackendPackages: await this.hasBackendPackages(repoPath),
      hasDatabasePackages: await this.hasDatabasePackages(repoPath),
    };
  }
}
