import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
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

// 获取视频配置列表
export default router.get(
  "/",
  async (req, res) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });
    const scriptId = parseInt(req.query.scriptId as string);
    if (!scriptId) return res.status(200).send(success([]));

    // 查询该脚本下的所有视频配置
    const configs = await u.db("t_videoConfig")
      .where({ scriptId })
      .orderBy("createTime", "desc");

    // 解析 JSON 字段
    const result = await Promise.all(configs.map(async (config: any) => ({
      id: config.id,
      scriptId: config.scriptId,
      projectId: config.projectId,
      manufacturer: await resolveVideoManufacturer(config.manufacturer),
      mode: config.mode,
      startFrame: config.startFrame ? JSON.parse(config.startFrame) : null,
      endFrame: config.endFrame ? JSON.parse(config.endFrame) : null,
      images: config.images ? JSON.parse(config.images) : [],
      resolution: config.resolution,
      duration: config.duration,
      durationSource: config.durationSource || "stage5",
      prompt: config.prompt || "",
      selectedResultId: config.selectedResultId,
      createdAt: config.createTime ? new Date(config.createTime).toISOString() : new Date().toISOString(),
    })));

    res.status(200).send(success(result));
  },
);
