import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
import { parse as parseJsonBestEffort } from "best-effort-json-parser";

const router = express.Router();

const START_TAG = "[OUTLINE]";
const END_TAG = "[/OUTLINE]";

type OutlinePayload = {
  episodeIndex?: number;
  title?: string;
  coreConflict?: string;
  outline?: string;
  openingHook?: string;
  keyEvents?: unknown[];
  emotionalCurve?: string;
  endingHook?: string;
  characters?: unknown[];
  scenes?: unknown[];
  props?: unknown[];
  [key: string]: unknown;
};

function pickJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text.trim();
  return text.slice(start, end + 1).trim();
}

function normalizeOutlinePayload(value: unknown): OutlinePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("模型返回内容不是 JSON 对象");
  }

  const outline = value as OutlinePayload;
  outline.keyEvents = Array.isArray(outline.keyEvents) ? outline.keyEvents : [];
  outline.characters = Array.isArray(outline.characters) ? outline.characters : [];
  outline.scenes = Array.isArray(outline.scenes) ? outline.scenes : [];
  outline.props = Array.isArray(outline.props) ? outline.props : [];
  return outline;
}

function parseOutlinePayload(rawText: string): OutlinePayload {
  const jsonText = pickJsonObject(rawText);
  try {
    return normalizeOutlinePayload(JSON.parse(jsonText));
  } catch (strictError) {
    try {
      return normalizeOutlinePayload(parseJsonBestEffort(jsonText));
    } catch (bestEffortError) {
      throw bestEffortError instanceof Error ? bestEffortError : strictError;
    }
  }
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    episodeCount: z.number().min(1).max(100),
    notes: z.string().optional(),
  }),
  async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (req.socket as any)?.setNoDelay?.(true);
    res.flushHeaders();

    const { projectId, episodeCount, notes = "" } = req.body;

    let langConfig: { model: string; apiKey: string; baseURL: string };
    try {
      langConfig = await u.getConfig("language");
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "语言模型未配置" })}\n\n`);
      res.end();
      return;
    }

    const chapters = await u.db("t_novel").where({ projectId }).orderBy("chapterIndex", "asc").select("*");
    const chapterSummary =
      chapters.length > 0
        ? chapters.map((c: any) => `【${c.reel} ${c.chapter}】\n${c.chapterData}`).join("\n\n")
        : "（暂无故事章节，请根据项目背景自行发挥）";

    const existing = await u.db("t_outline").where({ projectId }).orderBy("episode", "desc").first();
    const startEpisode = (existing?.episode ?? 0) + 1;

    const notesLine = notes ? `\n【创作备注】${notes}` : "";

    const prompt = `你是一位专业短剧编剧。请根据以下故事内容，为短剧创作 ${episodeCount} 集的剧集大纲。${notesLine}

【故事原文（共 ${chapters.length} 章）】
${chapterSummary}

【输出格式】
逐集输出，每一集必须用 ${START_TAG} 和 ${END_TAG} 包住一个 JSON 对象。
不要输出 Markdown，不要输出代码块，不要在标签外解释。

单集格式示例：
${START_TAG}{"episodeIndex":1,"title":"第1集 标题","coreConflict":"本集核心冲突","outline":"剧情主干，100-200字，按时间顺序","openingHook":"开场抓眼镜头","keyEvents":["起：开端事件","承：发展事件","转：转折事件","合：本集结局"],"emotionalCurve":"如：2(压抑)->6(爆发)->3(余波)","endingHook":"结尾悬念钩子","characters":[{"name":"角色名","description":"本集角色定位"}],"scenes":[{"name":"场景名","description":"场景氛围"}],"props":[{"name":"道具名","description":"道具样式、材质、状态和剧情用途"}]}${END_TAG}

要求：
- 必须生成恰好 ${episodeCount} 集，集数从第 ${startEpisode} 集开始编号。
- 情节必须忠实于上方故事原文，覆盖所有章节内容。
- 节奏紧凑，每集结尾保留强悬念。
- 每集必须输出 characters、scenes、props 三个数组。
- props 只放剧情中明确出现或有叙事作用的道具，至少 1 个，禁止省略 props 字段。
- JSON 字符串内部如果出现英文双引号，必须转义为 \\"。`;

    let episodeIdx = 0;

    try {
      const result = await u.ai.text.stream(
        {
          system: "你是一位专业短剧编剧，擅长将故事原文改编为节奏紧凑、情节跌宕的短视频剧集大纲。你必须严格输出可解析 JSON。",
          prompt,
        },
        langConfig,
      );

      let buffer = "";
      let parseFailureCount = 0;
      let lastParseError = "";

      for await (const chunk of result.textStream) {
        buffer += chunk;

        let pos = 0;
        while (true) {
          const start = buffer.indexOf(START_TAG, pos);
          if (start === -1) break;
          const end = buffer.indexOf(END_TAG, start + START_TAG.length);
          if (end === -1) break;

          const jsonStr = buffer.substring(start + START_TAG.length, end).trim();
          try {
            const outline = parseOutlinePayload(jsonStr);
            const episode = startEpisode + episodeIdx;
            outline.episodeIndex = episode;

            const [id] = await u.db("t_outline").insert({
              projectId,
              episode,
              data: JSON.stringify(outline),
            });

            episodeIdx++;
            res.write(
              `data: ${JSON.stringify({
                type: "outline",
                outline: { id, episode, projectId, data: JSON.stringify(outline) },
              })}\n\n`,
            );
            (res as any).flush?.();
          } catch (e: any) {
            parseFailureCount++;
            lastParseError = e?.message ?? String(e);
            console.error("[generateOutline] 解析失败:", lastParseError, jsonStr.slice(0, 1200));
          }

          pos = end + END_TAG.length;
        }

        buffer = buffer.substring(pos);
      }

      if (episodeIdx === 0 && parseFailureCount > 0) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            text: `模型返回的大纲格式无法解析：${lastParseError}`,
          })}\n\n`,
        );
      }

      res.write(`data: ${JSON.stringify({ type: "done", count: episodeIdx })}\n\n`);
    } catch (e: any) {
      console.error("[generateOutline] 流式生成失败:", e?.message);
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "生成失败" })}\n\n`);
    } finally {
      res.end();
    }
  },
);
