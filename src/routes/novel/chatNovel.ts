import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

const SYSTEM_PROMPT = `你是一位专业的短剧创作顾问，擅长：
- 故事结构设计、情节起伏规划
- 角色塑造与人物关系
- 爆款短剧选题与主题提炼
- 章节内容构思与细节打磨

请用简洁、专业、有启发性的方式回答用户关于短剧创作的问题。
回复语言简洁，重点突出，适合短视频平台的叙事节奏。`;

// SSE 流式聊天接口
export default router.post(
  "/",
  validateFields({
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    ).min(1),
  }),
  async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    // 禁用 TCP Nagle 算法，让每个 chunk 立即发出，不等待合包
    (req.socket as any)?.setNoDelay?.(true);
    res.flushHeaders();

    const { messages } = req.body;

    let langConfig: { model: string; apiKey: string; baseURL: string };
    try {
      langConfig = await u.getConfig("language");
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "语言模型未配置" })}\n\n`);
      res.end();
      return;
    }

    try {
      const result = await u.ai.text.stream(
        { system: SYSTEM_PROMPT, messages },
        langConfig
      );

      for await (const chunk of result.textStream) {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
        (res as any).flush?.();
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (e: any) {
      console.error("[chatNovel] 流式生成失败:", e?.message);
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "生成失败" })}\n\n`);
    } finally {
      res.end();
    }
  }
);
