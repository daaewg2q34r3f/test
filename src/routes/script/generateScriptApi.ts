import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { generateScript } from "@/utils/generateScript";
const router = express.Router();
interface NovelChapter {
  id: number;
  reel: string;
  chapter: string;
  chapterData: string;
  projectId: number;
}
function mergeNovelText(novelData: NovelChapter[]): string {
  if (!Array.isArray(novelData)) return "";
  return novelData
    .map((chap) => {
      return `${chap.chapter.trim()}\n\n${chap.chapterData.trim().replace(/\r?\n/g, "\n")}\n`;
    })
    .join("\n");
}

// 生成剧本
export default router.post(
  "/",
  validateFields({
    outlineId: z.number(),
    scriptId: z.number(),
  }),
  async (req, res) => {
    const { outlineId, scriptId } = req.body;
    console.log(`[generateScript] outlineId=${outlineId} scriptId=${scriptId}`);
    const outlineData = await u.db("t_outline").where("id", outlineId).select("*").first();
    if (!outlineData) {
      console.log(`[generateScript] 大纲不存在: outlineId=${outlineId}`);
      return res.status(500).send(success({ message: "大纲为空" }));
    }
    const parameter = JSON.parse(outlineData.data!);
    console.log(`[generateScript] chapterRange=${JSON.stringify(parameter.chapterRange)} projectId=${outlineData.projectId}`);

    const novelQuery = u.db("t_novel").where("projectId", outlineData.projectId).select("*");
    if (parameter.chapterRange && parameter.chapterRange.length > 0) {
      novelQuery.whereIn("chapterIndex", parameter.chapterRange);
    }
    const novelData = (await novelQuery) as NovelChapter[];

    console.log(`[generateScript] 找到原文章节数: ${novelData.length}`);
    if (novelData.length == 0) return res.status(500).send(success({ message: "原文为空，请先在「小说原文」中上传原文" }));

    const result: string = mergeNovelText(novelData);

    const data = await generateScript(parameter ?? "", result ?? "");
    if (!data) return res.status(500).send({ message: "生成剧本失败" });

    await u.db("t_script").where("id", scriptId).update({
      content: data,
    });

    res.status(200).send(success({ message: "生成剧本成功" }));
  },
);
