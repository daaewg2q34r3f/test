import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

// 删除分镜生成图（清空 filePath，并删除 OSS 文件）
export default router.post(
  "/",
  validateFields({ id: z.coerce.number() }),
  async (req, res) => {
    const { id } = req.body;
    const shot = await u.db("t_assets").where("id", id).first();
    if (!shot) return res.status(404).json({ message: "分镜不存在" });

    if (shot.filePath) {
      try { await u.oss.deleteFile(shot.filePath); } catch { /**/ }
    }

    await u.db("t_assets").where("id", id).update({ filePath: null });
    res.status(200).json(success({ message: "已删除" }));
  },
);
