export {
  clearDockerMetricsCache,
  batchCollectDockerStats,
  getDockerContainerUptime,
  getDockerContainerMemoryUsage,
  getDockerContainerCpuUsage,
  getDockerMetricsWithFallback,
  getRunningDockerContainers,
  getDockerContainerNameWithFallbacks,
  getDockerComposeContainerName,
  getContainerNameFromProcess,
  getContainerNameFromProcessContext,
  resolveContainerName,
  stopDockerContainer,
  normalizeName,
  getPlannedDockerServiceNames,
} from "@/utils/docker";

export {
  detectLogLevel,
  getProcessUptime,
  getProcessMemoryUsage,
  getProcessCpuUsage,
} from "@/utils/process";

/**
 * Get random uptime for mock services
 */
export function getRandomUptime(): string {
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  return `${hours}h ${minutes}m`;
}
