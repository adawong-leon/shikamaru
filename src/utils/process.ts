import { execSync } from "child_process";

export function detectLogLevel(
  message: string
): "info" | "warn" | "error" | "debug" {
  const lowerMessage = message.toLowerCase();

  const noErrorContexts =
    /\b(found\s+0\s+errors?|no\s+errors?|0\s+errors?|errors?\s*[:=]\s*0)\b/;
  const mentionsError =
    lowerMessage.includes("error") || lowerMessage.includes("errors");
  const suppressError = mentionsError && noErrorContexts.test(lowerMessage);

  if (
    !suppressError &&
    (lowerMessage.includes("error") ||
      lowerMessage.includes("exception") ||
      lowerMessage.includes("failed"))
  ) {
    return "error";
  } else if (
    lowerMessage.includes("warn") ||
    lowerMessage.includes("warning")
  ) {
    return "warn";
  } else if (lowerMessage.includes("debug") || lowerMessage.includes("trace")) {
    return "debug";
  } else {
    return "info";
  }
}

export function getProcessUptime(pid?: number): string {
  if (!pid) return "unknown";
  try {
    const output = execSync(`ps -p ${pid} -o lstart=`).toString().trim();
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
}

export function getProcessMemoryUsage(pid?: number): string {
  if (!pid) return "unknown";
  try {
    const output = execSync(`ps -p ${pid} -o rss=`).toString().trim();
    if (!output) return "unknown";
    const memory = parseInt(output);
    if (isNaN(memory)) return "unknown";
    const mb = Math.floor(memory / 1024);
    return `${mb}MB`;
  } catch {
    return "unknown";
  }
}

export function getProcessCpuUsage(pid?: number): string {
  if (!pid) return "unknown";
  try {
    const output = execSync(`ps -p ${pid} -o %cpu=`).toString().trim();
    if (!output) return "unknown";
    const cpu = parseFloat(output);
    if (isNaN(cpu)) return "unknown";
    return `${cpu.toFixed(2)}%`;
  } catch {
    return "unknown";
  }
}
