import { execSync, spawnSync } from "child_process";
import { UnifiedConfig } from "@/config/UnifiedConfig";

// Docker metrics cache
interface DockerMetricsCache {
  uptime: Map<string, { value: string; timestamp: number }>;
  memory: Map<string, { value: string; timestamp: number }>;
  cpu: Map<string, { value: string; timestamp: number }>;
}

const CACHE_TTL_MS = 5000; // 5 seconds cache
const dockerMetricsCache: DockerMetricsCache = {
  uptime: new Map(),
  memory: new Map(),
  cpu: new Map(),
};

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL_MS;
}

function getCachedOrExecute<T>(
  cache: Map<string, { value: T; timestamp: number }>,
  key: string,
  executeFn: () => T
): T {
  const cached = cache.get(key);
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.value;
  }

  const value = executeFn();
  cache.set(key, { value, timestamp: Date.now() });
  return value;
}

export function normalizeName(name: string): string {
  return name?.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

export function clearDockerMetricsCache(): void {
  dockerMetricsCache.uptime.clear();
  dockerMetricsCache.memory.clear();
  dockerMetricsCache.cpu.clear();
}

export function batchCollectDockerStats(
  containerNames: string[]
): Map<string, { memory: string; cpu: string }> {
  const results = new Map<string, { memory: string; cpu: string }>();

  if (containerNames.length === 0) return results;

  try {
    const containerList = containerNames.join(" ");
    const output = execSync(
      `docker stats ${containerList} --no-stream --format "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"`,
      {
        stdio: ["pipe", "pipe", "ignore"],
      }
    )
      .toString()
      .trim();

    if (!output) return results;

    const lines = output.split("\n");
    for (const line of lines) {
      const [name, memUsage, cpuPerc] = line.split("\t");
      if (name && memUsage && cpuPerc) {
        const memory = memUsage
          .split(" / ")[0]
          .replace("MiB", "MB")
          .replace("GiB", "GB");
        results.set(name, { memory, cpu: cpuPerc });

        dockerMetricsCache.memory.set(name, {
          value: memory,
          timestamp: Date.now(),
        });
        dockerMetricsCache.cpu.set(name, {
          value: cpuPerc,
          timestamp: Date.now(),
        });
      }
    }
  } catch {
    // ignore; individual calls will fallback
  }

  return results;
}

export function getDockerContainerUptime(containerName: string): string {
  return getCachedOrExecute(dockerMetricsCache.uptime, containerName, () => {
    try {
      const output = execSync(
        `docker inspect ${containerName} --format '{{.State.StartedAt}}'`,
        {
          stdio: ["pipe", "pipe", "ignore"],
        }
      )
        .toString()
        .trim();
      if (!output) return "unknown";
      const started = new Date(output).getTime();
      const uptime = Math.floor((Date.now() - started) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;
      return `${hours}h ${minutes}m ${seconds}s`;
    } catch {
      return "unknown";
    }
  });
}

export function getDockerContainerMemoryUsage(containerName: string): string {
  return getCachedOrExecute(dockerMetricsCache.memory, containerName, () => {
    try {
      const output = execSync(
        `docker stats ${containerName} --no-stream --format "{{.MemUsage}}"`,
        {
          stdio: ["pipe", "pipe", "ignore"],
        }
      )
        .toString()
        .trim();
      if (!output) return "unknown";
      const memUsage = output.split(" / ")[0];
      return memUsage.replace("MiB", "MB").replace("GiB", "GB");
    } catch {
      return "unknown";
    }
  });
}

export function getDockerContainerCpuUsage(containerName: string): string {
  return getCachedOrExecute(dockerMetricsCache.cpu, containerName, () => {
    try {
      const output = execSync(
        `docker stats ${containerName} --no-stream --format "{{.CPUPerc}}"`,
        {
          stdio: ["pipe", "pipe", "ignore"],
        }
      )
        .toString()
        .trim();
      if (!output) return "unknown";
      return output;
    } catch {
      return "unknown";
    }
  });
}

export function getRunningDockerContainers(): Map<string, string> {
  try {
    const output = execSync(
      `docker ps --format "{{.Names}}\t{{.Image}}\t{{.Labels}}"`,
      {
        stdio: ["pipe", "pipe", "ignore"],
      }
    )
      .toString()
      .trim();

    const containerMap = new Map<string, string>();

    if (!output) return containerMap;

    const lines = output.split("\n");
    for (const line of lines) {
      const [containerName, _image, labels] = line.split("\t");

      let serviceName = containerName;

      if (labels && labels.includes("com.docker.compose.service=")) {
        const serviceMatch = labels.match(
          /com\.docker\.compose\.service=([^,\s]+)/
        );
        if (serviceMatch) {
          serviceName = serviceMatch[1];
        }
      }

      if (containerName.includes("_")) {
        const parts = containerName.split("_");
        if (parts.length >= 2) {
          serviceName = parts[parts.length - 2];
        }
      }

      containerMap.set(serviceName, containerName);
    }

    return containerMap;
  } catch {
    return new Map();
  }
}

export function getDockerContainerNameWithFallbacks(
  serviceName: string
): string[] {
  const collapsed = serviceName.replace(/[-_]/g, "");
  const hyphenToUnderscore = serviceName.replace(/-/g, "_");
  const underscoreToHyphen = serviceName.replace(/_/g, "-");

  const variants = new Set<string>([
    serviceName,
    `${serviceName}_1`,
    `scripts_${serviceName}_1`,
    `scripts-${serviceName}-1`,
    collapsed,
    `${collapsed}_1`,
    `scripts_${collapsed}_1`,
    `scripts-${collapsed}-1`,
    hyphenToUnderscore,
    `${hyphenToUnderscore}_1`,
    `scripts_${hyphenToUnderscore}_1`,
    `scripts-${hyphenToUnderscore}-1`,
    underscoreToHyphen,
    `${underscoreToHyphen}_1`,
    `scripts_${underscoreToHyphen}_1`,
    `scripts-${underscoreToHyphen}-1`,
  ]);

  return Array.from(variants);
}

export function getDockerMetricsWithFallback(
  serviceName: string,
  metricFunction: (containerName: string) => string
): string {
  const runningContainers = getRunningDockerContainers();
  const actualContainerName = runningContainers.get(serviceName);

  if (actualContainerName) {
    const result = metricFunction(actualContainerName);
    if (result !== "unknown") {
      return result;
    }
  }

  const possibleNames = getDockerContainerNameWithFallbacks(serviceName);
  for (const containerName of possibleNames) {
    const result = metricFunction(containerName);
    if (result !== "unknown") {
      return result;
    }
  }

  return "unknown";
}

export function getDockerComposeContainerName(
  serviceName: string
): string | null {
  try {
    const output = execSync(`docker-compose ps -q ${serviceName}`, {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!output) return null;

    const nameOutput = execSync(
      `docker inspect ${output} --format '{{.Name}}'`,
      {
        stdio: ["pipe", "pipe", "ignore"],
      }
    )
      .toString()
      .trim();

    return nameOutput.startsWith("/") ? nameOutput.substring(1) : nameOutput;
  } catch {
    return null;
  }
}

export function getContainerNameFromProcess(procItem: any): string | null {
  if (!procItem?.proc?.spawnargs) return null;

  const args = procItem.proc.spawnargs;
  const command = args.join(" ").toLowerCase();

  if (command.includes("docker-compose")) {
    return procItem.name;
  }

  if (command.includes("docker") && command.includes("run")) {
    const nameIndex = args.findIndex((arg: string) => arg === "--name");
    if (nameIndex !== -1 && nameIndex + 1 < args.length) {
      return args[nameIndex + 1];
    }
  }

  return procItem.name;
}

export function getContainerNameFromProcessContext(
  procItem: any
): string | null {
  if (!procItem?.proc?.pid) return null;

  try {
    const cmdline = execSync(`cat /proc/${procItem.proc.pid}/cmdline`, {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .replace(/\0/g, " ");

    const projectMatch = cmdline.match(/--project-name\s+(\S+)/);
    if (projectMatch) {
      const projectName = projectMatch[1];
      return `${projectName}_${procItem.name}_1`;
    }

    const cwd = execSync(`readlink -f /proc/${procItem.proc.pid}/cwd`, {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (cwd) {
      const projectName = cwd.split("/").pop() || "scripts";
      return `${projectName}_${procItem.name}_1`;
    }
  } catch {
    // ignore
  }

  return null;
}

export function resolveContainerName(procItem: any): string | null {
  const serviceName = procItem.name;

  const composeName = getDockerComposeContainerName(serviceName);
  if (composeName) return composeName;

  const runningContainers = getRunningDockerContainers();
  const actualName = runningContainers.get(serviceName);
  if (actualName) return actualName;

  const contextName = getContainerNameFromProcessContext(procItem);
  if (contextName) return contextName;

  const processName = getContainerNameFromProcess(procItem);
  if (processName && processName !== serviceName) return processName;

  return serviceName;
}

export function stopDockerContainer(containerName: string): boolean {
  try {
    const result = spawnSync("docker", ["stop", containerName], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function getPlannedDockerServiceNames(): Set<string> {
  const set = new Set<string>();
  try {
    const cfg = UnifiedConfig.getInstance();
    const globalMode = cfg.getGlobalMode();

    const dockerRepos = cfg.getRepositoriesByMode("docker");
    for (const repo of dockerRepos) {
      set.add(repo);
      set.add(normalizeName(repo));
    }

    const infra = cfg.getInfraServices();
    for (const svc of infra) {
      set.add(svc);
      set.add(normalizeName(svc));
    }

    if (globalMode === "docker") {
      // In global docker mode, assume all repos are docker-planned
      for (const repo of cfg.getRepositoryNames()) {
        set.add(repo);
        set.add(normalizeName(repo));
      }
    }
  } catch {
    // ignore
  }
  return set;
}
