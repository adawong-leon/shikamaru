import { LogEntry } from "../types";

export interface LogIndex {
  byService: Map<string, Set<number>>;
  byLevel: Map<string, Set<number>>;
  byTimestamp: Map<number, Set<number>>;
  byMessage: Map<string, Set<number>>;
  fullTextIndex: Map<string, Set<number>>;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  fuzzy?: boolean;
  maxResults?: number;
}

export interface FilterOptions {
  services?: string[];
  levels?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
  searchOptions?: SearchOptions;
}

export class LogIndexer {
  private index: LogIndex;
  private logs: LogEntry[] = [];
  private isIndexing = false;
  private indexVersion = 0;

  constructor() {
    this.index = {
      byService: new Map(),
      byLevel: new Map(),
      byTimestamp: new Map(),
      byMessage: new Map(),
      fullTextIndex: new Map(),
    };
  }

  /**
   * Add logs to the index
   */
  addLogs(logs: LogEntry[]): void {
    this.logs = [...this.logs, ...logs];
    this.rebuildIndex();
  }

  /**
   * Replace all logs and rebuild index
   */
  setLogs(logs: LogEntry[]): void {
    this.logs = logs;
    this.rebuildIndex();
  }

  /**
   * Clear all logs and index
   */
  clear(): void {
    this.logs = [];
    this.index = {
      byService: new Map(),
      byLevel: new Map(),
      byTimestamp: new Map(),
      byMessage: new Map(),
      fullTextIndex: new Map(),
    };
    this.indexVersion++;
  }

  /**
   * Rebuild the entire index
   */
  private rebuildIndex(): void {
    if (this.isIndexing) return;

    this.isIndexing = true;
    this.indexVersion++;

    // Clear existing index
    this.index.byService.clear();
    this.index.byLevel.clear();
    this.index.byTimestamp.clear();
    this.index.byMessage.clear();
    this.index.fullTextIndex.clear();

    // Build index
    this.logs.forEach((log, index) => {
      this.indexLog(log, index);
    });

    this.isIndexing = false;
  }

  /**
   * Index a single log entry
   */
  private indexLog(log: LogEntry, index: number): void {
    // Index by service
    if (!this.index.byService.has(log.serviceName)) {
      this.index.byService.set(log.serviceName, new Set());
    }
    this.index.byService.get(log.serviceName)!.add(index);

    // Index by level
    if (!this.index.byLevel.has(log.level)) {
      this.index.byLevel.set(log.level, new Set());
    }
    this.index.byLevel.get(log.level)!.add(index);

    // Index by timestamp (rounded to minute for efficiency)
    const timestamp = new Date(log.timestamp).getTime();
    const minuteTimestamp = Math.floor(timestamp / 60000) * 60000;
    if (!this.index.byTimestamp.has(minuteTimestamp)) {
      this.index.byTimestamp.set(minuteTimestamp, new Set());
    }
    this.index.byTimestamp.get(minuteTimestamp)!.add(index);

    // Index by message content
    const messageWords = this.tokenize(log.message);
    messageWords.forEach((word) => {
      if (!this.index.byMessage.has(word)) {
        this.index.byMessage.set(word, new Set());
      }
      this.index.byMessage.get(word)!.add(index);
    });

    // Build full-text index
    const fullText =
      `${log.serviceName} ${log.level} ${log.message}`.toLowerCase();
    const fullTextWords = this.tokenize(fullText);
    fullTextWords.forEach((word) => {
      if (!this.index.fullTextIndex.has(word)) {
        this.index.fullTextIndex.set(word, new Set());
      }
      this.index.fullTextIndex.get(word)!.add(index);
    });
  }

  /**
   * Tokenize text for indexing
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  /**
   * Search logs with advanced options
   */
  search(query: string, options: SearchOptions = {}): LogEntry[] {
    if (!query.trim()) return this.logs;

    const {
      caseSensitive = false,
      wholeWord = false,
      regex = false,
      fuzzy = false,
      maxResults = 1000,
    } = options;

    let results: Set<number> = new Set();

    if (regex) {
      results = this.searchRegex(query, caseSensitive);
    } else if (fuzzy) {
      results = this.searchFuzzy(query);
    } else {
      results = this.searchExact(query, caseSensitive, wholeWord);
    }

    const resultIndices = Array.from(results).slice(0, maxResults);
    return resultIndices.map((index) => this.logs[index]).filter(Boolean);
  }

  /**
   * Exact search
   */
  private searchExact(
    query: string,
    caseSensitive: boolean,
    wholeWord: boolean
  ): Set<number> {
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const results: Set<number> = new Set();

    this.logs.forEach((log, index) => {
      const searchText = caseSensitive
        ? `${log.serviceName} ${log.level} ${log.message}`
        : `${log.serviceName} ${log.level} ${log.message}`.toLowerCase();

      if (wholeWord) {
        const words = searchText.split(/\s+/);
        if (words.includes(searchQuery)) {
          results.add(index);
        }
      } else if (searchText.includes(searchQuery)) {
        results.add(index);
      }
    });

    return results;
  }

