import express from "express";
import u from "@/utils";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

interface ScenePlan {
  segmentId: number;
  title: string;
  summary: string;
  scene: string;
  characters: string[];
  props: string[];
  shotCount: number;
}

interface ScenePlanResult {
  recommendedCount: number;
  scenes: ScenePlan[];
}

interface ShotSlot {
  globalIndex: number;
  segmentId: number;
  shotIndex: number;
  sceneTitle: string;
  sceneSummary: string;
  scene: string;
  characters: string[];
  props: string[];
}

interface ShotItem {
  name: string;
  prompt: string;
  duration: number;
  segmentId: number;
  shotIndex: number;
  characters: string[];
  scene: string;
  props: string[];
  emotion: string;
  shotType: string;
}

const BATCH_SIZE = 8;
const IMAGE_FIXED_FORBIDDEN_PROMPT =
  "绝对禁止：低清晰度、模糊、噪点、压缩痕迹、文字水印、logo、画面边框；人物变形、面部崩坏、肢体或手指异常、多头多手、比例失调；主体缺失、关键肢体或道具被裁切、构图混乱、透视错误、空间错乱、穿模；光影方向矛盾、色彩严重失真、风格不统一、与参考角色/场景/道具不一致。";
const ANIME_STYLE_WORDS = ["动漫", "动画", "二次元", "漫画", "卡通"];
const ANIME_FORBIDDEN_CONFLICTS = ["卡通化", "非真实感"];

function getImageForbiddenPrompt(style: string) {
  if (!ANIME_STYLE_WORDS.some(word => style.includes(word))) return IMAGE_FIXED_FORBIDDEN_PROMPT;
  return ANIME_FORBIDDEN_CONFLICTS.reduce((result, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(`，?${escaped}`, "g"), "");
  }, IMAGE_FIXED_FORBIDDEN_PROMPT).replace(/：，/g, "：").replace(/，{2,}/g, "，");
}

