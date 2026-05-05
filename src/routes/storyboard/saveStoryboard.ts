import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 保存分镜图
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    filePath: z.string().optional(),
    prompt: z.string().optional(),
    duration: z.number().optional(),
    videoPrompt: z.string().optional(),
    name: z.string().optional(),
    meta: z.string().optional().nullable(),
  }),
  async (req, res) => {
    const { filePath, id, prompt, duration, videoPrompt, name, meta } = req.body;

    const updateData: Record<string, any> = {};

    if (filePath) {
      const oldImage = await u.db("t_assets").where("id", id).select("filePath").first();
      const oldFilePath = oldImage?.filePath;
      const savePath = new URL(filePath).pathname;
      if (!oldFilePath || oldFilePath !== savePath) {
        updateData.filePath = savePath;
        if (oldFilePath) {
          await u.db("t_image").insert({ assetsId: id, filePath: oldFilePath, type: "分镜" });
          await u.db("t_image").where("assetsId", id).andWhere("filePath", savePath).del();
        }
      }
    }

    if (prompt != null) updateData.prompt = prompt;
    if (duration != null) updateData.duration = duration;
    if (videoPrompt != null) updateData.videoPrompt = videoPrompt;
    if (name != null) updateData.name = name;
    if (meta !== undefined) updateData.intro = meta;

    if (Object.keys(updateData).length > 0) {
      await u.db("t_assets").where("id", id).update(updateData);
    }

    res.status(200).send(success({ message: "保存成功" }));
  }
);
