import u from "@/utils";
import sharp from "sharp";
import { getSafeVisualGuardrail, getSafeVisualStyle } from "@/utils/styleProfile";

interface AssetItem {
  name: string;
  description: string;
}

interface EpisodeData {
  characters?: AssetItem[];
  props?: AssetItem[];
  scenes?: AssetItem[];
}

type ExtraRef = string | { name: string; path: string };

const IMAGE_FIXED_FORBIDDEN_PROMPT = "绝对禁止：低分辨率，模糊，像素化，马赛克，锯齿，噪点，压缩痕迹，色块，条纹，波纹，摩尔纹，失真，扭曲，拉伸，压缩变形，三只手，多头，肢体扭曲，面部崩坏，比例失调，解剖错误，关节错位，手指异常，眼睛不对称，牙齿错乱，头发穿模，悬浮物体，穿模，空间错乱，透视错误，重力失效，不合理的光影，违反物理规律的运动，材质冲突，光影悖论，AI生成痕迹，数字感，塑料质感，3D渲染感，游戏引擎效果，卡通化，夸张变形，非真实感，人工痕迹，机械感，构图失衡，主体偏移，背景混乱，元素冲突，视觉噪音，杂乱无章，焦点模糊，景深错误，透视失真，过度饱和，色彩失真，色偏，色彩溢出，灰蒙蒙，色彩冲突，不协调配色，色彩断层，色彩噪点，风格混杂，风格不统一，风格跳跃，风格矛盾，多种风格冲突，风格不协调";
const ANIME_STYLE_WORDS = ["动漫", "动画", "二次元", "漫画", "卡通"];
const ANIME_FORBIDDEN_CONFLICTS = ["卡通化", "非真实感"];

function getImageForbiddenPrompt(style: string) {
  if (!ANIME_STYLE_WORDS.some(word => style.includes(word))) return IMAGE_FIXED_FORBIDDEN_PROMPT;
  return ANIME_FORBIDDEN_CONFLICTS.reduce((result, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(`，?${escaped}`, "g"), "");
  }, IMAGE_FIXED_FORBIDDEN_PROMPT).replace(/：，/g, "：").replace(/，{2,}/g, "，");
}

async function compressImage(buffer: Buffer, maxSizeBytes = 3 * 1024 * 1024): Promise<Buffer> {
  if (buffer.length <= maxSizeBytes) return buffer;
  let quality = 90;
  let result = await sharp(buffer).jpeg({ quality }).toBuffer();
  while (result.length > maxSizeBytes && quality > 20) {
    quality -= 10;
    result = await sharp(buffer).jpeg({ quality }).toBuffer();
  }
  return result.length <= maxSizeBytes ? result : await sharp(buffer).resize({ width: 1280 }).jpeg({ quality: 70 }).toBuffer();
}

async function ensureTotalSizeLimit(buffers: Buffer[], maxTotal = 18 * 1024 * 1024): Promise<Buffer[]> {
  let result = [...buffers];
  while (result.reduce((sum, item) => sum + item.length, 0) > maxTotal && result.length > 0) {
    const largestIndex = result.reduce((maxIndex, item, index) => item.length > result[maxIndex].length ? index : maxIndex, 0);
    result[largestIndex] = await compressImage(result[largestIndex], Math.max(512 * 1024, result[largestIndex].length * 0.75));
  }
  return result;
}

function normalizeRefPath(rawPath: string) {
  try {
    if (rawPath.startsWith("http")) return new URL(rawPath).pathname;
  } catch { /**/ }
  return rawPath;
}

async function getAssetRefPaths(assetName: string, projectId: number): Promise<string[]> {
  const asset = await u.db("t_assets")
    .where({ name: assetName, projectId })
    .whereNot({ type: "storyboard" })
    .first();
  if (!asset) return [];

  const paths: string[] = [];
  if (asset.selectedImages) {
    try {
      const selectedImages: string[] = JSON.parse(asset.selectedImages);
      const normalizedSelected = [...new Set(selectedImages.filter(path => path && !path.includes("/storyboard/")).map(normalizeRefPath))];
      const existingSelected: string[] = [];
      let selectedChanged = normalizedSelected.length !== selectedImages.filter(path => path && !path.includes("/storyboard/")).length;

      for (const selectedPath of normalizedSelected) {
        if (await u.oss.fileExists(selectedPath)) {
          existingSelected.push(selectedPath);
        } else {
          selectedChanged = true;
        }
      }

      if (selectedChanged) {
        await u.db("t_assets")
          .where("id", asset.id)
          .update({ selectedImages: existingSelected.length > 0 ? JSON.stringify(existingSelected) : null });
      }

      paths.push(...existingSelected.slice(0, 2));
    } catch { /**/ }
  }

  if (paths.length === 0 && asset.filePath && !asset.filePath.includes("/storyboard/")) {
    const normalizedCoverPath = normalizeRefPath(asset.filePath);
    if (await u.oss.fileExists(normalizedCoverPath)) {
      paths.push(normalizedCoverPath);
    } else {
      await u.db("t_assets").where("id", asset.id).update({ filePath: null });
    }
  }

  return paths;
}