function parseJsonArray(text: string): any[] {
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI输出中没有找到JSON数组");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("AI输出不是JSON数组");
  return parsed;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hasAny(text: string, words: string[]) {
  return words.some(word => text.includes(word));
}

function normalizeShotDuration(rawDuration: unknown, shot: {
  prompt: string;
  emotion: string;
  shotType: string;
  characters: string[];
  props: string[];
}) {
  const text = `${shot.prompt} ${shot.emotion} ${shot.shotType}`;
  const aiDuration = Number(rawDuration);
  let duration = Number.isFinite(aiDuration) && aiDuration > 0 ? clamp(Math.round(aiDuration), 2, 8) : 4;

  if (hasAny(text, ["空镜", "环境交代", "场景建立", "快速切换", "过渡", "反应镜头"])) {
    duration = 2;
  }

  if (hasAny(text, ["特写", "道具特写", "表情", "对视", "沉默", "停顿", "转头", "回眸", "凝视"])) {
    duration = Math.max(duration, 3);
  }

  if (hasAny(text, ["走向", "移动", "交谈", "注视", "拿起", "放下", "靠近", "坐下", "站起"])) {
    duration = Math.max(duration, 4);
  }

  if (hasAny(text, ["冲突", "质问", "推门", "转身", "揭示", "发现", "情绪变化", "关键动作", "信息揭示", "紧张", "悬疑"])) {
    duration = Math.max(duration, 5);
  }

  if (hasAny(text, ["奔跑", "追逐", "打斗", "爆发", "崩溃", "争执", "对峙", "多人调度", "强情绪", "激昂", "震惊"])) {
    duration = Math.max(duration, 6);
  }

  if (hasAny(text, ["高潮", "坍塌", "爆炸", "复杂调度", "强转场", "剧烈", "混乱"])) {
    duration = Math.max(duration, 7);
  }

  if (shot.characters.length >= 3 && duration >= 4) duration += 1;
  if (shot.props.length >= 2 && duration >= 4) duration += 1;

  if (hasAny(text, ["空镜", "道具特写", "反应镜头"]) && !hasAny(text, ["冲突", "爆发", "追逐", "打斗"])) {
    duration = Math.min(duration, 3);
  }

  return clamp(duration, 2, 8);
}

function distributeCounts(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  const safeWeights = weights.map((item) => Math.max(1, Number(item) || 1));
  const weightSum = safeWeights.reduce((sum, item) => sum + item, 0);
  const counts = safeWeights.map((item) => Math.max(1, Math.floor((item / weightSum) * total)));

  while (counts.reduce((sum, item) => sum + item, 0) < total) {
    const index = counts.indexOf(Math.min(...counts));
    counts[index] += 1;
  }
  while (counts.reduce((sum, item) => sum + item, 0) > total) {
    const index = counts.indexOf(Math.max(...counts));
    if (counts[index] <= 1) break;
    counts[index] -= 1;
  }

  return counts;
}

function estimateShotCountFromScript(scriptText: string, maxCount: number) {
  const shotMarkers = (scriptText.match(/△/g) || []).length;
  const transitionMarkers = (scriptText.match(/【转场/g) || []).length;
  const subtitleMarkers = (scriptText.match(/【字幕/g) || []).length;
  const blackMarkers = (scriptText.match(/【黑屏/g) || []).length;
  const sceneMarkers = (scriptText.match(/^※/gm) || []).length;
  const dialogueMarkers = (scriptText.match(/：|:/g) || []).length;

  const base = shotMarkers || Math.ceil(scriptText.length / 180);
  const estimate = base
    + transitionMarkers
    + subtitleMarkers
    + blackMarkers
    + Math.max(0, sceneMarkers - 1)
    + Math.floor(dialogueMarkers / 3);

  return clamp(estimate, Math.min(4, maxCount), maxCount);
}

function getRequiredCoverageGroups(scriptText: string): string[][] {
  const groups: string[][] = [];
  if (scriptText.includes("黑衣人")) groups.push(["黑衣人"]);
  if (/(追杀|追捕|紧追|追来|追逐|追不舍)/.test(scriptText)) groups.push(["追杀", "追捕", "紧追", "追逐", "追不舍"]);
  if (/(拔刀|刀剑出鞘|刀剑)/.test(scriptText)) groups.push(["拔刀", "刀剑", "出鞘"]);
  if (/(逃窜|奔跑|逃跑)/.test(scriptText)) groups.push(["逃窜", "奔跑", "逃跑"]);
  return groups;
}

function describeCoverageGroups(groups: string[][]) {
  return groups.length
    ? groups.map((group) => group.join("/")).join("、")
    : "无";
}

function findMissingCoverageGroups(shots: ShotItem[], groups: string[][]) {
  const text = shots.map((shot) => `${shot.name} ${shot.prompt} ${shot.emotion}`).join("\n");
  return groups.filter((group) => !group.some((word) => text.includes(word)));
}

const ACTION_SIMILARITY_KEYWORDS = [
  "发现", "注视", "凝视", "张望", "靠近", "走向", "伸手", "触碰", "拿起", "放下", "拉住", "松开",
  "询问", "开口", "说话", "摇头", "点头", "转头", "转身", "后退", "躲避", "出现", "拔刀", "冲来",
  "追赶", "追杀", "逃跑", "逃窜", "奔跑", "摔倒", "站起", "回头", "惊讶", "震惊", "恐惧", "慌乱",
  "光芒", "闪烁", "增强", "大盛", "闪白", "转场", "黑屏",
];

const SIMILARITY_STOP_PHRASES = [
  "承接上一镜头", "承接上一个分镜", "接上一分镜", "延续上一镜头", "经过", "画面", "场景是",
  "构图上", "景别为", "光影", "色彩", "保持", "动漫风格", "当前分镜", "上一分镜",
  "主体", "场景", "周围", "背景", "中心", "分镜", "镜头",
];

function normalizePromptForSimilarity(text: string) {
  let result = text.replace(/[，。、“”‘’：:；;！？!?（）()\[\]【】\s]/g, "");
  for (const phrase of SIMILARITY_STOP_PHRASES) {
    result = result.split(phrase).join("");
  }
  return result;
}

function getBigrams(text: string) {
  const normalized = normalizePromptForSimilarity(text);
  const bigrams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index++) {
    bigrams.add(normalized.slice(index, index + 2));
  }
  return bigrams;
}

function getJaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

function extractActionKeywords(text: string) {
  return new Set(ACTION_SIMILARITY_KEYWORDS.filter((word) => text.includes(word)));
}

function findOverSimilarAdjacentShots(shots: ShotItem[]) {
  const issues: { previous: ShotItem; current: ShotItem; similarity: number; sharedActions: string[] }[] = [];
  for (let index = 1; index < shots.length; index++) {
    const previous = shots[index - 1];
    const current = shots[index];
    const textSimilarity = getJaccardSimilarity(getBigrams(previous.prompt), getBigrams(current.prompt));
    const previousActions = extractActionKeywords(previous.prompt);
    const currentActions = extractActionKeywords(current.prompt);
    const sharedActions = [...previousActions].filter((word) => currentActions.has(word));
    const minActionCount = Math.min(previousActions.size, currentActions.size);
    const actionSimilarity = minActionCount > 0 ? sharedActions.length / minActionCount : 0;

    const tooSimilar = textSimilarity >= 0.82
      || (textSimilarity >= 0.68 && actionSimilarity >= 0.6 && sharedActions.length >= 2)
      || (textSimilarity >= 0.56 && actionSimilarity >= 0.85 && sharedActions.length >= 3);

    if (tooSimilar) {
      issues.push({ previous, current, similarity: textSimilarity, sharedActions });
    }
  }
  return issues;
}

function fallbackScenePlans(targetCount: number, outlineData: any): ScenePlan[] {
  const keyEvents = Array.isArray(outlineData?.keyEvents) && outlineData.keyEvents.length
    ? outlineData.keyEvents
    : ["开场建立", "冲突推进", "情绪转折", "高潮爆发", "结尾悬念"];
  const sceneCount = clamp(Math.round(targetCount / 6), 3, Math.min(8, targetCount));
  const counts = distributeCounts(new Array(sceneCount).fill(1), targetCount);
  const availableScenes = Array.isArray(outlineData?.scenes) ? outlineData.scenes : [];
  const availableCharacters = Array.isArray(outlineData?.characters) ? outlineData.characters.map((item: any) => String(item.name || item)) : [];
  const availableProps = Array.isArray(outlineData?.props) ? outlineData.props.map((item: any) => String(item.name || item)) : [];

  return counts.map((shotCount, index) => {
    const event = String(keyEvents[index % keyEvents.length] || `剧情段落${index + 1}`);
    const scene = availableScenes[index % Math.max(availableScenes.length, 1)];
    return {
      segmentId: index + 1,
      title: `第${index + 1}场`,
      summary: event,
      scene: String(scene?.name || scene || "待定场景"),
      characters: availableCharacters.slice(0, 4),
      props: availableProps.slice(0, 4),
      shotCount,
    };
  });
}

function normalizeScenePlans(rawPlans: any[], targetCount: number, outlineData: any): ScenePlan[] {
  const maxSceneCount = Math.max(1, Math.ceil(targetCount / 4));
  const validPlans = rawPlans
    .filter((item) => item && typeof item === "object")
    .slice(0, maxSceneCount)
    .map((item, index) => ({
      segmentId: index + 1,
      title: String(item.title || item.name || `第${index + 1}场`),
      summary: String(item.summary || item.description || item.event || ""),
      scene: String(item.scene || ""),
      characters: Array.isArray(item.characters) ? item.characters.map(String) : [],
      props: Array.isArray(item.props) ? item.props.map(String) : [],
      shotCount: Math.max(1, Number(item.shotCount) || Number(item.count) || 1),
    }));

  if (validPlans.length === 0) return fallbackScenePlans(targetCount, outlineData);

  const counts = distributeCounts(validPlans.map((item) => item.shotCount), targetCount);
  return validPlans.map((item, index) => ({
    ...item,
    segmentId: index + 1,
    shotCount: counts[index],
  }));
}

