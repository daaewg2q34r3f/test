import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

const SYSTEM_PROMPT = `你是一位专业的短剧剧本写作顾问，擅长：
- 短剧对白创作与台词优化
- 场景描述与视觉化表达
- 情节节奏把控与张力设计
- 开场白与结尾悬念设计
- 短视频平台的剧本格式规范

请用简洁、专业的方式回答用户关于剧本创作的问题。`;

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

    let langConfig: any;
    try {
      langConfig = await u.getConfig("language");
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "语言模型未配置" })}\n\n`);
      res.end();
      return;
    }

    try {
      const result = await u.ai.text.stream({ system: SYSTEM_PROMPT, messages }, langConfig);

      for await (const chunk of result.textStream) {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
        (res as any).flush?.();
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "生成失败" })}\n\n`);
    } finally {
      res.end();
    }
  }
);
