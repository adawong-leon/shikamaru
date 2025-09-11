import { EnvConfigProvider } from "./providers/EnvConfigProvider";
import { LocalEnvProvider } from "./providers/LocalEnvProvider";
import { EnvFileWriter } from "./writers/EnvFileWriter";
import { EnvVariableResolver } from "./resolvers/EnvVariableResolver";
import { RepoClassifier } from "./classifiers/RepoClassifier";
import { CloudProviderManager } from "./providers/CloudProviderManager";
import type {
  EnvState,
  EnvProvider,
  EnvClassifier,
  RepoClassification,
  Tier,
  CloudProvider,
} from "./types";
import { EnvError } from "./errors/EnvError";
import path from "path";

import type { UnifiedExecutionConfig } from "../prompts-manager/types";

export interface EnvManagerConfig {
  projectsDir: string;
  ports: Record<string, any>;
  maxConcurrency?: number;
  enableValidation?: boolean;
  enableMetrics?: boolean;
  customProviders?: EnvProvider[];
  customClassifier?: EnvClassifier;
  skipCloud?: boolean;
  cloudProviders?: CloudProvider[];
  unifiedConfig?: UnifiedExecutionConfig; // User's choice for repo execution modes
}

export interface EnvManagerMetrics {
  startTime: number;
  endTime?: number;
  reposProcessed: number;
  filesGenerated: number;
  errors: number;
  warnings: number;
  cloudCalls: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Coordinates environment resolution for selected repositories.
 * Loads variables from local/global files and cloud providers, decides
 * internal vs external dependencies, and generates finalized .env files.
 */
export class EnvManager {
  private static instance: EnvManager | null = null;

  private state: EnvState;
  private config: EnvManagerConfig;
  private metrics: EnvManagerMetrics;
  private configProvider: EnvConfigProvider | null = null;
  private localProvider: LocalEnvProvider | null = null;
  private fileWriter: EnvFileWriter | null = null;
  private variableResolver: EnvVariableResolver | null = null;
  private repoClassifier: RepoClassifier | null = null;
  private cloudProviderManager: CloudProviderManager;
  private customProviders: EnvProvider[] = [];
  private _isInitialized = false;

