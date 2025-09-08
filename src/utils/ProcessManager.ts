import { ProcItem } from "../log-ui/types";
import { UnifiedExecutionManager } from "../modes/execution/UnifiedExecutionManager";
import { spawnSync } from "child_process";

export async function stopAll(items: ProcItem[]): Promise<void> {
  const children = items.map((p) => p?.proc).filter(Boolean) as any[];
  await Promise.allSettled(children.map((child) => killTree(child)));
}

async function killTree(child?: any, friendlyMs = 800): Promise<void> {
  if (!child || child.exitCode != null) return;

  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        shell: true,
      });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      await new Promise((res) => setTimeout(res, friendlyMs));
      if (child.exitCode == null) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {}
  }

  try {
    child.stdout?.unpipe();
    child.stdout?.destroy();
  } catch {}
  try {
    child.stderr?.unpipe();
    child.stderr?.destroy();
  } catch {}
}

export async function stopProcess(proc: any): Promise<void> {
  await killTree(proc);
}

export async function stopByPids(pids: number[]): Promise<void> {
  const processes = pids.map((pid) => ({ pid }));
  await Promise.allSettled(processes.map((proc) => killTree(proc)));
}

export async function stopAllServices(): Promise<void> {
  try {
    const unifiedManager = UnifiedExecutionManager.getInstance();
    await unifiedManager.stopExecution();
  } catch (error) {
    console.warn(
      "UnifiedExecutionManager not available for stopping services:",
      error
    );
  }
}

// Backwards compatibility object-style API
export const ProcessManager = {
  stopAll,
  killTree,
  stopProcess,
  stopByPids,
  stopAllServices,
};
