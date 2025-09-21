import fs from "fs";
import path from "path";
import { RepoClassification } from "../types";

interface ClassifierConstants {
  frontendIndicators: string[];
  frontendPackages: string[];
  backendIndicators: string[];
  backendPackages: string[];
  databasePackages: string[];
}
export class RepoClassifier {
  private static instance: RepoClassifier | null = null;
  private static constants: ClassifierConstants | undefined = undefined;
  private classificationCache: Map<string, RepoClassification> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  private constructor() {}

  static getInstance(): RepoClassifier {
    if (!RepoClassifier.instance) {
      RepoClassifier.instance = new RepoClassifier();
    }
    return RepoClassifier.instance;
  }

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
      const parsed = JSON.parse(constantsData);
      // Ensure required keys exist even if the JSON file predates these fields
      this.constants = {
        frontendIndicators: parsed.frontendIndicators ?? [
          "vite.config.ts",
          "vite.config.js",
          "vite.config.mts",
          "vite.config.mjs",
          "next.config.js",
          "next.config.ts",
          "nuxt.config.js",
          "nuxt.config.ts",
          "angular.json",
          "webpack.config.js",
          "webpack.config.ts",
          "svelte.config.js",
          "svelte.config.ts",
          "astro.config.mjs",
          "astro.config.ts",
          "remix.config.js",
          "remix.config.ts",
        ],
        frontendPackages: parsed.frontendPackages ?? [
          "react",
          "react-dom",
          "next",
          "vue",
          "nuxt",
          "@angular/core",
          "@angular/cli",
          "svelte",
          "@sveltejs/kit",
          "vite",
          "webpack",
          "parcel",
          "rollup",
          "astro",
          "remix",
          "solid-js",
          "preact",
        ],
        backendIndicators: parsed.backendIndicators ?? [
          "nest-cli.json",
          "nest.json",
        ],
        backendPackages: parsed.backendPackages ?? [
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
        databasePackages: parsed.databasePackages ?? [
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
    } catch (error) {
      console.warn(
        "Failed to load classifier constants, using defaults:",
        error
      );
      // Fallback to default constants
      this.constants = {
        frontendIndicators: [
          "vite.config.ts",
          "vite.config.js",
          "vite.config.mts",
          "vite.config.mjs",
          "next.config.js",
          "next.config.ts",
          "nuxt.config.js",
          "nuxt.config.ts",
          "angular.json",
          "webpack.config.js",
          "webpack.config.ts",
          "svelte.config.js",
          "svelte.config.ts",
          "astro.config.mjs",
          "astro.config.ts",
          "remix.config.js",
          "remix.config.ts",
        ],
        frontendPackages: [
          "react",
          "react-dom",
          "next",
          "vue",
          "nuxt",
          "@angular/core",
          "@angular/cli",
          "svelte",
          "@sveltejs/kit",
          "vite",
          "webpack",
          "parcel",
          "rollup",
          "astro",
          "remix",
          "solid-js",
          "preact",
        ],
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
      const cacheKey = path.resolve(repoPath);
      const cached = this.classificationCache.get(cacheKey);
      if (cached) {
        this.cacheHits++;
        return cached;
      }

      const hasFrontendConfig = this.hasFrontendConfig(repoPath);
      const hasFrontendPackages = await this.hasFrontendPackages(repoPath);

      // Front has priority if any frontend indicators are found
      if (hasFrontendConfig || hasFrontendPackages) {
        const result: RepoClassification = {
          type: "front",
          confidence: 1.0,
          metadata: {
            hasFrontendConfig,
            hasFrontendPackages,
            reason: hasFrontendConfig
              ? "Frontend config found"
              : "Frontend packages found",
          } as any,
        } as RepoClassification;
        this.classificationCache.set(cacheKey, result);
        this.cacheMisses++;
        return result;
      } else {
        const result: RepoClassification = {
          type: "back",
          confidence: 1.0,
          metadata: {
            hasFrontendConfig,
            hasFrontendPackages,
            reason: "No frontend indicators found",
          } as any,
        } as RepoClassification;
        this.classificationCache.set(cacheKey, result);
        this.cacheMisses++;
        return result;
      }
    } catch (error) {
      return {
        type: "unknown",
        confidence: 0,
        metadata: { error: String(error) },
      };
    }
  }

  private hasFrontendConfig(repoPath: string): boolean {
    const constants = RepoClassifier.loadConstants();
    return constants.frontendIndicators.some((indicator) =>
      this.fileExists(repoPath, indicator)
    );
  }

  private async hasFrontendPackages(repoPath: string): Promise<boolean> {
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
      return constants.frontendPackages.some((pkg) => dependencies[pkg]);
    } catch (error) {
      return false;
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

  clearCache(): void {
    this.classificationCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.classificationCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
    };
  }
}
