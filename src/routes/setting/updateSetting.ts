import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 修改全局配置
export default router.post(
  "/",
  validateFields({
    userId: z.number(),
    imageModel: z.object().optional(),
    videoModel: z.array(z.object()).optional(),
    languageModel: z.object().optional(),
    name: z.string().optional(),
    password: z.string().optional(),
  }),
  async (req, res) => {
    const { userId, imageModel, videoModel, languageModel, name, password } = req.body;

    // 只更新实际传入的字段，防止覆盖其他配置
    const settingUpdate: Record<string, any> = {};
    if (imageModel !== undefined) settingUpdate.imageModel = JSON.stringify(imageModel);
    if (languageModel !== undefined) settingUpdate.languageModel = JSON.stringify(languageModel);
    if (Object.keys(settingUpdate).length > 0) {
      await u.db("t_setting").where("userId", userId).update(settingUpdate);
    }

    if (videoModel) {
      await u.db("t_config").where("type", "video").delete();

      for (const item of videoModel) {
        await u.db("t_config").insert({
          type: "video",
          name: item.name,
          model: item.model,
          apiKey: item.apiKey,
          baseUrl: item.baseUrl,
          createTime: Date.now(),
          userId,
          manufacturer: item.manufacturer,
        });
      }
    }

    const userUpdate: Record<string, any> = {};
    if (name !== undefined) userUpdate.name = name;
    if (password !== undefined) userUpdate.password = password;
    if (Object.keys(userUpdate).length > 0) {
      await u.db("t_user").where("id", userId).update(userUpdate);
    }

    res.status(200).send(success({ message: "修改全局配置成功" }));
  }
);
