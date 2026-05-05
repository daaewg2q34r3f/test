import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 删除单张生成图片（t_image）
export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    const image = await u.db("t_image").where("id", id).first();
    if (!image) return res.status(404).send({ message: "图片不存在" });

    if (image.filePath) {
      try {
        await u.oss.deleteFile(image.filePath);
      } catch {
        // 文件不存在时忽略
      }
    }

    await u.db("t_image").where("id", id).del();
    res.status(200).send(success({ message: "删除成功" }));
  }
);
