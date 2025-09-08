# Prompts Manager - Staff Engineer Level Architecture

## Overview

The Prompts Manager is a comprehensive, modular system for handling user interactions in repository selection and watch mode configuration. Built with staff engineer-level architecture principles, it provides robust validation, intelligent recommendations, and extensible prompt handling.

## Architecture

### Core Components

```
prompts-manager/
├── PromptsManager.ts              # Main orchestrator class
├── types.ts                       # Shared types and interfaces
├── errors/
│   └── PromptsError.ts           # Custom error handling
├── validators/
│   └── RepoValidator.ts          # Repository validation logic
├── providers/
│   └── WatchModeProvider.ts      # Watch mode selection logic
└── index.ts                      # Public API
```

### Design Principles

1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Dependency Inversion**: Components interact via interfaces rather than concrete implementations
3. **Error Handling**: Comprehensive error handling with custom error types
4. **Validation**: Multi-level validation (input, business logic, output)
5. **Intelligent Recommendations**: Smart suggestions based on repository analysis
6. **Extensibility**: Easy to extend with custom validators and providers
7. **User Experience**: Intuitive prompts with helpful guidance

## Key Features

### 🎯 **Intelligent Repository Selection**

- Automatic discovery of repositories with `.env.example` files
- Searchable repository selection with live filtering
- Minimum and maximum repository count validation
- Duplicate detection and prevention
- Similar repository name detection

### 🔍 **Comprehensive Validation**

- Repository name validation
- Repository count validation
- Repository existence validation
- Duplicate detection
- Similar name warnings

### 🚀 **Smart Watch Mode Selection**

- Intelligent mode recommendations based on repository analysis
- Mode-specific validation
- Requirements analysis
- User-friendly descriptions

### 📊 **Metrics & Observability**

- User interaction tracking
- Validation error tracking
- Performance metrics
- Detailed error reporting

### 🔧 **Extensibility**

- Custom validators
- Pluggable providers
- Configurable prompts
- Flexible validation rules

## Usage Examples

### Basic Usage (Backward Compatible)

```typescript
import { selectRepos } from "./prompts-manager";

const repos = await selectRepos();
console.log("Selected repos:", repos);
```

### Advanced Usage with Configuration

```typescript
import { createPromptsManager } from "./prompts-manager";

const promptsManager = createPromptsManager({
  projectsDir: "/path/to/projects",
  minRepos: 1,
  maxRepos: 20,
  enableValidation: true,
  enableSearch: true,
  pageSize: 15,
});

await promptsManager.initialize();
const repos = await promptsManager.selectRepos();
const watchMode = await promptsManager.selectWatchMode();
```

### Full Selection Flow

```typescript
import { selectReposAndWatchMode } from "./prompts-manager";

const { repos, watchMode } = await selectReposAndWatchMode();
console.log(`Selected ${repos.length} repos in ${watchMode} mode`);
```

### Validation and Analysis

```typescript
import { validateRepoSelection, analyzeRepoSelection } from "./prompts-manager";

// Validate selection
const validation = await validateRepoSelection(["repo1", "repo2"]);
if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}

// Analyze selection
const analysis = await analyzeRepoSelection(["repo1", "repo2"]);
console.log("Recommended watch mode:", analysis.watchModeRecommendation);
console.log("Requirements:", analysis.requirements);
```

## Configuration Options

### PromptsManagerConfig

```typescript
interface PromptsManagerConfig {
  projectsDir: string; // Base directory for projects
  minRepos?: number; // Minimum repos to select (default: 1)
  maxRepos?: number; // Maximum repos to select (default: 50)
  enableValidation?: boolean; // Enable validation (default: true)
  enableSearch?: boolean; // Enable search functionality (default: true)
  pageSize?: number; // Prompt page size (default: auto-calculated)
}
```

## Error Handling

The system provides comprehensive error handling with custom error types:

```typescript
import { PromptsError } from "./prompts-manager";

try {
  const repos = await selectRepos();
} catch (error) {
  if (error instanceof PromptsError) {
    console.error(`Prompts Error (${error.code}):`, error.message);
    console.error("Details:", error.details);
  }
}
```

### Error Types

- `INVALID_INPUT`: Invalid input parameters
- `NO_REPOS_FOUND`: No repositories discovered
- `INVALID_SELECTION`: Invalid repository selection
- `INVALID_REPO_NAME`: Invalid repository name
- `INVALID_WATCH_MODE`: Invalid watch mode
- `USER_CANCELLED`: User cancelled the selection
- `PROMPT_ERROR`: Prompt display error
- `VALIDATION_ERROR`: Validation failures