function normalizeScenePlanResult(raw: any, maxCount: number, outlineData: any, scriptText: string): ScenePlanResult {
  const scenesRaw = Array.isArray(raw) ? raw : Array.isArray(raw?.scenes) ? raw.scenes : [];
  const estimatedCount = estimateShotCountFromScript(scriptText, maxCount);
  const rawRecommended = Number(raw?.recommendedCount || raw?.shotCount || raw?.count);
  const recommendedCount = clamp(
    Math.max(Number.isFinite(rawRecommended) && rawRecommended > 0 ? Math.round(rawRecommended) : estimatedCount, estimatedCount),
    Math.min(4, maxCount),
    maxCount,
  );

  return {
    recommendedCount,
    scenes: normalizeScenePlans(scenesRaw, recommendedCount, outlineData),
  };
}

function fallbackScenePlanResult(maxCount: number, outlineData: any, scriptText: string): ScenePlanResult {
  const recommendedCount = estimateShotCountFromScript(scriptText, maxCount);
  return {
    recommendedCount,
    scenes: fallbackScenePlans(recommendedCount, outlineData),
  };
}

function expandScenePlans(scenePlans: ScenePlan[]): ShotSlot[] {
  const slots: ShotSlot[] = [];
  for (const plan of scenePlans) {
    for (let index = 0; index < plan.shotCount; index++) {
      slots.push({
        globalIndex: slots.length + 1,
        segmentId: plan.segmentId,
        shotIndex: index + 1,
        sceneTitle: plan.title,
        sceneSummary: plan.summary,
        scene: plan.scene,
        characters: plan.characters,
        props: plan.props,
      });
    }
  }
  return slots;
}