  /**
   * Regex search
   */
  private searchRegex(query: string, caseSensitive: boolean): Set<number> {
    const results: Set<number> = new Set();
    const flags = caseSensitive ? "g" : "gi";

    try {
      const regex = new RegExp(query, flags);

      this.logs.forEach((log, index) => {
        const searchText = `${log.serviceName} ${log.level} ${log.message}`;
        if (regex.test(searchText)) {
          results.add(index);
        }
      });
    } catch (error) {
      console.warn("Invalid regex pattern:", query);
    }

    return results;
  }

  /**
   * Fuzzy search (simple implementation)
   */
  private searchFuzzy(query: string): Set<number> {
    const results: Set<number> = new Set();
    const queryLower = query.toLowerCase();

    this.logs.forEach((log, index) => {
      const searchText =
        `${log.serviceName} ${log.level} ${log.message}`.toLowerCase();

      // Simple fuzzy matching - check if all characters in query appear in order
      let queryIndex = 0;
      for (
        let i = 0;
        i < searchText.length && queryIndex < queryLower.length;
        i++
      ) {
        if (searchText[i] === queryLower[queryIndex]) {
          queryIndex++;
        }
      }

      if (queryIndex === queryLower.length) {
        results.add(index);
      }
    });

    return results;
  }

  /**
   * Filter logs with multiple criteria
   */
  filter(options: FilterOptions): LogEntry[] {
    let resultIndices: Set<number> = new Set();

    // Start with all logs
    if (this.logs.length > 0) {
      resultIndices = new Set(this.logs.map((_, index) => index));
    }

    // Filter by services
    if (options.services && options.services.length > 0) {
      const serviceIndices = new Set<number>();
      options.services.forEach((service) => {
        const indices = this.index.byService.get(service);
        if (indices) {
          indices.forEach((index) => serviceIndices.add(index));
        }
      });
      resultIndices = this.intersectSets(resultIndices, serviceIndices);
    }

    // Filter by levels
    if (options.levels && options.levels.length > 0) {
      const levelIndices = new Set<number>();
      options.levels.forEach((level) => {
        const indices = this.index.byLevel.get(level);
        if (indices) {
          indices.forEach((index) => levelIndices.add(index));
        }
      });
      resultIndices = this.intersectSets(resultIndices, levelIndices);
    }

    // Filter by time range
    if (options.timeRange) {
      const timeIndices = new Set<number>();
      const startTime = options.timeRange.start.getTime();
      const endTime = options.timeRange.end.getTime();

      this.logs.forEach((log, index) => {
        const logTime = new Date(log.timestamp).getTime();
        if (logTime >= startTime && logTime <= endTime) {
          timeIndices.add(index);
        }
      });
      resultIndices = this.intersectSets(resultIndices, timeIndices);
    }

    // Filter by search
    if (options.search && options.search.trim()) {
      const searchIndices = new Set(
        this.search(options.search, options.searchOptions)
          .map((_, index) => this.logs.findIndex((log) => log === _))
          .filter((index) => index !== -1)
      );
      resultIndices = this.intersectSets(resultIndices, searchIndices);
    }

    return Array.from(resultIndices)
      .map((index) => this.logs[index])
      .filter(Boolean);
  }

  /**
   * Intersect two sets
   */
  private intersectSets(set1: Set<number>, set2: Set<number>): Set<number> {
    const result = new Set<number>();
    for (const item of set1) {
      if (set2.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Get statistics about the index
   */
  getStats(): {
    totalLogs: number;
    services: string[];
    levels: string[];
    timeRange: { start: Date; end: Date } | null;
    indexSize: number;
  } {
    const services = Array.from(this.index.byService.keys());
    const levels = Array.from(this.index.byLevel.keys());

    let timeRange: { start: Date; end: Date } | null = null;
    if (this.logs.length > 0) {
      const timestamps = this.logs.map((log) =>
        new Date(log.timestamp).getTime()
      );
      timeRange = {
        start: new Date(Math.min(...timestamps)),
        end: new Date(Math.max(...timestamps)),
      };
    }

    return {
      totalLogs: this.logs.length,
      services,
      levels,
      timeRange,
      indexSize:
        this.index.byService.size +
        this.index.byLevel.size +
        this.index.byTimestamp.size +
        this.index.byMessage.size +
        this.index.fullTextIndex.size,
    };
  }

  /**
   * Get index version for cache invalidation
   */
  getIndexVersion(): number {
    return this.indexVersion;
  }
}