## Watch Mode Selection

The system provides intelligent watch mode recommendations:

### Local Mode

- **Best for**: Small projects (1-3 repos), Node.js applications
- **Requirements**: Node.js installed, direct file system access
- **Benefits**: Fast development, direct debugging

### Docker Mode

- **Best for**: Large projects (5+ repos), complex dependencies
- **Requirements**: Docker installed, sufficient system resources
- **Benefits**: Consistent environments, isolation

### Hybrid Mode

- **Best for**: Medium projects (2-5 repos), mixed requirements
- **Requirements**: Both local and Docker environments
- **Benefits**: Flexibility, optimized resource usage

## Validation Features

### Repository Validation

- **Name Validation**: Alphanumeric, hyphens, underscores only
- **Length Validation**: 1-100 characters
- **Reserved Names**: Prevents selection of system directories
- **Existence Check**: Ensures repositories actually exist

### Selection Validation

- **Count Validation**: Enforces minimum and maximum limits
- **Duplicate Detection**: Prevents selecting the same repo twice
- **Similar Name Detection**: Warns about potentially confusing names

### Watch Mode Validation

- **Mode Compatibility**: Ensures mode works with selected repos
- **Requirements Check**: Validates system requirements
- **Performance Analysis**: Warns about potential performance issues

## Metrics and Monitoring

The system provides detailed metrics for monitoring and debugging:

```typescript
const metrics = promptsManager.getMetrics();
console.log("User interaction metrics:", {
  duration: metrics.endTime - metrics.startTime,
  reposDiscovered: metrics.reposDiscovered,
  reposSelected: metrics.reposSelected,
  validationErrors: metrics.validationErrors,
  warnings: metrics.warnings,
  userInteractions: metrics.userInteractions,
});
```

## Migration Guide

### From Legacy System

The new system maintains full backward compatibility:

```typescript
// Recommended usage
import { selectReposAndWatchMode } from "./prompts-manager";
const { repos, watchMode } = await selectReposAndWatchMode();
```

### Benefits of Migration

1. **Better Validation**: Comprehensive validation at multiple levels
2. **Intelligent Recommendations**: Smart watch mode suggestions
3. **Error Handling**: Structured error types with detailed information
4. **Metrics**: Built-in performance and usage metrics
5. **Extensibility**: Easy to extend with custom components
6. **Testing**: Better testability with dependency injection
7. **Maintainability**: Clear separation of concerns and modular design

## Future Enhancements

### Planned Features

1. **Repository Analysis**: Deep analysis of repository structure and dependencies
2. **Performance Profiling**: Automatic performance analysis and recommendations
3. **Configuration Templates**: Pre-defined configurations for common scenarios
4. **Integration APIs**: REST API for programmatic access
5. **Plugin System**: Extensible plugin architecture for custom validators
6. **Machine Learning**: ML-based recommendations based on usage patterns
7. **Multi-Environment**: Support for different development environments
8. **Audit Trail**: Complete audit trail of user selections

### Extension Points

The system is designed for easy extension:

```typescript
// Custom validator
class CustomValidator implements PromptsValidator {
  async validateRepos(
    selectedRepos: RepoSelection,
    discoveredRepos: string[]
  ): Promise<ValidationResult> {
    // Custom validation logic
  }
}

// Custom watch mode provider
class CustomWatchModeProvider implements WatchModeProvider {
  async promptForWatchMode(selectedRepos: RepoSelection): Promise<WatchMode> {
    // Custom watch mode logic
  }
}
```

## Contributing

When contributing to the prompts manager:

1. Follow the established architecture patterns
2. Add comprehensive error handling
3. Include validation for new features
4. Add metrics for observability
5. Write tests for new components
6. Update documentation
7. Maintain backward compatibility

## Conclusion

The Prompts Manager represents a significant improvement over the legacy system, providing:

- **Robustness**: Comprehensive error handling and validation
- **Intelligence**: Smart recommendations based on repository analysis
- **Flexibility**: Configurable and extensible architecture
- **Observability**: Built-in metrics and monitoring
- **Maintainability**: Clear separation of concerns
- **User Experience**: Intuitive prompts with helpful guidance
- **Developer Experience**: Intuitive API with excellent documentation

This architecture follows staff engineer best practices and provides a solid foundation for future enhancements and integrations.
