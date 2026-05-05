import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

// 从资产的 selectedImages 中移除一张参考图（并删除 OSS 文件）
export default router.post(
  "/",
  validateFields({
    assetId: z.coerce.number(),
    rawPath: z.string(),
  }),
  async (req, res) => {
    const { assetId, rawPath } = req.body;
    const asset = await u.db("t_assets").where("id", assetId).first();
    if (!asset) return res.status(404).json({ message: "资产不存在" });

    // 从 selectedImages 数组移除
    let imgs: string[] = [];
    try { if (asset.selectedImages) imgs = JSON.parse(asset.selectedImages); } catch { /**/ }
    const newImgs = imgs.filter((p: string) => p !== rawPath);
    await u.db("t_assets").where("id", assetId).update({
      selectedImages: newImgs.length > 0 ? JSON.stringify(newImgs) : null,
    });

    // 如果是封面图也一并清空
    if (asset.filePath === rawPath) {
      await u.db("t_assets").where("id", assetId).update({ filePath: null });
    }

    // 删除 OSS 文件
    try { await u.oss.deleteFile(rawPath); } catch { /**/ }

    res.status(200).json(success({ message: "已删除" }));
  },
);
