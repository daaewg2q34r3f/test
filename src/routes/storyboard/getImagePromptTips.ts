import express from "express";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { z } from "zod";

const router = express.Router();

const tipsSchema = z.object({
  tips: z.string().describe("图片生成模型专属提示词优化技巧"),
});

function fallbackTips(model: string, manufacturer: string) {
  if (/doubao|seedream/i.test(model)) {
    return [
      "提示词应清晰描述主体、场景、构图、景别、光影、色彩和项目美术风格，避免抽象空泛。",
      "有参考图时，应明确要求保持人物、场景、道具、服装、色彩和材质一致。",
      "分镜图提示词要突出当前镜头画面，不写视频运动过程，不写多镜头切换。",
      "角色动作和情绪要具体，避免过多静态外观堆叠导致模型忽略画面重点。",
      "同一集分镜应保持风格统一、构图稳定、主体清晰，避免风格跳跃。",
      "负面约束放在提示词末尾，明确禁止低画质、变形、风格混杂和 AI 痕迹。",
    ].join("\n");
  }

  return [
    `当前图片模型：${model || manufacturer || "unknown"}`,
    "提示词需要明确主体、环境、构图、景别、光影、色彩、风格和参考图一致性。",
    "分镜图片描述应聚焦单张画面，不写连续动作过程。",
    "保持角色、场景、道具和项目美术风格一致，减少变形、模糊、风格混杂。",
  ].join("\n");
}

export default router.post("/", async (_req, res) => {
  try {
    let manufacturer = "volcengine";
    let model = "doubao-seedream-4-0-250828";
    try {
      const imageConfig = await u.getConfig("image");
      manufacturer = imageConfig.manufacturer || manufacturer;
      model = imageConfig.model || model;
    } catch { /**/ }

    try {
      const langConfig = await u.getConfig("language");
      const result = await u.ai.text.invoke({
        system: "你是资深 AI 图片生成提示词工程师。请根据目标图片模型，总结该模型在生成短剧分镜图时最有效的提示词写法技巧。只输出可直接用于指导后续分镜图描述优化的技巧，不要闲聊。",
        messages: [{
          role: "user",
          content: `目标图片厂商：${manufacturer}\n目标图片模型：${model}\n\n请输出 5-8 条中文技巧，重点覆盖：分镜单帧画面、角色一致性、场景/道具一致性、构图景别、光影色彩、参考图使用、负面约束。`,
        }],
        output: tipsSchema,
      }, langConfig) as any;

      res.status(200).send(success({
        manufacturer,
        model,
        tips: result?.tips || fallbackTips(model, manufacturer),
      }));
    } catch {
      res.status(200).send(success({
        manufacturer,
        model,
        tips: fallbackTips(model, manufacturer),
      }));
    }
  } catch (err: any) {
    res.status(500).send(error(err?.message || "获取图片模型提示词技巧失败"));
  }
});
