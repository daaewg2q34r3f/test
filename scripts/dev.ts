import { spawn, spawnSync, type ChildProcess } from "child_process";
import path from "path";
import net from "net";

type PortOwner = {
  pid: number;
  commandLine?: string;
  name?: string;
};

const port = parseInt(process.env.PORT || "60000", 10);
const cwd = process.cwd().toLowerCase();

function runPowerShell(command: string) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function getPortOwner(targetPort: number): PortOwner | null {
  if (process.platform !== "win32") return null;

  const result = runPowerShell(`
$connection = Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
  [PSCustomObject]@{
    pid = $connection.OwningProcess
    commandLine = $process.CommandLine
    name = $process.Name
  } | ConvertTo-Json -Compress
}
`);

  const output = result.stdout?.trim();
  if (!output) return null;

  try {
    return JSON.parse(output) as PortOwner;
  } catch {
    return null;
  }
}

function isGalaxyLoomDevProcess(owner: PortOwner) {
  const commandLine = (owner.commandLine || "").toLowerCase();
  return (
    commandLine.includes(cwd) &&
    (
      commandLine.includes("src/app.ts") ||
      commandLine.includes("scripts/main.ts") ||
      commandLine.includes("tsx")
    )
  );
}

function killProcess(pid: number) {
  if (process.platform === "win32") {
    runPowerShell(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

function isPortBusy(targetPort: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port: targetPort, host: "127.0.0.1" });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function waitForPortRelease(targetPort: number, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const busy = await isPortBusy(targetPort);
    if (!busy) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !(await isPortBusy(targetPort));
}

async function freeDevPort(targetPort: number) {
  const owner = getPortOwner(targetPort);
  if (!owner) return;

  if (!isGalaxyLoomDevProcess(owner)) {
    console.error(`[dev] 端口 ${targetPort} 已被其他进程占用，PID=${owner.pid}，未自动终止。`);
    process.exit(1);
  }

  console.warn(`[dev] 检测到旧的 GalaxyLoom 开发进程占用端口 ${targetPort}，PID=${owner.pid}，正在清理。`);
  killProcess(owner.pid);

  const released = await waitForPortRelease(targetPort);
  if (!released) {
    console.error(`[dev] 端口 ${targetPort} 释放失败，请手动结束 PID=${owner.pid} 后重试。`);
    process.exit(1);
  }
}

function getTsxLaunchCommand() {
  return {
    command: process.execPath,
    args: [
      path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "watch",
      "src/app.ts",
    ],
  };
}

async function main() {
  await freeDevPort(port);

  const { command, args } = getTsxLaunchCommand();
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  bindExitSignals(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}

function bindExitSignals(child: ChildProcess) {
  const shutdown = () => {
    if (!child.killed) child.kill();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", shutdown);
}

void main();
