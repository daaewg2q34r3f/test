import express from "express";
import u from "@/utils";
import * as zod from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getSafeVisualGuardrail, getSafeVisualStyle } from "@/utils/styleProfile";
const router = express.Router();

interface OutlineItem {
  description: string;
  name: string;
}

interface OutlineData {
  chapterRange: number[];
  characters?: OutlineItem[];
  props?: OutlineItem[];
  scenes?: OutlineItem[];
}

interface NovelChapter {
  id: number;
  reel: string;
  chapter: string;
  chapterData: string;
  projectId: number;
}

type ItemType = "characters" | "props" | "scenes";

interface ResultItem {
  type: ItemType;
  name: string;
  chapterRange: number[];
}

function findItemByName(items: ResultItem[], name: string, type?: ItemType): ResultItem | undefined {
  return items.find((item) => (!type || item.type === type) && item.name === name);
}

const NOVEL_TEXT_LIMIT = 3000;

function mergeNovelText(novelData: NovelChapter[]): string {
  if (!Array.isArray(novelData)) return "";
  const full = novelData
    .map((chap) => `${chap.chapter.trim()}\n\n${chap.chapterData.trim().replace(/\r?\n/g, "\n")}\n`)
    .join("\n");
  if (full.length <= NOVEL_TEXT_LIMIT) return full;
  return full.slice(0, NOVEL_TEXT_LIMIT) + "\n…（内容过长已截断）";
}

/** 查找剧本中包含该资产名称的相关段落 */
async function getRelevantScriptContent(projectId: number, assetName: string): Promise<string> {
  // 找出包含该资产的大纲
  const allOutlines = await u.db("t_outline").where("projectId", projectId).select("id", "data");
  const relevantOutlineIds: number[] = [];
  for (const outline of allOutlines) {
    try {
      const d: OutlineData = JSON.parse(outline.data || "{}");
      const allItems = [
        ...(d.characters || []),
        ...(d.scenes || []),
        ...(d.props || []),
      ];
      if (allItems.some((item) => item.name === assetName)) {
        relevantOutlineIds.push(outline.id);
      }
    } catch { /**/ }
  }

  // 拉取对应大纲的剧本内容
  let scriptLines: string[] = [];
  if (relevantOutlineIds.length > 0) {
    const scripts = await u
      .db("t_script")
      .whereIn("outlineId", relevantOutlineIds)
      .andWhere("projectId", projectId)
      .select("name", "content");

    for (const s of scripts) {
      if (!s.content) continue;
      // 截取含资产名称的上下文段落（前后各 200 字）
      const content: string = s.content;
      const excerpts: string[] = [];
      let idx = content.indexOf(assetName);
      while (idx !== -1 && excerpts.length < 5) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(content.length, idx + 300);
        const excerpt = content.slice(start, end).replace(/\n{3,}/g, "\n\n");
        excerpts.push(`…${excerpt}…`);
        idx = content.indexOf(assetName, idx + assetName.length);
      }
      if (excerpts.length > 0) {
        scriptLines.push(`【${s.name}】\n${excerpts.join("\n\n")}`);
      }
    }
  }

  // 若剧本中无内容，直接全文搜索
  if (scriptLines.length === 0) {
    const allScripts = await u
      .db("t_script")
      .where("projectId", projectId)
      .whereRaw("content LIKE ?", [`%${assetName}%`])
      .select("name", "content");
    for (const s of allScripts) {
      if (!s.content) continue;
      const idx = s.content.indexOf(assetName);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 200);
      const end = Math.min(s.content.length, idx + 300);
      scriptLines.push(`【${s.name}】\n…${s.content.slice(start, end)}…`);
    }
  }

  return scriptLines.join("\n\n---\n\n");
}