  private constructor(config: EnvManagerConfig) {
    this.config = {
      maxConcurrency: 5,
      enableValidation: true,
      enableMetrics: true,
      ...config,
    };

    this.state = {
      tier: null,
      repos: [],
      variableGroups: { front: {}, back: {} },
      errors: [],
      warnings: [],
      resolvedConfig: { front: {}, back: {} },
      internalServices: new Set(),
      localFrontend: {},
      localBackend: {},
    };

    this.metrics = {
      startTime: Date.now(),
      reposProcessed: 0,
      filesGenerated: 0,
      errors: 0,
      warnings: 0,
      cloudCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    // Cloud provider manager manages built-in and custom providers
    this.cloudProviderManager = new CloudProviderManager();

    if (config.customProviders) {
      this.customProviders = config.customProviders;
    }

    // Configure provider availability based on flags
    if (config.skipCloud) {
      const availableProviders =
        this.cloudProviderManager.getAvailableProviders();
      for (const provider of availableProviders) {
        provider.config.enabled = false;
      }
    } else if (config.cloudProviders) {
      const allProviders = this.cloudProviderManager.getAvailableProviders();
      for (const provider of allProviders) {
        provider.config.enabled = config.cloudProviders.includes(provider.type);
      }
    }
  }

  /**
   * Get (or initialize) the singleton instance.
   * The first call must provide a configuration object.
   */
  static getInstance(config?: EnvManagerConfig): EnvManager {
    if (!EnvManager.instance) {
      if (!config) {
        throw new Error("Config is required for first initialization");
      }
      EnvManager.instance = new EnvManager(config);
    }
    return EnvManager.instance;
  }

  /** Reset the singleton for test scenarios. */
  static resetInstance(): void {
    EnvManager.instance = null;
  }

  private getConfigProvider(): EnvConfigProvider {
    if (!this.configProvider) {
      this.configProvider = new EnvConfigProvider();
    }
    return this.configProvider;
  }

  private getLocalProvider(): LocalEnvProvider {
    if (!this.localProvider) {
      this.localProvider = new LocalEnvProvider();
    }
    return this.localProvider;
  }

  private getFileWriter(): EnvFileWriter {
    if (!this.fileWriter) {
      this.fileWriter = new EnvFileWriter();
    }
    return this.fileWriter;
  }

  private getVariableResolver(): EnvVariableResolver {
    if (!this.variableResolver) {
      this.variableResolver = new EnvVariableResolver(this.config.ports);
    }
    return this.variableResolver;
  }

  private getRepoClassifier(): RepoClassifier {
    if (!this.repoClassifier) {
      this.repoClassifier = RepoClassifier.getInstance();
    }
    return this.repoClassifier;
  }

  /** Retrieve a credential/token for a given cloud provider. */
  getCloudCredentials(providerType: CloudProvider): string | null {
    const provider = this.cloudProviderManager.getProviderByType(providerType);
    return provider?.getCredentials() || null;
  }

  /** Persist/forward cloud credentials to a provider implementation. */
  setCloudCredentials(providerType: CloudProvider, credentials: string): void {
    const provider = this.cloudProviderManager.getProviderByType(providerType);
    if (provider) {
      provider.authenticate(credentials);
    }
  }

  // Azure-specific helpers (back-compat)
  getAzurePat(): string | null {
    return this.cloudProviderManager.getAzurePat();
  }

  setAzurePat(pat: string): void {
    this.cloudProviderManager.setAzurePat(pat);
  }

  /**
   * Initialize classification, local/cloud configuration, and tier.
   * Must be called before generating files.
   */
  async initialize(repos: string[]): Promise<void> {
    if (this._isInitialized) {
      throw new EnvError(
        "EnvManager already initialized",
        null,
        "ALREADY_INITIALIZED"
      );
    }

    try {
      this.validateInput(repos);
      this.state.repos = repos;

      await this.initializeTier();
      await this.classifyRepositoriesWithConcurrency();
      await this.loadConfigurationSources();

      this._isInitialized = true;
    } catch (error) {
      this.recordError("Failed to initialize environment manager", error);
      throw error;
    }
  }

  private validateInput(repos: string[]): void {
    if (!Array.isArray(repos) || repos.length === 0) {
      throw new EnvError(
        "Repos must be a non-empty array",
        null,
        "INVALID_INPUT"
      );
    }

    if (
      !this.config.projectsDir ||
      typeof this.config.projectsDir !== "string"
    ) {
      throw new EnvError(
        "Valid projectsDir is required",
        null,
        "INVALID_CONFIG"
      );
    }

    const invalidRepos = repos.filter(
      (repo) => !repo || typeof repo !== "string"
    );
    if (invalidRepos.length > 0) {
      throw new EnvError(
        `Invalid repo names: ${invalidRepos.join(", ")}`,
        null,
        "INVALID_REPO_NAMES"
      );
    }
  }

  private async initializeTier(): Promise<void> {
    try {
      if (this.config.skipCloud) {
        this.state.tier = "develop";
        return;
      }

      this.state.tier = await this.getConfigProvider().promptTier();
      this.validateTier(this.state.tier);
    } catch (error) {
      throw new EnvError("Failed to initialize tier selection", error);
    }
  }

  private validateTier(tier: Tier | null): void {
    if (!tier || !["develop", "qa", "prod"].includes(tier)) {
      throw new EnvError(`Invalid tier: ${tier}`, null, "INVALID_TIER");
    }
  }

  private async classifyRepositoriesWithConcurrency(): Promise<void> {
    const concurrency = this.config.maxConcurrency || 5;
    const chunks = this.chunkArray(this.state.repos, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map((repo) => this.classifyRepository(repo));
      await Promise.allSettled(promises);
    }
  }

  private async classifyRepository(repo: string): Promise<void> {
    try {
      const repoPath = `${this.config.projectsDir}/${repo}`;
      const classification = await this.getRepoClassifier().classify(repoPath);

      if (this.config.unifiedConfig) {
        const repoConfig = this.config.unifiedConfig.repoConfigs.find(
          (rc) => rc.repo === repo
        );

        if (repoConfig) {
          classification.metadata = {
            ...classification.metadata,
            dockerized: repoConfig.mode === "docker",
            containerized: repoConfig.mode === "docker",
            docker: repoConfig.mode === "docker",
            container: repoConfig.mode === "docker",
            userChoice: repoConfig.mode,
          };
        } else if (this.config.unifiedConfig.globalMode === "docker") {
          classification.metadata = {
            ...classification.metadata,
            dockerized: true,
            containerized: true,
            docker: true,
            container: true,
            userChoice: "docker",
          };
        }
      }

      this.state.repoClassifications = this.state.repoClassifications || {};
      this.state.repoClassifications[repo] = classification;

      this.metrics.reposProcessed++;
    } catch (error) {
      this.recordError(`Failed to classify repository ${repo}`, error);
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async loadConfigurationSources(): Promise<void> {
    try {
      await this.loadLocalConfiguration();
      await this.loadCustomProviders();
    } catch (error) {
      throw new EnvError("Failed to load configuration sources", error);
    }
  }

  private async loadLocalConfiguration(): Promise<void> {
    try {
      const config = await this.getLocalProvider().loadConfiguration();
      const backendConfig = config.backend || {};
      const frontendConfig = config.frontend || {};

      this.state.localConfig = backendConfig;
      this.state.localBackend = backendConfig;

      this.state.variableGroups.front = {
        ...this.state.variableGroups.front,
        ...frontendConfig,
      };
      this.state.localFrontend = frontendConfig;

      if (this.config.skipCloud && Object.keys(frontendConfig).length > 0) {
        console.log(
          `✅ Loaded ${
            Object.keys(frontendConfig).length
          } frontend variables from global.frontend.env`
        );
      }

      if (Object.keys(backendConfig).length > 0) {
        console.log(
          `✅ Loaded ${
            Object.keys(backendConfig).length
          } backend variables from global.env`
        );
      }

      const azurePat = this.state.localConfig?.AZURE_PERSONAL_ACCESS_TOKEN;
      if (azurePat) {
        this.setAzurePat(azurePat);
        console.log("✅ Azure PAT loaded from global.env");
      }
    } catch (error) {
      throw new EnvError("Failed to load local configuration", error);
    }
  }

  private async loadCustomProviders(): Promise<void> {
    if (!this.config.skipCloud && this.state.tier) {
      await this.loadCloudVariables();
    }

    for (const provider of this.customProviders) {
      try {
        if (provider.isAvailable()) {
          console.log(`✅ Loaded custom provider: ${provider.name}`);
        }
      } catch (error) {
        this.recordWarning(
          `Failed to load custom provider ${provider.name}: ${error}`
        );
      }
    }
  }

  private async loadCloudVariables(): Promise<void> {
    try {
      const azureProvider = this.cloudProviderManager.getAzureProvider();
      if (azureProvider && this.state.tier) {
        azureProvider.setTier(this.state.tier);
      }

      const frontGroup = `front-${this.state.tier!.toUpperCase()}`;
      const backGroup = `back-${this.state.tier!.toUpperCase()}`;

      this.metrics.cloudCalls += 2;

      const [frontVars, backVars] = await Promise.allSettled([
        this.cloudProviderManager.getVariablesFromAllProviders({
          repo: "frontend",
          classification: { type: "front", confidence: 1 },
          tier: this.state.tier!,
          ports: {},
          cloudVars: {},
          localConfig: this.state.localConfig || {},
        }),
        this.cloudProviderManager.getVariablesFromAllProviders({
          repo: "backend",
          classification: { type: "back", confidence: 1 },
          tier: this.state.tier!,
          ports: {},
          cloudVars: {},
          localConfig: this.state.localConfig || {},
        }),
      ]);

      this.state.variableGroups = {
        front: frontVars.status === "fulfilled" ? frontVars.value : {},
        back: backVars.status === "fulfilled" ? backVars.value : {},
      };

      if (frontVars.status === "rejected") {
        this.recordWarning(
          `Failed to load cloud variable group "${frontGroup}": ${frontVars.reason}`
        );
      }
      if (backVars.status === "rejected") {
        this.recordWarning(
          `Failed to load cloud variable group "${backGroup}": ${backVars.reason}`
        );
      }
    } catch (error) {
      throw new EnvError("Failed to load cloud variables", error);
    }
  }

  /** Generate .env files for all initialized repositories. */
  async generateEnvFiles(): Promise<void> {
    if (!this._isInitialized) {
      throw new EnvError(
        "EnvManager must be initialized before generating files",
        null,
        "NOT_INITIALIZED"
      );
    }

    try {
      const concurrency = this.config.maxConcurrency || 5;
      const chunks = this.chunkArray(this.state.repos, concurrency);

      for (const chunk of chunks) {
        const promises = chunk.map((repo) => this.generateEnvFile(repo));
        await Promise.allSettled(promises);
      }

      this.metrics.endTime = Date.now();
      this.reportResults();
    } catch (error) {
      throw new EnvError("Failed to generate environment files", error);
    }
  }

  private async generateEnvFile(repo: string): Promise<void> {
    try {
      const repoPath = path.resolve(this.config.projectsDir, repo);
      const examplePath = path.resolve(repoPath, ".env.example");
      const envPath = path.resolve(repoPath, ".env");
      const envPathBackup = path.resolve(repoPath, ".backup.env");

      if (!this.getFileWriter().fileExists(examplePath)) {
        this.recordWarning(`No .env.example found for ${repo}`);
        return;
      }

      const exampleContent = await this.getFileWriter().readFile(examplePath);

      const classification = this.state.repoClassifications?.[repo];
      if (!classification) {
        this.recordError(`No classification found for repo ${repo}`, null);
        return;
      }

      const resolvedContent = await this.getVariableResolver().resolveVariables(
        exampleContent,
        repo,
        classification,
        this.state
      );

      if (this.config.enableValidation) {
        this.validateResolvedContent(resolvedContent, repo);
      }

      // Backup current .env if it exists before writing a new one
      try {
        if (this.getFileWriter().fileExists(envPath)) {
          const existing = await this.getFileWriter().readFile(envPath);
          const backupPath = `${envPathBackup}`;
          await this.getFileWriter().writeFile(backupPath, existing);
          console.log(`🗂️  Backed up existing .env to ${backupPath}`);
        }
      } catch {
        // Non-fatal: proceed with write even if backup fails
      }

      await this.getFileWriter().writeFileAtomic(envPath, resolvedContent);

      this.metrics.filesGenerated++;
      console.log(`✅ Generated ${envPath} (${classification.type})`);
    } catch (error) {
      this.recordError(`Failed to generate .env for ${repo}`, error);
    }
  }

  private validateResolvedContent(content: string, repo: string): void {
    const lines = content.split("\n");
    const variables = lines.filter(
      (line) => line.includes("=") && !line.startsWith("#")
    );

    if (variables.length === 0) {
      this.recordWarning(`No variables resolved for ${repo}`);
    }

    const emptyVars = variables.filter((line) => {
      const [key, value] = line.split("=", 2);
      return !value || value.trim() === "";
    });

    if (emptyVars.length > 0) {
      this.recordWarning(
        `Empty variables found in ${repo}: ${emptyVars.length} variables`
      );
    }
  }

  private recordError(message: string, error?: any): void {
    const errorMessage = error ? `${message}: ${error}` : message;
    this.state.errors.push(errorMessage);
    this.metrics.errors++;
  }

  private recordWarning(message: string): void {
    this.state.warnings.push(message);
    this.metrics.warnings++;
  }

  private reportResults(): void {
    if (this.state.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      this.state.warnings.forEach((warning) => console.log(`  ${warning}`));
    }

    if (this.state.errors.length > 0) {
      console.log("\n❌ Errors:");
      this.state.errors.forEach((error) => console.log(`  ${error}`));
    }

    if (this.config.enableMetrics) {
      this.reportMetrics();
    }

    if (this.state.errors.length === 0) {
      console.log("\n🎉 Environment files generated successfully!");
    }
  }

  private reportMetrics(): void {
    const duration = this.metrics.endTime
      ? this.metrics.endTime - this.metrics.startTime
      : 0;

    console.log("\n📊 Metrics:");
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Repos processed: ${this.metrics.reposProcessed}`);
    console.log(`  Files generated: ${this.metrics.filesGenerated}`);
    console.log(`  Errors: ${this.metrics.errors}`);
    console.log(`  Warnings: ${this.metrics.warnings}`);
    console.log(`  Cloud API calls: ${this.metrics.cloudCalls}`);
    console.log(`  Cache hits: ${this.metrics.cacheHits}`);
    console.log(`  Cache misses: ${this.metrics.cacheMisses}`);
  }

  /** Expose a copy of the internal state (read-only snapshot). */
  getState(): EnvState {
    return { ...this.state };
  }

  /** Current metrics snapshot. */
  getMetrics(): EnvManagerMetrics {
    return { ...this.metrics };
  }

  /** Accumulated error messages. */
  getErrors(): string[] {
    return [...this.state.errors];
  }

  /** Accumulated warnings. */
  getWarnings(): string[] {
    return [...this.state.warnings];
  }

  /** Whether the last run produced errors. */
  hasErrors(): boolean {
    return this.state.errors.length > 0;
  }

  /** Whether initialize() has been called successfully. */
  isInitialized(): boolean {
    return this._isInitialized;
  }

  /** Register a custom variable provider. */
  addVariableProvider(provider: EnvProvider): void {
    this.customProviders.push(provider);
  }

  /** Reset state and metrics for reuse. */
  reset(): void {
    this.state = {
      tier: null,
      repos: [],
      variableGroups: { front: {}, back: {} },
      errors: [],
      warnings: [],
      internalServices: new Set(),
    };
    this.metrics = {
      startTime: Date.now(),
      reposProcessed: 0,
      filesGenerated: 0,
      errors: 0,
      warnings: 0,
      cloudCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    this._isInitialized = false;
  }

  /** Cloud-provider cache stats. */
  getCacheStats(): Record<string, { hits: number; misses: number }> {
    return this.cloudProviderManager.getCacheStats();
  }

  /** Clear all cloud-provider caches. */
  clearCache(): void {
    this.cloudProviderManager.clearAllCaches();
  }
}
