// src/utils/index.ts
// Facade + Barrel for utilities. Prefer importing from "@/utils".

// Re-export individual utilities for backward compatibility
export * from "./exec";
export * from "./docker";
export * from "./process";
export { ProcessManager } from "./ProcessManager";

// Grouped namespaces for a cleaner API
import {
  checkSudoAvailability,
  requiresSudo,
  execWithSudo,
  execWithSudoAsync,
  npmInstallWithSudo,
} from "./exec";

import {
  normalizeName,
  clearDockerMetricsCache,
  batchCollectDockerStats,
  getDockerContainerUptime,
  getDockerContainerMemoryUsage,
  getDockerContainerCpuUsage,
  getRunningDockerContainers,
  getDockerContainerNameWithFallbacks,
  getDockerMetricsWithFallback,
  getDockerComposeContainerName,
  getContainerNameFromProcess,
  getContainerNameFromProcessContext,
  resolveContainerName,
  stopDockerContainer,
  getPlannedDockerServiceNames,
} from "./docker";

import {
  detectLogLevel,
  getProcessUptime,
  getProcessMemoryUsage,
  getProcessCpuUsage,
} from "./process";

export const Exec = Object.freeze({
  checkSudoAvailability,
  requiresSudo,
  execWithSudo,
  execWithSudoAsync,
  npmInstallWithSudo,
});

export const Docker = Object.freeze({
  normalizeName,
  clearDockerMetricsCache,
  batchCollectDockerStats,
  getDockerContainerUptime,
  getDockerContainerMemoryUsage,
  getDockerContainerCpuUsage,
  getRunningDockerContainers,
  getDockerContainerNameWithFallbacks,
  getDockerMetricsWithFallback,
  getDockerComposeContainerName,
  getContainerNameFromProcess,
  getContainerNameFromProcessContext,
  resolveContainerName,
  stopDockerContainer,
  getPlannedDockerServiceNames,
});

export const Proc = Object.freeze({
  detectLogLevel,
  getProcessUptime,
  getProcessMemoryUsage,
  getProcessCpuUsage,
});
