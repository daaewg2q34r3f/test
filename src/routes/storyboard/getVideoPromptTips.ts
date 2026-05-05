import express from "express";
import u from "@/utils";
import { error, success } from "@/lib/responseFormat";
import { z } from "zod";

const router = express.Router();

const tipsSchema = z.object({
  tips: z.string().describe("视频生成模型专属提示词优化技巧"),
});

function fallbackTips(model: string, manufacturer: string) {
  if (/doubao|seedance/i.test(model)) {
    return [
      "提示词应明确首帧、尾帧和镜头运动方向，尤其在 A->B 过渡中写清从第一张图自然运动到第二张图。",
      "使用简洁直接的动作描述，优先写主体动作、镜头运动、节奏和连续性，避免堆叠过多静态外观细节。",
      "多图混剪需要强调参考图顺序、节奏变化和镜头衔接，不要只描述第一张图。",
      "对人物、场景、道具一致性给出明确要求，减少突然出现、消失、变形和跳切。",
      "把负面约束放在提示词末尾，明确禁止画面闪烁、人物变形、动作卡顿和不自然转场。",
    ].join("\n");
  }

  return [
    `当前视频模型：${model || manufacturer || "unknown"}`,
    "提示词需要明确主体动作、镜头运动、时序变化、节奏和画面稳定性。",
    "根据生成模式区分单图动态、A->B 过渡和多图混剪，避免把不同模式写成同一种镜头。",
    "保持人物、场景、道具和美术风格一致，减少跳帧、变形和不自然转场。",
  ].join("\n");
}

export default router.post("/", async (_req, res) => {
  try {
    const configs = await u.db("t_config")
      .where({ type: "video" })
      .orderBy("id", "asc")
      .select("manufacturer", "model")
      .limit(1);

    const config = configs?.[0] || {};
    const manufacturer = config.manufacturer || "volcengine";
    const model = config.model || (manufacturer === "volcengine" ? "doubao-seedance-1-5-pro-251215" : "default");

    try {
      const langConfig = await u.getConfig("language");
      const result = await u.ai.text.invoke({
        system: "你是资深 AI 视频生成提示词工程师。请根据目标视频模型，总结该模型在生成短剧分镜视频时最有效的提示词写法技巧。只输出可直接用于指导后续提示词优化的技巧，不要写闲聊。",
        messages: [{
          role: "user",
          content: `目标视频厂商：${manufacturer}\n目标视频模型：${model}\n\n请输出 5-8 条中文技巧，重点覆盖：单图转动态、A->B 首尾帧过渡、多图混剪、主体一致性、镜头运动、负面约束。`,
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
    res.status(500).send(error(err?.message || "获取视频模型提示词技巧失败"));
  }
});
