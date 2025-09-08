import React from "react";
import { LogFilters as LogFiltersType, Service, LogStats } from "../types";
import { cn } from "../utils/cn";
import { Search, Filter, X, Trash2 } from "lucide-react";

interface LogFiltersProps {
  filters: LogFiltersType;
  onFiltersChange: (filters: LogFiltersType) => void;
  services: Service[];
  onClearLogs: () => void;
  stats: LogStats;
}

export const LogFilters: React.FC<LogFiltersProps> = ({
  filters,
  onFiltersChange,
  services,
  onClearLogs,
  stats,
}) => {
  const handleServiceToggle = (serviceName: string) => {
    const newServices = filters.services.includes(serviceName)
      ? filters.services.filter((s) => s !== serviceName)
      : [...filters.services, serviceName];

    onFiltersChange({ ...filters, services: newServices });
  };

  const handleLevelToggle = (level: string) => {
    const newLevels = filters.levels.includes(level)
      ? filters.levels.filter((l) => l !== level)
      : [...filters.levels, level];

    onFiltersChange({ ...filters, levels: newLevels });
  };

  const handleSearchChange = (search: string) => {
    onFiltersChange({ ...filters, search });
  };

  const clearFilters = () => {
    onFiltersChange({
      services: [],
      levels: ["info", "warn", "error"],
      search: "",
    });
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "debug":
        return "text-gray-500";
      default:
        return "text-blue-500";
    }
  };

  const getLevelBgColor = (level: string) => {
    switch (level) {
      case "error":
        return "bg-red-500/20";
      case "warn":
        return "bg-yellow-500/20";
      case "debug":
        return "bg-gray-500/20";
      default:
        return "bg-blue-500/20";
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Filters</h3>
          <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-600 rounded-md font-medium">
            Total: {stats.total.toLocaleString()}
          </span>
          {filters.services.length === 1 && (
            <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-600 rounded-md font-medium">
              Filtered by: {filters.services[0]}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={clearFilters}
            className="p-2 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            title="Clear filters"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={onClearLogs}
            className="p-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Search Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search in logs..."
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Log Levels */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Log Levels
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { level: "info", count: stats.info },
              { level: "warn", count: stats.warnings },
              { level: "error", count: stats.errors },
              { level: "debug", count: stats.debug },
            ].map(({ level, count }) => (
              <button
                key={level}
                onClick={() => handleLevelToggle(level)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  filters.levels.includes(level)
                    ? cn(getLevelBgColor(level), getLevelColor(level))
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {level.toUpperCase()} ({count.toLocaleString()})
              </button>
            ))}
          </div>
        </div>

        {/* Service Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Services
          </label>
          <div className="max-h-32 overflow-y-auto custom-scrollbar">
            <div className="space-y-1">
              {services.map((service) => (
                <label
                  key={service.name}
                  className="flex items-center space-x-2"
                >
                  <input
                    type="checkbox"
                    checked={
                      filters.services.length === 0 ||
                      filters.services.includes(service.name)
                    }
                    onChange={() => handleServiceToggle(service.name)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground truncate">
                    {service.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {(filters.search ||
        filters.services.length > 0 ||
        filters.levels.length !== 4) && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-medium text-foreground">
              Active Filters:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.search && (
              <span className="px-2 py-1 bg-blue-500/20 text-blue-600 rounded text-xs">
                Search: "{filters.search}"
              </span>
            )}
            {filters.services.length > 0 && (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-600 rounded text-xs">
                Services: {filters.services.length} selected
              </span>
            )}
            {filters.levels.length !== 4 && (
              <span className="px-2 py-1 bg-orange-500/20 text-orange-600 rounded text-xs">
                Levels: {filters.levels.join(", ")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
