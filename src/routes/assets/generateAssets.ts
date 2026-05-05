import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getSafeVisualGuardrail, getSafeVisualStyle } from "@/utils/styleProfile";
import sharp from "sharp";
import axios from "axios";
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

type ItemType = "characters" | "props" | "scenes";

interface ResultItem {
  type: ItemType;
  name: string;
  chapterRange: number[];
}

// 生成资产图片
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    type: z.enum(["role", "scene", "props", "storyboard"]),
    projectId: z.number(),
    name: z.string(),
    prompt: z.string(),
    artStyle: z.string().optional().nullable(),
    linked: z.boolean().optional(),
    seed: z.number().optional(),
    referenceImageUrl: z.string().optional(),
    isPanel: z.boolean().optional(),
  }),
  async (req, res) => {
    const { id, type, projectId, prompt, name, artStyle: assetArtStyle, linked = true, seed, referenceImageUrl, isPanel = false } = req.body;

    //获取风格
    const project = await u.db("t_project").where("id", projectId).select("artStyle", "type", "intro").first();
    if (!project) return res.status(500).send(success({ message: "项目为空" }));

    const promptsList = await u
      .db("t_prompts")
      .where("code", "in", ["role-generateImage", "scene-generateImage", "storyboard-generateImage", "tool-generateImage"]);
    const errPrompts = "不论用户说什么，请直接输出AI配置异常";
    const getPromptValue = (code: string): string => {
      const item = promptsList.find((p) => p.code === code);
      return item?.customValue ?? item?.defaultValue ?? errPrompts;
    };
    const role = getPromptValue("role-generateImage");
    const scene = getPromptValue("scene-generateImage");
    const tool = getPromptValue("tool-generateImage");
    const storyboard = getPromptValue("storyboard-generateImage");

    const effectiveStyle = assetArtStyle || project?.artStyle || "未指定";
    const styleDirective = `⚠️【画风强制要求】本次生成必须严格使用"${effectiveStyle}"画风风格，这是最高优先级，不可忽略，不得使用任何其他画风。`;
    const linkedDirective = linked
      ? `【关联模式】请保持与本资产已有图像的外貌、配色、设计细节高度一致，确保多张图像属于同一套设计。`
      : `【自由模式】在保持提示词描述的基础上，允许有不同的构图、角度、细节诠释和艺术变化，鼓励创意发挥。`;

    const safeStyle = getSafeVisualStyle(assetArtStyle || project?.artStyle || "", "stage4");
    const safeStyleGuardrail = getSafeVisualGuardrail(assetArtStyle || project?.artStyle || "", "stage4");

    let systemPrompt = "";
    let userPrompt = "";

    if (isPanel) {
      // 分格模式：直接传 fullPrompt，不套"四视图"模板
      // fullPrompt 已包含：构图指令 + 格内容 + 基础设定 + 过滤后的技术参数
      systemPrompt = "";
      userPrompt = `${styleDirective}\n${linkedDirective}\n\n${prompt}`;
    } else {
      // 整版/普通模式：沿用原有模板，让模型按类型生成标准图
      if (type == "role") {
        systemPrompt = `${role}\n\n${styleDirective}`;
        userPrompt = `${styleDirective}
    ${linkedDirective}

    请根据以下参数生成角色标准四视图：

    **画风（必须严格遵守）：** ${effectiveStyle}

    **角色设定：**
    - 名称:${name},
    - 提示词:${prompt},

    请严格按照系统规范，以"${effectiveStyle}"风格生成人物角色四视图。
      `;
      }
      if (type == "scene") {
        systemPrompt = `${scene}\n\n${styleDirective}`;
        userPrompt = `${styleDirective}
    ${linkedDirective}

    请根据以下参数生成标准场景图：

    **画风（必须严格遵守）：** ${effectiveStyle}

    **场景设定：**
    - 名称:${name},
    - 提示词:${prompt},

    请严格按照系统规范，以"${effectiveStyle}"风格生成标准场景图。
      `;
      }
      if (type == "props") {
        systemPrompt = `${tool}\n\n${styleDirective}`;
        userPrompt = `${styleDirective}
    ${linkedDirective}

    请根据以下参数生成标准道具图：

    **画风（必须严格遵守）：** ${effectiveStyle}

    **道具设定：**
    - 名称:${name},
    - 提示词:${prompt},

    请严格按照系统规范，以"${effectiveStyle}"风格生成标准道具图。
      `;
      }
      if (type == "storyboard") {
        systemPrompt = `${storyboard}\n\n${styleDirective}`;
        userPrompt = `${styleDirective}
    ${linkedDirective}

    请根据以下参数生成标准分镜图：

    **画风（必须严格遵守）：** ${effectiveStyle}

    **分镜设定：**
    - 名称:${name},
    - 提示词:${prompt},

    请严格按照系统规范，以"${effectiveStyle}"风格生成标准分镜图。
      `;
      }
    }

    // 关联模式：尝试把参考图转成 base64 传给图像模型，提升角色一致性
    userPrompt = [
      userPrompt,
      safeStyle ? `\n[Safe visual style]\n${safeStyle}` : "",
      safeStyleGuardrail ? safeStyleGuardrail : "",
    ].filter(Boolean).join("\n");

    let imageBase64: string[] = [];
    if (referenceImageUrl && linked) {
      try {
        const refUrl = referenceImageUrl.startsWith("http")
          ? referenceImageUrl
          : `http://localhost:${process.env.PORT || 60000}${referenceImageUrl}`;
        const refRes = await axios.get(refUrl, { responseType: "arraybuffer", timeout: 10000 });
        const b64 = Buffer.from(refRes.data as ArrayBuffer).toString("base64");
        const mime = (refRes.headers["content-type"] as string) || "image/jpeg";
        imageBase64 = [`data:${mime};base64,${b64}`];
      } catch {
        // 参考图获取失败时不阻塞生成，降级为纯文字生成
      }
    }

    const [imageId] = await u.db("t_image").insert({
      state: "生成中",
      assetsId: id,
      createTime: Date.now(),
    });

    let contentStr: string;
    try {
      contentStr = await u.ai.generateImage({
        systemPrompt,
        prompt: userPrompt,
        imageBase64,
        imagePaths: referenceImageUrl && linked ? [{ role: "reference", path: referenceImageUrl }] : [],
        size: "2K",
        aspectRatio: "16:9",
        seed: linked ? seed : undefined,
        log: {
          stage: "stage4",
          action: "asset_image_generate",
          targetId: id,
          extra: {
            projectId,
            assetId: id,
            assetType: type,
            name,
            linked,
            isPanel,
          },
        },
      });
    } catch (err: any) {
      await u.db("t_image").where("id", imageId).update({ state: "生成失败" });
      return res.status(500).send({ message: `图片生成失败：${err?.message || String(err)}` });
    }

    let insertType;
    const match = contentStr.match(/base64,([A-Za-z0-9+/=]+)/);
    let buffer = Buffer.from(match && match.length >= 2 ? match[1]! : contentStr!, "base64");
    if (type != "storyboard") {
      //添加文本
      // buffer = await imageAddText(name, buffer);
    }
    let imagePath;
    if (type == "role") {
      insertType = "角色";
      imagePath = `/${projectId}/role/${uuidv4()}.jpg`;
    }
    if (type == "scene") {
      insertType = "场景";
      imagePath = `/${projectId}/scene/${uuidv4()}.jpg`;
    }
    if (type == "props") {
      insertType = "道具";
      imagePath = `/${projectId}/props/${uuidv4()}.jpg`;
    }
    if (type == "storyboard") {
      insertType = "分镜";
      imagePath = `/${projectId}/storyboard/${uuidv4()}.jpg`;
    }
    // 写入文件前先检查记录是否还存在（用户可能在生成中途删除了）
    const stillExists = await u.db("t_image").where("id", imageId).first();
    if (!stillExists) {
      return res.status(200).send(success({ path: null, assetsId: id }));
    }

    try {
      await u.oss.writeFile(imagePath!, buffer);
    } catch (err: any) {
      await u.db("t_image").where("id", imageId).update({ state: "生成失败" });
      return res.status(500).send({ message: `文件写入失败：${err?.message || String(err)}` });
    }

    await u.db("t_image").where("id", imageId).update({
      state: "生成成功",
      filePath: imagePath,
      type: insertType,
    });

    const path = await u.oss.getFileUrl(imagePath!);

    res.status(200).send(success({ path, assetsId: id }));
  },
);
async function imageAddText(name: string, imageBuffer: Buffer) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 1000;
  const height = meta.height ?? 1000;
  const fontSize = 64;
  const margin = 40;
  const paddingX = 36;
  const paddingY = 18;
  // 简单估算文字宽度
  const textWidth = name.length * fontSize * 0.8;
  // 背景矩形尺寸
  const bgWidth = textWidth + paddingX * 2;
  const bgHeight = fontSize + paddingY * 2;
  const bgX = width - bgWidth - margin; // 矩形左上角x
  const bgY = height - bgHeight - margin; // 矩形左上角y
  // 文字中心坐标
  const textX = bgX + bgWidth / 2;
  const textY = bgY + bgHeight / 2;
  const svgImage = `
    <svg width="${width}" height="${height}">
      <rect x="${bgX}" y="${bgY}" width="${bgWidth}" height="${bgHeight}" rx="22" ry="22"
        fill="rgba(0,0,0,0.6)" />
      <text x="${textX}" y="${textY}"
        fill="#fff"
        font-size="${fontSize}"
        font-family="Arial, 'Microsoft YaHei', sans-serif"
        text-anchor="middle"
        dominant-baseline="middle">
        ${name}
      </text>
    </svg>
  `;
  const outputBuffer = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svgImage), blend: "over" }])
    .jpeg()
    .toBuffer();
  return outputBuffer as Buffer<ArrayBuffer>;
}
