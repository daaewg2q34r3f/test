import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";
const router = express.Router();

// 检查语言模型，测试成功后自动保存配置
export default router.post(
  "/",
  validateFields({
    modelName: z.string(),
    apiKey: z.string(),
    baseURL: z.string().optional(),
    manufacturer: z.string().optional(),
  }),
  async (req, res) => {
    const { modelName, apiKey, baseURL, manufacturer } = req.body;
    try {
      const result = await u.ai.text.invoke(
        {
          prompt: "你好，1+1等于多少？请用一句话回答。",
        },
        { model: modelName, apiKey, baseURL },
      );
      const reply = typeof result === "string" ? result : result?.text ?? "连接成功";

      // 测试成功后自动保存语言模型配置到数据库
      try {
        const userId = (req as any).user?.id ?? 1;
        await u.db("t_setting").where("userId", userId).update({
          languageModel: JSON.stringify({
            model: modelName,
            apiKey,
            baseURL: baseURL ?? "",
            manufacturer: manufacturer ?? "openAi",
          }),
        });
      } catch (saveErr) {
        console.warn("[testAI] 自动保存配置失败:", saveErr);
      }

      res.status(200).send(success(reply));
    } catch (err) {
      console.log(err);
      if (typeof err === "string") return res.status(500).send(error(err));
      const msg = err instanceof Error ? err.message : (err as any)?.error?.message;
      return res.status(500).send(error(msg || "未知错误"));
    }
  },
);
