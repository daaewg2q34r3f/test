import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

const SYSTEM_PROMPT = `你是一位专业的短剧剧集结构设计师，擅长：
- 剧集大纲设计与情节规划
- 强冲突结构与悬念钩子设计
- 角色弧线与情绪曲线规划
- 爆款短剧的起承转合技巧
- 让观众追剧上头的节奏把控

请用简洁、专业、有启发性的方式回答用户关于剧集大纲创作的问题。`;

// SSE 流式聊天（大纲专属）
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
      console.error("[chatOutline] 流式生成失败:", e?.message);
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "生成失败" })}\n\n`);
    } finally {
      res.end();
    }
  }
);
