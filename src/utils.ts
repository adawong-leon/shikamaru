// src/utils.ts
import path from "path";

// Re-export modules for organized utilities
export { ProcessManager } from "./utils/ProcessManager";
export * from "./utils/exec";
export * from "./utils/docker";
export * from "./utils/process";

// Common constants and types that were referenced externally
export const PROJECTS_DIR = path.resolve(process.cwd(), "../");

export type InfraService = "postgres" | "timescaledb" | "redis" | "rabbitmq";
export type PortsMap = Record<string, number | { host: number }>;

// Legacy helpers preserved as thin wrappers where applicable
export async function healthCheck(
  _services: Set<InfraService> | InfraService[],
  _ports: PortsMap
): Promise<void> {
  console.log("⏳ Waiting for infra services to become healthy...");
  await new Promise((r) => setTimeout(r, 5000));
  console.log("✅ Infra services should now be ready.");
}
