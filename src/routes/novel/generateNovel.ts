import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

const START_TAG = "[CHAPTER]";
const END_TAG = "[/CHAPTER]";

// 流式生成章节，每完成一章立即通过 SSE 推送
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    inspiration: z.string().min(1),
    theme: z.string().min(1),
    title: z.string().min(1),
    chapterCount: z.number().min(1).max(30),
    wordsPerChapter: z.number().min(50).max(1000).optional(),
  }),
  async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (req.socket as any)?.setNoDelay?.(true);
    res.flushHeaders();

    const { projectId, inspiration, theme, title, chapterCount, wordsPerChapter = 300 } = req.body;

    let langConfig: { model: string; apiKey: string; baseURL: string };
    try {
      langConfig = await u.getConfig("language");
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "语言模型未配置" })}\n\n`);
      res.end();
      return;
    }

    const prompt = `请根据以下信息，为短剧创作 ${chapterCount} 个章节的故事内容。

题目：${title}
主题：${theme}
故事灵感：${inspiration}
章节数：${chapterCount}
每章字数：${wordsPerChapter} 字左右

【输出格式】严格按以下格式逐章输出，不要有其他内容：

[CHAPTER]{"chapter":"第1章 标题","chapterData":"章节正文内容"}[/CHAPTER]
[CHAPTER]{"chapter":"第2章 标题","chapterData":"章节正文内容"}[/CHAPTER]
...

要求：
- 短剧风格，节奏紧凑，每章结尾留悬念或钩子
- chapterData 每章约 ${wordsPerChapter} 字
- 必须生成恰好 ${chapterCount} 个章节`;

    // 获取当前最大 chapterIndex，续接
    const existing = await u.db("t_novel").where({ projectId }).orderBy("chapterIndex", "desc").first();
    const startIndex = (existing?.chapterIndex ?? 0) + 1;
    let chapterIdx = 0;

    try {
      const result = await u.ai.text.stream(
        {
          system: "你是一位专业的短剧编剧，擅长创作节奏紧凑、情节跌宕、让观众欲罢不能的短视频剧本故事。",
          prompt,
        },
        langConfig
      );

      let buffer = "";

      for await (const chunk of result.textStream) {
        buffer += chunk;

        // 扫描并提取所有完整的 [CHAPTER]...[/CHAPTER] 块
        let pos = 0;
        while (true) {
          const start = buffer.indexOf(START_TAG, pos);
          if (start === -1) break;
          const end = buffer.indexOf(END_TAG, start + START_TAG.length);
          if (end === -1) break;

          const jsonStr = buffer.substring(start + START_TAG.length, end).trim();
          try {
            const ch = JSON.parse(jsonStr);
            const idx = startIndex + chapterIdx;
            const [id] = await u.db("t_novel").insert({
              projectId,
              chapterIndex: idx,
              reel: `第${idx}集`,
              chapter: ch.chapter || `第${idx}章`,
              chapterData: ch.chapterData || "",
              createTime: Date.now(),
            });
            chapterIdx++;
            res.write(
              `data: ${JSON.stringify({
                type: "chapter",
                chapter: { id, index: idx, reel: `第${idx}集`, chapter: ch.chapter, chapterData: ch.chapterData },
              })}\n\n`
            );
            (res as any).flush?.();
            }
        //2026-4-18 23:16生成格式问题尝试修复

//            catch (e) {
//             console.error("[generateNovel] 章节解析失败:", e);
//           }
          catch (e) {
              console.error("[generateNovel] 章节解析失败，尝试修复:", e);

              // 容错：用正则单独提取 chapter 和 chapterData 字段
              const chapterMatch = jsonStr.match(/"chapter"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              const dataMatch = jsonStr.match(/"chapterData"\s*:\s*"((?:[^"\\]|\\.)*)"/)
                ?? jsonStr.match(/"chapterData"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);

              if (chapterMatch || dataMatch) {
                const ch = {
                  chapter: chapterMatch?.[1] ?? `第${startIndex + chapterIdx}章`,
                  chapterData: dataMatch?.[1]?.replace(/\\n/g, "\n") ?? "",
                };
                const idx = startIndex + chapterIdx;
                const [id] = await u.db("t_novel").insert({
                  projectId,
                  chapterIndex: idx,
                  reel: `第${idx}集`,
                  chapter: ch.chapter,
                  chapterData: ch.chapterData,
                  createTime: Date.now(),
                });
                chapterIdx++;
                res.write(
                  `data: ${JSON.stringify({
                    type: "chapter",
                    chapter: { id, index: idx, reel: `第${idx}集`, chapter: ch.chapter, chapterData: ch.chapterData },
                  })}\n\n`
                );
                (res as any).flush?.();
              }
            }
          pos = end + END_TAG.length;
        }

        // 只保留未处理的尾部
        buffer = buffer.substring(pos);
      }

      res.write(`data: ${JSON.stringify({ type: "done", count: chapterIdx })}\n\n`);
    } catch (e: any) {
      console.error("[generateNovel] 流式生成失败:", e?.message);
      res.write(`data: ${JSON.stringify({ type: "error", text: e?.message ?? "生成失败" })}\n\n`);
    } finally {
      res.end();
    }
  }
);
