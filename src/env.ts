import { readFileSync, existsSync } from "fs";
import path from "path";

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function getEnvCandidates(envFileName = ".env.local") {
  const candidates = [path.join(process.cwd(), envFileName)];
  if (typeof process.versions?.electron !== "undefined") {
    const { app } = require("electron");
    candidates.unshift(path.join(app.getPath("userData"), envFileName));
  }
  return candidates;
}

function loadEnvFile(envFileName = ".env.local") {
  const envPath = getEnvCandidates(envFileName).find((candidate) => existsSync(candidate));
  if (!envPath) {
    console.log(`[env] ${envFileName} not found`);
    return;
  }

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    process.env[parsed.key] = parsed.value;
  }

  console.log(`[env] loaded ${envPath}`);
}

loadEnvFile(".env.local");
loadEnvFile(".env.tunnel");
