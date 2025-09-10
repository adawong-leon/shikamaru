// Help Command

import chalk from "chalk";

export class HelpCommand {
  static execute(): void {
    console.log(`
🚀 shikamaru - Multi-repository development environment

Usage: shikamaru <command> [options]

Commands:
  start     Start the development environment (default)
  env       Generate .env files only (no services start)
  profile   Manage saved profiles (list, show, delete)
  logs      View logs from running services
  status    Check status of running services
  monitor   Interactive monitoring dashboard for running services
  help      Show this help message

Options:
  -v, --verbose        Enable verbose logging
  -p, --profile <name> Load saved profile by name (skips interactive profile selection)
  --projects-dir <path> Projects directory path (default: ../ or PROJECTS_DIR env)
  --skip-cloud        Skip cloud provider variable loading and use local/docker defaults only (also skips tier selection)
  --skip-azure        Skip Azure variable loading (deprecated, use --skip-cloud instead)

Examples:
  maru start
  maru start --verbose
  maru start --profile "my-profile"
  maru start --projects-dir /path/to/projects
  maru start --skip-cloud
  maru env --projects-dir /path/to/projects
  maru env --skip-cloud
  maru profile
  maru logs
  maru status
  maru monitor

Environment Variables:
  PROJECTS_DIR        Base directory for projects (overrides default: ../)

Features:
  • Multi-repository management with intelligent discovery
  • Environment configuration and validation
  • Port management with conflict resolution
  • Real-time log viewing and filtering
  • Support for local, Docker, and hybrid deployment modes
  • Comprehensive error handling and validation
  • Separate frontend and backend environment variables
  • Support for global.env and global.frontend.env files

For more information, visit: https://github.com/your-username/shikamaru
    `);
  }
}
