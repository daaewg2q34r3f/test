import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import generateFrameImage from "@/agents/storyboard/generateImageTool";

const router = express.Router();

function normalizeStoredPath(pathOrUrl?: string | null) {
  if (!pathOrUrl) return "";
  try {
    if (pathOrUrl.startsWith("http")) return new URL(pathOrUrl).pathname;
  } catch { /**/ }
  return pathOrUrl;
}

async function filterExistingPaths(paths?: string[]) {
  const normalized = (paths || []).map(normalizeStoredPath).filter(Boolean);
  const unique = [...new Set(normalized)];
  const existing: string[] = [];

  for (const path of unique) {
    if (await u.oss.fileExists(path)) existing.push(path);
  }

  return existing;
}

async function getPreviousFrameContext(frame: any) {
  const frames = await u.db("t_assets")
    .where({ scriptId: frame.scriptId, type: frame.type })
    .orderBy("segmentId", "asc")
    .orderBy("shotIndex", "asc")
    .orderBy("id", "asc")
    .select("id", "name", "prompt", "filePath");

  const currentIndex = frames.findIndex((item: any) => Number(item.id) === Number(frame.id));
  if (currentIndex <= 0) return { prompt: "", imagePath: "" };

  const immediatePrevious = frames[currentIndex - 1];
  const previousPrompt = String(immediatePrevious?.prompt || immediatePrevious?.name || "");
  let previousImagePath = "";

  for (let i = currentIndex - 1; i >= 0; i--) {
    const previousPath = normalizeStoredPath(frames[i]?.filePath);
    if (!previousPath) continue;
    if (await u.oss.fileExists(previousPath)) {
      previousImagePath = previousPath;
      break;
    }
  }

  return { prompt: previousPrompt, imagePath: previousImagePath };
}

// 重新生成单个分镜帧图片（携带资产参考图，保持角色一致性）
export default router.post(
  "/",
  validateFields({
    id: z.coerce.number(),
    // User-selected reference image paths from the UI (absolute relative paths or URLs)
    selectedRefPaths: z.array(z.string()).optional(),
  }),
  async (req, res) => {
    const { id, selectedRefPaths } = req.body;

    const frame = await u.db("t_assets").where("id", id).first();
    if (!frame) return res.status(404).json({ message: "分镜不存在" });

    const scriptData = await u.db("t_script").where("id", frame.scriptId).first();
    if (!scriptData) return res.status(404).json({ message: "剧本不存在" });

    const projectId = scriptData.projectId;

    const oldImagePath = normalizeStoredPath(frame.filePath);
    if (oldImagePath) {
      try { await u.oss.deleteFile(oldImagePath); } catch { /**/ }
      await u.db("t_assets").where("id", id).update({ filePath: null });
      frame.filePath = null;
    }

    // 解析 intro 里存的元数据（角色、场景、情绪、镜头类型）
    let meta: { characters?: string[]; scene?: string; props?: string[]; emotion?: string; shotType?: string; cameraMovement?: string } = {};
    try { if (frame.intro) meta = JSON.parse(frame.intro); } catch { /**/ }

    const previousFrameContext = await getPreviousFrameContext(frame);
    const validSelectedRefPaths = await filterExistingPaths(selectedRefPaths);

    // 把上一分镜描述、角色/场景/情绪/镜头类型拼入 prompt，让生成过程同时参考文字连续性和资产图
    let fullPrompt = frame.prompt || frame.name || "";
    if (previousFrameContext.prompt) {
      fullPrompt = [
        `上一分镜内容描述：${previousFrameContext.prompt}`,
        `当前分镜内容描述：${fullPrompt}`,
        "生成要求：当前分镜必须承接上一分镜的人物位置、动作状态、视线方向、道具状态、光影色彩和情绪节奏；如发生跨场或转场，必须保持自然过渡，避免主体突然出现或消失。",
      ].join("\n");
    }
    const extras: string[] = [];
    if (meta.characters?.length) extras.push(`角色：${meta.characters.join("、")}`);
    if (meta.scene) extras.push(`场景：${meta.scene}`);
    if (meta.emotion) extras.push(`情绪：${meta.emotion}`);
    if (meta.shotType) extras.push(`镜头：${meta.shotType}`);
    if (extras.length) fullPrompt = `${fullPrompt}【${extras.join("，")}】`;

    const isSensitiveError = (err: any) =>
      err?.response?.data?.error?.code === "OutputImageSensitiveContentDetected" ||
      String(err?.message).includes("OutputImageSensitiveContentDetected") ||
      String(JSON.stringify(err?.response?.data)).includes("OutputImageSensitiveContentDetected");

    // 自动重试：内容审核拦截时最多重试 2 次
    const MAX_RETRIES = 2;
    let lastErr: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 全选参考图：直接用 meta 中明确标注的角色/场景/道具，跳过 AI 过滤
      const forceAssets = [
        ...(meta.characters || []),
        ...(meta.scene ? [meta.scene] : []),
        ...(meta.props || []),
      ].filter(Boolean);

      const extraRefPaths: Array<{ name: string; path: string }> = [];
      if (previousFrameContext.imagePath) extraRefPaths.push({ name: "上一帧分镜", path: previousFrameContext.imagePath });
      for (const rawPath of selectedRefPaths || []) {
        const relPath = normalizeStoredPath(rawPath);
        if (relPath) extraRefPaths.push({ name: "手动参考", path: relPath });
      }

      const filteredExtraRefPaths = extraRefPaths.filter(item =>
        item.name !== "鎵嬪姩鍙傝€?" || validSelectedRefPaths.includes(item.path)
      );

      try {
        const buffer = await generateFrameImage(
          {
            prompt: fullPrompt,
            id: frame.id,
            dbId: frame.id,
            segmentId: Number(frame.segmentId) || undefined,
            shotIndex: Number(frame.shotIndex) || undefined,
          },
          frame.scriptId,
          projectId,
          forceAssets.length > 0 ? forceAssets : undefined,
          filteredExtraRefPaths.length > 0 ? filteredExtraRefPaths : undefined,
        );

        const fileName = `/${projectId}/storyboard/${uuidv4()}.jpg`;
        await u.oss.writeFile(fileName, buffer);
        await u.db("t_assets").where("id", id).update({ filePath: fileName });
        const url = await u.oss.getFileUrl(fileName);

        return res.status(200).json(success({ url }));
      } catch (err: any) {
        lastErr = err;
        const detail = err?.response?.data ?? err?.message ?? err;
        console.error(`分镜图生成失败(第${attempt + 1}次):`, typeof detail === "object" ? JSON.stringify(detail) : detail);

        if (isSensitiveError(err) && attempt < MAX_RETRIES) {
          console.log(`内容审核拦截，第 ${attempt + 1} 次重试中...`);
          continue;
        }
        break;
      }
    }

    const isSensitive = isSensitiveError(lastErr);
    const msg = isSensitive
      ? "图片内容被审核拦截，已自动重试仍未通过。建议修改画面描述后重新生成。"
      : ((typeof lastErr?.response?.data === "object"
          ? (lastErr.response.data?.error?.message || lastErr.response.data?.message || JSON.stringify(lastErr.response.data))
          : null) ?? lastErr?.message ?? "图片生成失败");
    res.status(500).json({ message: msg });
  },
);
