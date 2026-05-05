import express from "express";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

// 检查语言模型
export default router.post(
  "/",
  validateFields({
    modelName: z.string().optional(),
    apiKey: z.string(),
    baseURL: z.string().optional(),
    manufacturer: z.string(),
  }),
  async (req, res) => {
    const { modelName, apiKey, baseURL, manufacturer } = req.body;
    try {
      const contentStr = await u.ai.generateImage(
        {
          prompt: "a futuristic cityscape at sunset, neon lights reflecting on wet streets, cinematic composition, ultra detailed, photorealistic, 8K",
          imageBase64: [],
          aspectRatio: "16:9",
          size: "2K",
        },
        {
          model: modelName,
          apiKey,
          baseURL,
          manufacturer,
        },
      );
      // 测试成功后自动保存图像模型配置
      try {
        const userId = (req as any).user?.id ?? 1;
        await u.db("t_setting").where("userId", userId).update({
          imageModel: JSON.stringify({
            model: modelName ?? "",
            apiKey,
            baseURL: baseURL ?? "",
            manufacturer,
          }),
        });
      } catch (saveErr) {
        console.warn("[testImage] 自动保存配置失败:", saveErr);
      }

      res.status(200).send(success({ message: "连接成功" }));
    } catch (err: any) {
      console.error("[testImage error]", err?.response?.data ?? err?.message ?? err);
      const message = err?.response?.data?.error?.message || err?.message || err?.error?.message || "模型调用失败";
      res.status(500).send(error(message));
    }
  },
);
