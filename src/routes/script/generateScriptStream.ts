import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

interface Scene { name: string; description: string }
interface Character { name: string; description: string }
interface Prop { name: string; description: string }

function buildPrompt(episode: any, novelData: string): string {
  const scenesStr = (episode.scenes || [])
    .map((s: Scene, i: number) => `  场景${i + 1}：${s.name}\n    环境描写：${s.description}`)
    .join("\n");
  const charsStr = (episode.characters || [])
    .map((c: Character, i: number) => `  角色${i + 1}：${c.name}\n    人设样貌：${c.description}`)
    .join("\n");
  const propsStr = (episode.props || [])
    .map((p: Prop, i: number) => `  道具${i + 1}：${p.name}\n    样式描写：${p.description}`)
    .join("\n");
  const labels = ["起", "承", "转", "合"];
  const keyEventsStr = (episode.keyEvents || [])
    .map((e: string, i: number) => `  【${labels[i] || i + 1}】${e}`)
    .join("\n");
  const quotesStr = (episode.classicQuotes || [])
    .map((q: string, i: number) => `  金句${i + 1}：「${q}」`)
    .join("\n");
  const highlightsStr = (episode.visualHighlights || [])
    .map((h: string, i: number) => `  镜头${i + 1}：${h}`)
    .join("\n");

  const episodeBlock = `
═══════════════════════════════════════
第${episode.episodeIndex}集：${episode.title}
关联章节：第${(episode.chapterRange || []).join("、")}章
═══════════════════════════════════════

【场景列表】必须全部使用
${scenesStr}

【出场角色】必须全部使用，首次出场需完整描述外貌
${charsStr}

【关键道具】必须全部展示
${propsStr}

【核心矛盾】贯穿全集的主线冲突
${episode.coreConflict}

【剧情主干】⚠️ 最高优先级，剧本必须严格按此顺序展开
${episode.outline}

【开场镜头】⚠️ 必须作为剧本第一个镜头
${episode.openingHook}

【剧情节点】必须严格按顺序呈现（起→承→转→合）
${keyEventsStr}

【情绪曲线】
${episode.emotionalCurve}

【视觉重点】
${highlightsStr}

【结尾悬念】必须作为收尾，后接【黑屏】
${episode.endingHook}

【黄金金句】必须原文出现在高潮段落
${quotesStr}
`;

  return `请根据以下结构化大纲生成剧本。

【强制要求】
1. 严格按【剧情主干】顺序展开剧情
2. 【开场镜头】必须是剧本的第一个镜头
3. 【剧情节点】四步严格按顺序呈现：起→承→转→合
4. classicQuotes必须原文出现在高潮段落
5. endingHook必须作为收尾
6. 500-800字，以【黑屏】结尾

═══════════════════════════════════════
大纲数据
═══════════════════════════════════════
${episodeBlock}

═══════════════════════════════════════
原文参考（仅用于补充细节和对话优化）
═══════════════════════════════════════
${novelData}`;
}

// SSE 流式生成单集剧本
export default router.post(
  "/",
  validateFields({
    scriptId: z.number(),
    outlineId: z.number(),
  }),
  async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (req.socket as any)?.setNoDelay?.(true);
    res.flushHeaders();

    const { scriptId, outlineId } = req.body;

    let langConfig: any;
    try {
      langConfig = await u.getConfig("language");
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "语言模型未配置" })}\n\n`);
      res.end();
      return;
    }

    const outlineData = await u.db("t_outline").where("id", outlineId).first();
    if (!outlineData) {
      res.write(`data: ${JSON.stringify({ type: "error", text: "大纲不存在" })}\n\n`);
      res.end();
      return;
    }

    const episode = JSON.parse(outlineData.data || "{}");

    const novelQuery = u.db("t_novel").where("projectId", outlineData.projectId).select("*");
    if (episode.chapterRange && episode.chapterRange.length > 0) {
      novelQuery.whereIn("chapterIndex", episode.chapterRange);
    }
    const novelRows = await novelQuery as any[];
    const novelText = novelRows
      .map((c: any) => `${c.chapter}\n\n${c.chapterData}`)
      .join("\n\n");

    const prompts = await u.db("t_prompts").where("code", "script").first();
    const systemPrompt = prompts?.customValue || prompts?.defaultValue || "你是一位专业的短剧编剧";
    const userPrompt = buildPrompt(episode, novelText);

    try {
      const result = await u.ai.text.stream(
        { system: systemPrompt, prompt: userPrompt },
        langConfig
      );

      let fullContent = "";
      for await (const chunk of result.textStream) {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
        (res as any).flush?.();
      }

      // 生成完毕后保存到 DB
      await u.db("t_script").where("id", scriptId).update({ content: fullContent });
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (e: any) {
      console.error("[generateScriptStream] 失败:", e?.message);
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "生成失败" })}\n\n`);
    } finally {
      res.end();
    }
  }
);
