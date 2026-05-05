import fs from "fs";
import path from "path";

type AIInputLog = {
  stage?: string;
  action: string;
  targetId?: string | number;
  model?: string;
  manufacturer?: string;
  systemPrompt?: string;
  prompt?: string;
  messages?: unknown;
  images?: Array<string | { role?: string; path: string }>;
  extra?: Record<string, unknown>;
};

const MAX_TEXT_LENGTH = 120_000;

function pad(num: number) {
  return String(num).padStart(2, "0");
}

function getTimeParts(date = new Date()) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const millisecond = String(date.getMilliseconds()).padStart(3, "0");
  return {
    dayDir: `${year}-${month}-${day}`,
    stamp: `${year}${month}${day}_${hour}${minute}${second}_${millisecond}`,
    iso: date.toISOString(),
  };
}

function safeName(value?: string | number) {
  return String(value ?? "ai")
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "ai";
}

function trimLongText(value: string) {
  if (value.length <= MAX_TEXT_LENGTH) return value;
  return `${value.slice(0, MAX_TEXT_LENGTH)}\n...[truncated ${value.length - MAX_TEXT_LENGTH} chars]`;
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(value)) {
      return `[base64 image omitted, chars=${value.length}]`;
    }
    return trimLongText(value);
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/apiKey|authorization|token|secret|password/i.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitize(item);
  }
  return result;
}

export async function logAIInput(input: AIInputLog) {
  try {
    const { dayDir, stamp, iso } = getTimeParts();
    const logDir = path.join(process.cwd(), "logs", "ai-inputs", dayDir);
    await fs.promises.mkdir(logDir, { recursive: true });

    const name = [
      stamp,
      safeName(input.stage),
      safeName(input.action),
      input.targetId !== undefined ? safeName(input.targetId) : "",
    ].filter(Boolean).join("_");

    const payload = sanitize({
      time: iso,
      stage: input.stage,
      action: input.action,
      targetId: input.targetId,
      model: input.model,
      manufacturer: input.manufacturer,
      systemPrompt: input.systemPrompt,
      prompt: input.prompt,
      messages: input.messages,
      images: input.images,
      extra: input.extra,
    });

    await fs.promises.writeFile(path.join(logDir, `${name}.json`), JSON.stringify(payload, null, 2), "utf8");
  } catch (err: any) {
    console.warn("[AI输入日志] 写入失败:", err?.message || err);
  }
}