function getOutlineResources(outline: EpisodeData | null): AssetItem[] {
  if (!outline) return [];
  return (["characters", "scenes", "props"] as const).flatMap(key => outline[key] ?? []);
}

function uniqueNames(names: string[]) {
  return [...new Set(names.map(name => name?.trim()).filter(Boolean))];
}

/**
 * Generate a single storyboard frame image.
 * Asset references are always loaded first. Extra references, such as the previous
 * storyboard frame, are appended after the current frame's asset references.
 */
export default async (
  cell: { prompt: string; id?: string | number; dbId?: string | number; segmentId?: number; shotIndex?: number },
  scriptId: number,
  projectId: number,
  forceAssetNames?: string[],
  extraRefPaths?: ExtraRef[],
): Promise<Buffer> => {
  const scriptData = await u.db("t_script").where({ id: scriptId, projectId }).first();
  const projectInfo = await u.db("t_project").where({ id: projectId }).first();
  const outlineRow = await u.db("t_outline").where({ id: scriptData?.outlineId, projectId }).first();
  const outline: EpisodeData | null = outlineRow?.data ? JSON.parse(outlineRow.data) : null;
  const resources = getOutlineResources(outline);

  const relevantNames = forceAssetNames?.length
    ? uniqueNames(forceAssetNames)
    : uniqueNames(resources.map(item => item.name));

  const refPaths: Array<{ name: string; path: string }> = [];
  const pushRef = (name: string, rawPath: string) => {
    const path = normalizeRefPath(rawPath);
    if (!path || refPaths.some(item => item.path === path)) return;
    refPaths.push({ name, path });
  };

  for (const name of relevantNames) {
    const paths = await getAssetRefPaths(name, projectId);
    for (const path of paths) pushRef(name, path);
  }

  for (const item of extraRefPaths || []) {
    if (typeof item === "string") {
      pushRef("extra reference", item);
    } else {
      pushRef(item.name, item.path);
    }
  }

  let imageBuffers: Buffer[] = [];
  if (refPaths.length > 0) {
    const rawBuffers = await Promise.all(refPaths.map(ref => u.oss.getFile(ref.path).catch(() => null)));
    const validBuffers = rawBuffers.filter((buffer): buffer is Buffer => buffer !== null);
    imageBuffers = await ensureTotalSizeLimit(await Promise.all(validBuffers.map(buffer => compressImage(buffer))));
  }

  const assetRefMap = refPaths.map((ref, index) => `${ref.name}=image${index + 1}`).join(", ");
  const aspectRatio = (projectInfo?.videoRatio as string) || "16:9";
  const rawStyle = [projectInfo?.type, projectInfo?.artStyle].filter(Boolean).join(", ");
  const style = getSafeVisualStyle(rawStyle, "stage5");
  const safeStyleGuardrail = getSafeVisualGuardrail(rawStyle, "stage5");
  const fixedForbiddenPrompt = getImageForbiddenPrompt(style);
  const resourceDescriptions = resources
    .filter(item => relevantNames.includes(item.name))
    .map(item => `- ${item.name}: ${item.description}`)
    .join("\n");

  const promptRecord = await u.db("t_prompts").where("code", "storyboard-generateImage").first();
  const customInstruction = promptRecord?.customValue ?? promptRecord?.defaultValue ?? "";
  const enhancedPrompt = [
    customInstruction,
    `Create one storyboard frame with aspect ratio ${aspectRatio}.`,
    style ? `Project visual style: ${style}.` : "",
    safeStyleGuardrail,
    resourceDescriptions ? `Required project assets:\n${resourceDescriptions}` : "",
    assetRefMap ? `Reference image mapping: ${assetRefMap}. Use character, scene, and prop asset references for consistency. If a previous storyboard frame is included, use it for continuity while following the current prompt.` : "",
    `Current frame prompt: ${cell.prompt}`,
    `Fixed negative constraints: ${fixedForbiddenPrompt}`,
  ].filter(Boolean).join("\n\n");

  const targetId = cell.dbId || cell.id || (
    cell.segmentId && cell.shotIndex ? `S${cell.segmentId}_${cell.shotIndex}` : `${projectId}_${scriptId}`
  );

  const contentStr = await u.ai.generateImage({
    systemPrompt: "Generate a single coherent storyboard frame. Preserve identity, costume, scene design, and prop appearance from the supplied reference images.",
    prompt: enhancedPrompt,
    size: "2K",
    aspectRatio: aspectRatio as any,
    imageBase64: imageBuffers.map(buffer => `data:image/jpeg;base64,${buffer.toString("base64")}`),
    imagePaths: refPaths.map((ref, index) => ({ role: `image${index + 1}:${ref.name}`, path: ref.path })),
    log: {
      stage: "stage5",
      action: "storyboard_frame_image",
      targetId,
      extra: {
        projectId,
        scriptId,
        shotId: cell.dbId || cell.id,
        segmentId: cell.segmentId,
        shotIndex: cell.shotIndex,
        referenceImageCount: refPaths.length,
        currentFramePrompt: cell.prompt,
        style,
        fixedForbiddenPrompt,
      },
    },
  });

  const match = contentStr.match(/base64,([A-Za-z0-9+/=]+)/);
  const base64Str = match?.[1] ?? contentStr;
  return Buffer.from(base64Str, "base64");
};