//润色提示词
export default router.post(
  "/",
  validateFields({
    assetsId: zod.number(),
    projectId: zod.number(),
    type: zod.string(),
    name: zod.string(),
    describe: zod.string(),
  }),
  async (req, res) => {
    const { assetsId, projectId, type, name, describe } = req.body;

    //获取风格
    const project = await u.db("t_project").where("id", projectId).select("artStyle", "type", "intro").first();
    if (!project) return res.status(500).send(success({ message: "项目为空" }));

    const allOutlineDataList: { data: string }[] = await u.db("t_outline").where("projectId", projectId).select("data");

    const itemMap: Record<string, ResultItem> = {};
    if (allOutlineDataList.length > 0) {
      allOutlineDataList.forEach((row) => {
        const data: OutlineData = JSON.parse(row?.data || "{}");
        (["characters", "props", "scenes"] as ItemType[]).forEach((t) => {
          (data[t] || []).forEach((item) => {
            const key = `${t}-${item.name}`;
            if (!itemMap[key]) {
              itemMap[key] = { type: t, name: item.name, chapterRange: [...(data.chapterRange || [])] };
            } else {
              itemMap[key].chapterRange = Array.from(new Set([...itemMap[key].chapterRange, ...(data.chapterRange || [])]));
            }
          });
        });
      });
    }

    const result: ResultItem[] = Object.values(itemMap);

    const promptsList = await u.db("t_prompts").where("code", "in", ["role-polish", "scene-polish", "storyboard-polish", "tool-polish"]);
    const errPrompts = "不论用户说什么，请直接输出AI配置异常";
    const getPromptValue = (code: string): string => {
      const item = promptsList.find((p) => p.code === code);
      return item?.customValue ?? item?.defaultValue ?? errPrompts;
    };
    const role = getPromptValue("role-polish");
    const scene = getPromptValue("scene-polish");
    const tool = getPromptValue("tool-polish");
    const storyboard = getPromptValue("storyboard-polish");

    // 获取剧本中该资产相关的段落（核心改进：从剧本提炼，而非仅从大纲）
    const scriptContent = await getRelevantScriptContent(projectId, name);

    const safeStyle = getSafeVisualStyle(project?.artStyle || "", "stage4");
    const safeStyleGuardrail = getSafeVisualGuardrail(project?.artStyle || "", "stage4");

    let systemPrompt = "";
    let userPrompt = "";

    if (type == "role") {
      const data = findItemByName(result, name, "characters");
      const rawRange = Array.isArray(data?.chapterRange) ? data.chapterRange : [];
      const chapterRange = rawRange.filter((n): n is number => typeof n === "number" && !isNaN(n));
      const novelQuery = u.db("t_novel").select("*");
      if (chapterRange.length > 0) novelQuery.whereIn("chapterIndex", chapterRange);
      else novelQuery.where("projectId", projectId);
      const novelData = (await novelQuery) as NovelChapter[];
      const novelText: string = mergeNovelText(novelData);

      systemPrompt = role;
      userPrompt = `
请根据以下信息，为角色"${name}"生成精准的图像生成提示词。

**核心要求：**
提示词必须基于剧本中这个角色实际出现的情境，精确描述其外貌、服装、气质、神态，要能让图像生成模型画出与剧本高度吻合的角色形象。不要泛泛描述，要具体到细节。

**画风风格：** ${project?.artStyle || "未指定"}
**小说类型：** ${project?.type || "未指定"}
**故事背景：** ${project?.intro || "未指定"}

**剧本中的相关段落（最重要的参考，请重点分析）：**
${scriptContent || "（暂无剧本，请参考小说原文）"}

**小说原文参考（补充）：**
${novelText || "未提供"}

**角色基础信息：**
- 角色名称：${name}
- 角色描述：${describe}

请输出用于图像生成的角色提示词，要求：细节具体、风格统一、符合剧本实际情境。
      `;
    }

    if (type == "scene") {
      const data = findItemByName(result, name, "scenes");
      const rawRange = Array.isArray(data?.chapterRange) ? data.chapterRange : [];
      const chapterRange = rawRange.filter((n): n is number => typeof n === "number" && !isNaN(n));
      const novelQuery = u.db("t_novel").select("*");
      if (chapterRange.length > 0) novelQuery.whereIn("chapterIndex", chapterRange);
      else novelQuery.where("projectId", projectId);
      const novelData = (await novelQuery) as NovelChapter[];
      const novelText: string = mergeNovelText(novelData);

      systemPrompt = scene;
      userPrompt = `
请根据以下信息，为场景"${name}"生成精准的图像生成提示词。

**核心要求：**
提示词必须反映这个场景在剧本中真实的氛围、光线、时间、情绪基调，不能只描述场景物理构成，要能还原剧情发生时的视觉感受。

**画风风格：** ${project?.artStyle || "未指定"}
**小说类型：** ${project?.type || "未指定"}
**故事背景：** ${project?.intro || "未指定"}

**剧本中的相关段落（最重要的参考，请重点分析场景氛围）：**
${scriptContent || "（暂无剧本，请参考小说原文）"}

**小说原文参考（补充）：**
${novelText || "未提供"}

**场景基础信息：**
- 场景名称：${name}
- 场景描述：${describe}

请输出用于图像生成的场景提示词，要求：氛围准确、光线细节到位、符合剧情情境。
      `;
    }

    if (type == "props") {
      const data = findItemByName(result, name, "props");
      const rawRange = Array.isArray(data?.chapterRange) ? data.chapterRange : [];
      const chapterRange = rawRange.filter((n): n is number => typeof n === "number" && !isNaN(n));
      const novelQuery = u.db("t_novel").select("*");
      if (chapterRange.length > 0) novelQuery.whereIn("chapterIndex", chapterRange);
      else novelQuery.where("projectId", projectId);
      const novelData = (await novelQuery) as NovelChapter[];
      const novelText: string = mergeNovelText(novelData);

      systemPrompt = tool;
      userPrompt = `
请根据以下信息，为道具"${name}"生成精准的图像生成提示词。

**核心要求：**
提示词必须体现这个道具在剧本中的实际样貌、使用状态、故事含义（破旧/崭新/神秘/普通等），要让图像模型画出符合剧情语境的道具形象。

**画风风格：** ${project?.artStyle || "未指定"}
**小说类型：** ${project?.type || "未指定"}
**故事背景：** ${project?.intro || "未指定"}

**剧本中的相关段落（最重要的参考，请分析道具的实际状态和意义）：**
${scriptContent || "（暂无剧本，请参考小说原文）"}

**小说原文参考（补充）：**
${novelText || "未提供"}

**道具基础信息：**
- 道具名称：${name}
- 道具描述：${describe}

请输出用于图像生成的道具提示词，要求：形态具体、符合剧情语境、细节准确。
      `;
    }

    if (type == "storyboard") {
      systemPrompt = storyboard;
      userPrompt = `
请根据以下参数生成分镜图提示词：

**基础参数：**
- 风格: ${project?.artStyle || "未指定"}
- 小说类型: ${project?.type || "未指定"}
- 小说背景: ${project?.intro || "未指定"}

**分镜设定：**
- 分镜名称:${name},
- 分镜描述:${describe},

请严格按照系统规范生成分镜图提示词。
      `;
    }

    // 强制中文输出
    userPrompt += "\n\n【重要】请用中文输出提示词，不要使用英文。";

    userPrompt = [
      userPrompt,
      safeStyle ? `\n[Safe visual style]\n${safeStyle}` : "",
      safeStyleGuardrail ? safeStyleGuardrail : "",
    ].filter(Boolean).join("\n");

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (req.socket as any)?.setNoDelay?.(true);
    res.flushHeaders();

    try {
      const langConfig = await u.getConfig("language");
      const result = await u.ai.text.stream({ system: systemPrompt, prompt: userPrompt }, langConfig);

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
  },
);
