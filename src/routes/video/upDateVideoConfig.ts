import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

async function resolveVideoManufacturer(rawManufacturer?: string | null) {
  const normalized = String(rawManufacturer || "").trim();
  if (normalized && normalized !== "default") return normalized;

  const globalConfig = await u.db("t_config")
    .where("type", "video")
    .orderBy("id", "desc")
    .first();

  return globalConfig?.manufacturer || normalized || "default";
}

// 更新视频配置
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    manufacturer: z.string().optional(),
    mode: z.enum(["startEnd", "multi", "single"]).optional(),
    startFrame: z.object({
      id: z.number(),
      filePath: z.string(),
      prompt: z.string().optional(),
    }).nullable().optional(),
    endFrame: z.object({
      id: z.number(),
      filePath: z.string(),
      prompt: z.string().optional(),
    }).nullable().optional(),
    images: z.array(z.object({
      id: z.number(),
      filePath: z.string(),
      prompt: z.string().optional(),
    })).optional(),
    resolution: z.string().optional(),
    duration: z.number().optional(),
    durationSource: z.enum(["stage5", "manual", "ai"]).optional(),
    prompt: z.string().optional(),
    selectedResultId: z.number().nullable().optional(),
  }),
  async (req, res) => {
    const { id, manufacturer, mode, startFrame, endFrame, images, resolution, duration, durationSource, prompt, selectedResultId } = req.body;

    // 检查配置是否存在
    const existingConfig = await u.db("t_videoConfig").where({ id }).first();
    if (!existingConfig) {
      return res.status(404).send(error("视频配置不存在"));
    }

    // 构建更新对象
    const updateData: Record<string, any> = {
      updateTime: Date.now(),
    };

    if (resolution !== undefined) {
      updateData.resolution = resolution;
    }
    if (manufacturer !== undefined) {
      updateData.manufacturer = await resolveVideoManufacturer(manufacturer);
    }
    if (mode !== undefined) {
      updateData.mode = mode;
    }
    if (startFrame !== undefined) {
      updateData.startFrame = startFrame ? JSON.stringify(startFrame) : null;
    }
    if (endFrame !== undefined) {
      updateData.endFrame = endFrame ? JSON.stringify(endFrame) : null;
    }
    if (images !== undefined) {
      updateData.images = JSON.stringify(images);
    }
    if (duration !== undefined) {
      updateData.duration = duration;
    }
    if (durationSource !== undefined) {
      updateData.durationSource = durationSource;
    }
    if (prompt !== undefined) {
      updateData.prompt = prompt;
    }
    if (selectedResultId !== undefined) {
      updateData.selectedResultId = selectedResultId;
    }

    // 更新数据
    await u.db("t_videoConfig").where({ id }).update(updateData);

    // 获取更新后的数据
    const updatedConfig = await u.db("t_videoConfig").where({ id }).first();

    res.status(200).send(success({ 
      message: "更新视频配置成功",
      data: {
        id: updatedConfig.id,
        scriptId: updatedConfig.scriptId,
        projectId: updatedConfig.projectId,
        manufacturer: updatedConfig.manufacturer,
        mode: updatedConfig.mode,
        startFrame: updatedConfig.startFrame ? JSON.parse(updatedConfig.startFrame) : null,
        endFrame: updatedConfig.endFrame ? JSON.parse(updatedConfig.endFrame) : null,
        images: updatedConfig.images ? JSON.parse(updatedConfig.images) : [],
        resolution: updatedConfig.resolution,
        duration: updatedConfig.duration,
        durationSource: updatedConfig.durationSource,
        prompt: updatedConfig.prompt,
        selectedResultId: updatedConfig.selectedResultId,
        createdAt: new Date(updatedConfig.createTime).toISOString(),
      }
    }));
  },
);
