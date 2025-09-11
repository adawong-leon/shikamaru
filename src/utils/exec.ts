import { execSync, spawnSync } from "child_process";

export function checkSudoAvailability(): boolean {
  try {
    execSync("sudo -n true", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function requiresSudo(command: string): boolean {
  const sudoCommands = [
    "docker",
    "docker-compose",
    "docker compose",
    "systemctl",
    "service",
    "iptables",
    "ufw",
    "netstat",
    "lsof",
    "npm install",
    "yarn install",
    "pnpm install",
  ];

  return sudoCommands.some((sudoCmd) => command.includes(sudoCmd));
}

export function execWithSudo(
  command: string,
  options: any = {}
): Buffer | string {
  // const needsSudo = requiresSudo(command);
  // const hasSudo = checkSudoAvailability();
  return execSync(command, options);
}

export function execWithSudoAsync(
  command: string,
  options: any = {}
): Promise<Buffer | string> {
  return new Promise((resolve, reject) => {
    try {
      const result = execWithSudo(command, options);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

export function npmInstallWithSudo(
  command: string,
  args: string[],
  cwd: string,
  options: any = {}
): any {
  const fullCommand = `${command} ${args.join(" ")}`;
  const needsSudo = requiresSudo(fullCommand);
  const hasSudo = checkSudoAvailability();

  return spawnSync("sudo", [command, ...args], {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });

  return spawnSync(command, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
}
