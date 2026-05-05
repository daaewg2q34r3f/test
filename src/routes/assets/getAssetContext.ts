import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 获取资产在剧本中的相关段落，用于前端展示"剧情参考"
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    name: z.string(),
  }),
  async (req, res) => {
    const { projectId, name } = req.body;

    // 1. 找出包含该资产的大纲及对应剧本
    const allOutlines = await u.db("t_outline").where("projectId", projectId).select("id", "data");
    const relevantOutlineIds: number[] = [];
    for (const outline of allOutlines) {
      try {
        const d = JSON.parse(outline.data || "{}");
        const allItems = [
          ...(d.characters || []),
          ...(d.scenes || []),
          ...(d.props || []),
        ];
        if (allItems.some((item: any) => item.name === name)) {
          relevantOutlineIds.push(outline.id);
        }
      } catch { /**/ }
    }

    const results: Array<{ scriptName: string; excerpt: string; episodeIndex?: number }> = [];
    const seen = new Set<string>();

    const processScript = (scriptName: string, content: string, episodeIndex?: number) => {
      let idx = content.indexOf(name);
      while (idx !== -1 && results.filter(r => r.scriptName === scriptName).length < 3) {
        const start = Math.max(0, idx - 150);
        const end = Math.min(content.length, idx + 250);
        const excerpt = content.slice(start, end).replace(/\n{3,}/g, "\n").trim();
        const key = `${scriptName}::${excerpt.slice(0, 50)}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ scriptName, excerpt: `...${excerpt}...`, episodeIndex });
        }
        idx = content.indexOf(name, idx + name.length);
      }
    };

    // 2. 拉取相关大纲的剧本
    if (relevantOutlineIds.length > 0) {
      const scripts = await u
        .db("t_script")
        .whereIn("outlineId", relevantOutlineIds)
        .andWhere("projectId", projectId)
        .select("name", "content", "outlineId");

      // 获取 episode 信息
      const outlineMap: Record<number, any> = {};
      for (const o of allOutlines) {
        try {
          outlineMap[o.id] = JSON.parse(o.data || "{}");
        } catch { /**/ }
      }

      for (const s of scripts) {
        if (!s.content) continue;
        const episodeIndex = outlineMap[s.outlineId]?.episodeIndex;
        processScript(s.name, s.content, episodeIndex);
      }
    }

    // 3. 若关联大纲找不到，全局搜索
    if (results.length === 0) {
      const allScripts = await u
        .db("t_script")
        .where("projectId", projectId)
        .whereRaw("content LIKE ?", [`%${name}%`])
        .select("name", "content");
      for (const s of allScripts) {
        if (!s.content) continue;
        processScript(s.name, s.content);
      }
    }

    res.status(200).send(success(results));
  }
);