function normalizeShot(raw: any, slot: ShotSlot): ShotItem {
  const shot = {
    name: String(raw.name || `S${slot.segmentId}-${String(slot.shotIndex).padStart(2, "0")}`),
    prompt: String(raw.prompt || ""),
    segmentId: slot.segmentId,
    shotIndex: slot.shotIndex,
    characters: Array.isArray(raw.characters) ? raw.characters.map(String) : slot.characters,
    scene: String(raw.scene || slot.scene),
    props: Array.isArray(raw.props) ? raw.props.map(String) : slot.props,
    emotion: String(raw.emotion || ""),
    shotType: String(raw.shotType || "全景"),
  };

  return {
    ...shot,
    duration: normalizeShotDuration(raw.duration, shot),
  };
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    targetCount: z.number().optional(),
    clearExisting: z.boolean().optional(),
    imageModelPromptTips: z.string().optional(),
  }),
  async (req, res) => {
    const { projectId, scriptId, targetCount = 30, clearExisting = true, imageModelPromptTips = "" } = req.body;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const scriptData = await u.db("t_script").where({ id: scriptId, projectId }).first();
      if (!scriptData) {
        send("error", { message: "剧本不存在" });
        res.end();
        return;
      }

      const outlineRow = await u.db("t_outline").where({ id: scriptData.outlineId, projectId }).first();
      const outlineData: any = outlineRow?.data ? JSON.parse(outlineRow.data) : null;
      const projectInfo = await u.db("t_project").where({ id: projectId }).first();

      let langConfig: { model?: string; apiKey?: string; baseURL?: string } = {};
      try { langConfig = await u.getConfig("language"); } catch { /**/ }

      const characters = (outlineData?.characters ?? []).map((c: any) => c.name).join("、") || "无";
      const scenes = (outlineData?.scenes ?? []).map((s: any) => s.name).join("、") || "无";
      const props = (outlineData?.props ?? []).map((p: any) => p.name).join("、") || "无";

      const narrativeParts: string[] = [];
      if (outlineData?.coreConflict) narrativeParts.push(`核心冲突：${outlineData.coreConflict}`);
      if (outlineData?.emotionalCurve) narrativeParts.push(`情绪曲线：${outlineData.emotionalCurve}`);
      if (outlineData?.openingHook) narrativeParts.push(`开场：${outlineData.openingHook}`);
      if (outlineData?.endingHook) narrativeParts.push(`结尾悬念：${outlineData.endingHook}`);
      if (outlineData?.keyEvents?.length) {
        narrativeParts.push(`关键事件：${(outlineData.keyEvents as string[]).join(" → ")}`);
      }

      const style = `类型：${projectInfo?.type || ""}，风格：${projectInfo?.artStyle || ""}`;
      const imageForbiddenPrompt = getImageForbiddenPrompt(style);
      const scriptText = String(scriptData.content || "").slice(0, 5000);
      const requiredCoverageGroups = getRequiredCoverageGroups(scriptText);
      const requiredCoverageText = describeCoverageGroups(requiredCoverageGroups);

      send("progress", { message: "AI正在规划场次结构..." });

      let effectiveTargetCount = targetCount;
      let scenePlans: ScenePlan[];
      try {
        const scenePlanPrompt = `${style}
${narrativeParts.join("\n")}

可用角色：${characters}
可用场景：${scenes}
可用道具：${props}

剧本内容：
${scriptText}

必须覆盖的剧情关键词组：${requiredCoverageText}

请先根据剧本内容自动判断合理分镜数量，并规划稳定的场次结构。
要求：
- 输出严格 JSON 对象，不要解释、Markdown 或代码块。
- JSON 格式：{"recommendedCount": 数字, "scenes": [{ "title": "...", "summary": "...", "scene": "...", "characters": [], "props": [], "shotCount": 数字 }]}。
- recommendedCount 是本集合理分镜数，必须根据剧本实际信息量判断，不要为了凑数拆碎动作。
- recommendedCount 不能超过 ${targetCount}。${targetCount} 是用户选择的上限，不是必须生成的数量。
- recommendedCount 不能低于脚本中镜头、转场、动作和悬念所需的最小镜头数；不能因为短剧本而丢掉后半段剧情。
- 如果剧本很短，优先使用 4-8 个分镜；普通短剧片段通常 8-16 个分镜；只有复杂动作、多人调度、长对话才接近上限。
- scenes 内 shotCount 总和必须等于 recommendedCount。
- 每场通常 2-6 个分镜，除非剧情确实需要，不要重复拆分同一个动作。
- 场次要按剧情顺序推进，保证前后连续。
- 必须覆盖剧本从开头到结尾的全部关键事件，尤其是“必须覆盖的剧情关键词组”；不能只生成前半段剧情。
直接输出 JSON 对象：`;

        let fullText = "";
        const streamResult = await u.ai.text.stream({
          system: "你是专业短剧导演，负责先判断合理分镜数量并规划场次结构。你必须只输出严格JSON对象。",
          prompt: scenePlanPrompt,
          log: {
            stage: "stage5",
            action: "storyboard_scene_plan",
            targetId: scriptId,
            extra: {
              projectId,
              scriptId,
              maxTargetCount: targetCount,
            },
          },
        }, langConfig);
        for await (const chunk of streamResult.textStream) {
          fullText += chunk;
        }
        const cleaned = fullText.replace(/```json/gi, "```").replace(/```/g, "").trim();
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        const parsed = objectMatch ? JSON.parse(objectMatch[0]) : parseJsonArray(fullText);
        const planResult = normalizeScenePlanResult(parsed, targetCount, outlineData, scriptText);
        effectiveTargetCount = planResult.recommendedCount;
        scenePlans = planResult.scenes;
      } catch (err) {
        console.warn("scene plan fallback:", err);
        const planResult = fallbackScenePlanResult(targetCount, outlineData, scriptText);
        effectiveTargetCount = planResult.recommendedCount;
        scenePlans = planResult.scenes;
      }

      const shotSlots = expandScenePlans(scenePlans);
      const scenePlanSummary = scenePlans
        .map((item) => `第${item.segmentId}场《${item.title}》：${item.summary}，场景：${item.scene}，镜头数：${item.shotCount}`)
        .join("\n");
      send("progress", { message: `AI建议本集规划 ${effectiveTargetCount} 个分镜，已拆为 ${scenePlans.length} 场` });

      const systemPrompt = [
        "你是专业短剧分镜师，负责根据已经确定的场次结构生成分镜。",
        "你必须只输出严格JSON数组，不要输出解释、Markdown或代码块。",
        "每个对象必须包含：name, characters, scene, props, emotion, shotType, prompt, duration。",
        "duration只作为建议值：空镜/环境/过渡/反应镜头2-3秒，普通叙事/简单动作3-4秒，情绪推进/关键动作5秒，复杂冲突/多人调度6-8秒。",
        "prompt是分镜图片描述，120-180字，必须包含主体、动作、场景、构图、景别、光影、色彩、角色/场景/道具一致性。",
        "除第一个分镜外，每个prompt必须承接上一个分镜的内容描述，写清楚主体位置、动作延续、情绪变化、镜头推进或转场关系。",
        "同一场内必须保持人物、场景、道具、光影、色彩连续；跨场时必须写清楚自然转场逻辑，避免人物/场景/道具突然出现或消失。",
        "相邻分镜可以相似以保持连续，但不能过于相似；每个相邻分镜必须有新的核心动作阶段、镜头目的、情绪变化或叙事信息。",
        "不要把同一微动作拆成多镜的轻微变化，例如不要连续写“伸手靠近、快要触碰、已经触碰、光芒更亮”这类重复推进。",
        "segmentId和shotIndex由系统固定分配，你可以输出但系统会以指定镜头清单为准。",
      ].join("\n");

      const allShots: ShotItem[] = [];
      const totalBatches = Math.ceil(shotSlots.length / BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchSlots = shotSlots.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
        const previousSummary = allShots
          .slice(-6)
          .map((shot, index) => `${allShots.length - Math.min(allShots.length, 6) + index + 1}. ${shot.name}：${shot.prompt}`)
          .join("\n") || "无";
        const slotList = batchSlots
          .map((slot) => `${slot.globalIndex}. segmentId=${slot.segmentId}, shotIndex=${slot.shotIndex}, 场次=${slot.sceneTitle}, 场景=${slot.scene}, 场次剧情=${slot.sceneSummary}`)
          .join("\n");

        const userPrompt = `${style}
${narrativeParts.join("\n")}

图片生成模型专属提示词技巧：
${imageModelPromptTips || "无"}

分镜图片固定生成约束：
${imageForbiddenPrompt}

完整场次结构：
${scenePlanSummary}

可用角色：${characters}
可用场景：${scenes}
可用道具：${props}
必须覆盖的剧情关键词组：${requiredCoverageText}

剧本内容：
${scriptText}

已经生成的前序分镜摘要：
${previousSummary}

本批固定镜头清单：
${slotList}

现在只生成上述 ${batchSlots.length} 个分镜。
必须按“本批固定镜头清单”的顺序输出 ${batchSlots.length} 个JSON对象，不要多也不要少。
每个prompt长度120-180字，是适合图片模型生成单张分镜图的画面描述。
本批第一个分镜必须承接“已经生成的前序分镜摘要”中的最后一个分镜；本批后续分镜必须承接本批数组里的上一条分镜。
每个prompt都要体现与上一分镜的连续关系：人物位置、动作延续、视线方向、道具状态、光影色彩或转场方式至少包含两项。
同一场内镜头要有景别、构图、动作推进差异；跨场时要自然衔接，不能出现人物/场景/道具无解释地突变。
相邻分镜允许共享角色、场景和情绪，但核心动作不能只是同一动作的轻微重复；必须至少改变一个叙事阶段：发现、接触、反应、转场、落点、危机出现、逃跑、悬念等。
如果某个动作很短，只用一个分镜完成；只有动作带来明确新信息或情绪转折时，才拆成两个分镜。
所有批次合起来必须覆盖“必须覆盖的剧情关键词组”，如果关键词组属于当前场次剧情，必须写入对应分镜。
不要把“绝对禁止”长清单原文写入每个prompt，后续图片生成会自动追加。
直接输出JSON数组：`;

        send("progress", { message: `AI正在生成分镜... 第 ${batchIndex + 1}/${totalBatches} 批` });

        let batchShots: ShotItem[] = [];
        let lastError: any;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            let fullText = "";
            const streamResult = await u.ai.text.stream({ system: systemPrompt, prompt: userPrompt }, langConfig);
            for await (const chunk of streamResult.textStream) {
              fullText += chunk;
            }
            const parsed = parseJsonArray(fullText);
            batchShots = parsed.slice(0, batchSlots.length).map((item, index) => normalizeShot(item, batchSlots[index]));
            if (batchShots.length === batchSlots.length) break;
            lastError = new Error(`本批只生成了 ${batchShots.length}/${batchSlots.length} 个分镜`);
          } catch (err) {
            lastError = err;
          }
        }

        if (batchShots.length !== batchSlots.length) {
          send("error", { message: `AI规划第 ${batchIndex + 1} 批解析失败，请重试。${lastError?.message || ""}` });
          res.end();
          return;
        }

        allShots.push(...batchShots);
        send("progress", { message: `已规划 ${allShots.length}/${effectiveTargetCount} 个分镜` });
      }

      if (allShots.length !== effectiveTargetCount) {
        send("error", { message: `AI生成数量异常：${allShots.length}/${effectiveTargetCount}` });
        res.end();
        return;
      }

      const missingCoverageGroups = findMissingCoverageGroups(allShots, requiredCoverageGroups);
      if (missingCoverageGroups.length > 0) {
        send("error", {
          message: `AI分镜缺少关键剧情：${describeCoverageGroups(missingCoverageGroups)}。请重新生成分镜。`,
        });
        res.end();
        return;
      }

      const overSimilarShots = findOverSimilarAdjacentShots(allShots);
      if (overSimilarShots.length > 0) {
        const issue = overSimilarShots[0];
        send("error", {
          message: `相邻分镜过于相似：${issue.previous.name} 与 ${issue.current.name}，重复动作：${issue.sharedActions.join("、") || "动作描述过近"}。请重新生成分镜。`,
        });
        res.end();
        return;
      }

      if (clearExisting) {
        await u.db("t_assets").where({ scriptId, type: "分镜" }).del();
      }

      send("progress", { message: `正在保存 ${allShots.length} 个分镜...` });

      for (const shot of allShots) {
        const meta = JSON.stringify({
          characters: shot.characters,
          scene: shot.scene,
          props: shot.props,
          emotion: shot.emotion,
          shotType: shot.shotType,
        });
        const [id] = await u.db("t_assets").insert({
          projectId,
          scriptId,
          type: "分镜",
          name: shot.name,
          prompt: shot.prompt,
          duration: shot.duration,
          segmentId: shot.segmentId,
          shotIndex: shot.shotIndex,
          intro: meta,
          filePath: null,
        });
        send("shot", {
          id,
          name: shot.name,
          prompt: shot.prompt,
          duration: shot.duration,
          segmentId: shot.segmentId,
          shotIndex: shot.shotIndex,
          characters: shot.characters,
          scene: shot.scene,
          props: shot.props,
          emotion: shot.emotion,
          shotType: shot.shotType,
          imageUrl: "",
        });
      }

      send("complete", { total: allShots.length });
    } catch (err: any) {
      console.error("planShots error:", err);
      send("error", { message: err?.message || "规划失败，请重试" });
    } finally {
      res.end();
    }
  },
);
