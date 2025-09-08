import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { Search, Filter, X, ChevronDown, Clock, Tag, Zap } from "lucide-react";
import { cn } from "../utils/cn";
import { useDebounce } from "../hooks/usePerformance";
import type { LogFilters } from "../types";

interface OptimizedSearchFilterProps {
  filters: LogFilters;
  onFiltersChange: (filters: LogFilters) => void;
  availableServices: string[];
  availableLevels: string[];
  className?: string;
}

interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  fuzzy: boolean;
}

export const OptimizedSearchFilter: React.FC<OptimizedSearchFilterProps> = ({
  filters,
  onFiltersChange,
  availableServices,
  availableLevels,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState(filters.search || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    fuzzy: false,
  });
  const [showServiceFilter, setShowServiceFilter] = useState(false);
  const [showLevelFilter, setShowLevelFilter] = useState(false);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [timeRange, setTimeRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const debouncedSearch = useDebounce((query: string) => {
    onFiltersChange({
      ...filters,
      search: query,
    });
  }, 300);

  // Handle search input change
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch]
  );

  // Handle service filter change
  const handleServiceChange = useCallback(
    (service: string, checked: boolean) => {
      const newServices = checked
        ? [...filters.services, service]
        : filters.services.filter((s) => s !== service);

      onFiltersChange({
        ...filters,
        services: newServices,
      });
    },
    [filters, onFiltersChange]
  );

  // Handle level filter change
  const handleLevelChange = useCallback(
    (level: string, checked: boolean) => {
      const newLevels = checked
        ? [...filters.levels, level]
        : filters.levels.filter((l) => l !== level);

      onFiltersChange({
        ...filters,
        levels: newLevels,
      });
    },
    [filters, onFiltersChange]
  );

  // Handle time range change
  const handleTimeRangeChange = useCallback((start: string, end: string) => {
    setTimeRange({ start, end });
    // This would be implemented with actual time filtering logic
  }, []);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    onFiltersChange({
      services: [],
      levels: availableLevels,
      search: "",
    });
  }, [onFiltersChange, availableLevels]);

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.services.length > 0) count++;
    if (filters.levels.length !== availableLevels.length) count++;
    return count;
  }, [filters, availableLevels]);

  // Focus search input on Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search Bar */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search logs... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Options */}
        {showAdvanced && (
          <div className="mt-2 p-3 bg-muted/50 rounded-md space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={searchOptions.caseSensitive}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      caseSensitive: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Case Sensitive
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={searchOptions.wholeWord}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      wholeWord: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Whole Word
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={searchOptions.regex}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      regex: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Regex
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={searchOptions.fuzzy}
                  onChange={(e) =>
                    setSearchOptions((prev) => ({
                      ...prev,
                      fuzzy: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                Fuzzy
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap gap-2">
        {/* Service Filter */}
        <div className="relative">
          <button
            onClick={() => setShowServiceFilter(!showServiceFilter)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md border transition-colors",
              filters.services.length > 0
                ? "bg-blue-500/10 border-blue-500/20 text-blue-600"
                : "bg-background border-input text-foreground hover:bg-muted"
            )}
          >
            <Tag className="w-4 h-4" />
            Services
            {filters.services.length > 0 && (
              <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {filters.services.length}
              </span>
            )}
            <ChevronDown className="w-4 h-4" />
          </button>

          {showServiceFilter && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-10">
              <div className="p-2 max-h-48 overflow-y-auto">
                {availableServices.map((service) => (
                  <label
                    key={service}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.services.includes(service)}
                      onChange={(e) =>
                        handleServiceChange(service, e.target.checked)
                      }
                      className="rounded"
                    />
                    <span className="text-sm">{service}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Level Filter */}
        <div className="relative">
          <button
            onClick={() => setShowLevelFilter(!showLevelFilter)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md border transition-colors",
              filters.levels.length !== availableLevels.length
                ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-600"
                : "bg-background border-input text-foreground hover:bg-muted"
            )}
          >
            <Filter className="w-4 h-4" />
            Levels
            {filters.levels.length !== availableLevels.length && (
              <span className="bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {filters.levels.length}
              </span>
            )}
            <ChevronDown className="w-4 h-4" />
          </button>

          {showLevelFilter && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-10">
              <div className="p-2">
                {availableLevels.map((level) => (
                  <label
                    key={level}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.levels.includes(level)}
                      onChange={(e) =>
                        handleLevelChange(level, e.target.checked)
                      }
                      className="rounded"
                    />
                    <span className="text-sm capitalize">{level}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Time Filter */}
        <div className="relative">
          <button
            onClick={() => setShowTimeFilter(!showTimeFilter)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-foreground hover:bg-muted transition-colors"
          >
            <Clock className="w-4 h-4" />
            Time Range
            <ChevronDown className="w-4 h-4" />
          </button>

          {showTimeFilter && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-popover border border-border rounded-md shadow-lg z-10">
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <input
                    type="datetime-local"
                    value={timeRange.start}
                    onChange={(e) =>
                      handleTimeRangeChange(e.target.value, timeRange.end)
                    }
                    className="w-full mt-1 px-2 py-1 border border-input rounded bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <input
                    type="datetime-local"
                    value={timeRange.end}
                    onChange={(e) =>
                      handleTimeRangeChange(timeRange.start, e.target.value)
                    }
                    className="w-full mt-1 px-2 py-1 border border-input rounded bg-background text-foreground"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advanced Search Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md border transition-colors",
            showAdvanced
              ? "bg-purple-500/10 border-purple-500/20 text-purple-600"
              : "bg-background border-input text-foreground hover:bg-muted"
          )}
        >
          <Zap className="w-4 h-4" />
          Advanced
        </button>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Active Filters Summary */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-600 text-xs rounded-md">
              Search: "{filters.search}"
              <button
                onClick={() => handleSearchChange("")}
                className="hover:text-blue-800"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.services.map((service) => (
            <span
              key={service}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-600 text-xs rounded-md"
            >
              {service}
              <button
                onClick={() => handleServiceChange(service, false)}
                className="hover:text-blue-800"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.levels.length !== availableLevels.length && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-600 text-xs rounded-md">
              {filters.levels.length} levels
              <button
                onClick={() =>
                  onFiltersChange({ ...filters, levels: availableLevels })
                }
                className="hover:text-yellow-800"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default OptimizedSearchFilter;
