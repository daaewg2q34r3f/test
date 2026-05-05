import { spawnSync } from "child_process";

function canUseBetterSqlite3() {
  try {
    const BetterSqlite3 = require("better-sqlite3");
    const db = new BetterSqlite3(":memory:");
    db.prepare("select 1 as value").get();
    db.close();
    return true;
  } catch (error) {
    return false;
  }
}

function runRebuild() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npmCommand, ["rebuild", "better-sqlite3"], {
    stdio: "inherit",
    shell: false,
  });
}

if (canUseBetterSqlite3()) {
  console.log("[better-sqlite3] 当前模块可用，跳过重建。");
  process.exit(0);
}

console.log("[better-sqlite3] 检测到模块不可用，开始重建。");
const result = runRebuild();

if (result.status === 0 && canUseBetterSqlite3()) {
  console.log("[better-sqlite3] 重建成功。");
  process.exit(0);
}

if (canUseBetterSqlite3()) {
  console.warn("[better-sqlite3] 重建返回异常，但当前模块已可用，继续启动。");
  process.exit(0);
}

console.error("[better-sqlite3] 重建后仍不可用，请先关闭占用该模块的 node/electron 进程后重试。");
process.exit(result.status ?? 1);
