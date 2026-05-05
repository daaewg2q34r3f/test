import express from "express";
import u from "@/utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 保存资产图片
export default router.post(
  "/",
  validateFields({
    id: z.number(),
    projectId: z.number(),
    base64: z.string().optional().nullable(),
    filePath: z.string().optional().nullable(),
    prompt: z.string().optional().nullable(),
    artStyle: z.string().optional().nullable(),
    selectedImages: z.string().optional().nullable(),
  }),
  async (req, res) => {
    const { id, base64, filePath, prompt, projectId, artStyle, selectedImages } = req.body;

    // filePath === null 表示明确清除封面图
    if (filePath === null && !base64) {
      const currentAsset = await u.db("t_assets").where("id", id).select("filePath", "type").first();
      if (currentAsset?.filePath) {
        // 将旧封面图移回 t_image，方便还能在图片管理里看到
        const alreadyInTemp = await u.db("t_image").where("filePath", currentAsset.filePath).first();
        if (!alreadyInTemp) {
          await u.db("t_image").insert({
            assetsId: id,
            filePath: currentAsset.filePath,
            type: currentAsset.type || "image/jpeg",
            createTime: Date.now(),
          });
        }
      }
      await u.db("t_assets").where("id", id).update({ filePath: null });
      return res.status(200).send(success({ message: "封面已清除" }));
    }

    let savePath: string | undefined;
    let imageUrl: string | undefined;

    if (base64) {
      // base64图片上传逻辑
      const matches = base64.match(/^data:image\/\w+;base64,(.+)$/);
      const realBase64 = matches ? matches[1] : base64;
      // 生成新的图片路径
      savePath = `/${projectId}/assets/${uuidv4()}.png`;
      // 写入文件
      await u.oss.writeFile(savePath, Buffer.from(realBase64, "base64"));
      // 插入图片表
      await u.db("t_image").insert({
        assetsId: id,
        filePath: savePath,
        type: "image/png",
      });
      imageUrl = savePath; // 新图片路径
    } else if (filePath) {
      // 前端传入已存在图片路径
      try {
        savePath = new URL(filePath).pathname;
      } catch {
        savePath = filePath;
      }

      // 查旧资产图片（提前查，用于判断是否是已保存主图）
      const currentAsset = await u.db("t_assets").where("id", id).select("filePath", "type").first();

      // 如果选中的就是当前已保存的主图，只更新 prompt 即可
      if (currentAsset?.filePath && currentAsset.filePath === savePath) {
        if (prompt != null) {
          await u.db("t_assets").where("id", id).update({ prompt });
        }
        return res.status(200).send(success({ message: "保存资产图片成功" }));
      }

      // 检查图片表里是否有这条图片
      const selectedImage = await u.db("t_image").where("filePath", savePath).first();
      if (!selectedImage) {
        return res.status(404).send({ success: false, message: "所选图片不存在，请重新生成或选定图片" });
      }
      imageUrl = savePath;
    }

    // 查旧资产图片
    const oldAsset = await u.db("t_assets").where("id", id).select("filePath", "type").first();

    // 保存新旧图片差异和插临时表逻辑
    if (imageUrl && ((oldAsset?.filePath && oldAsset.filePath !== imageUrl) || (!oldAsset?.filePath && imageUrl))) {
      // 新图片保存，移除 t_image 表
      await u.db("t_image").where("filePath", imageUrl).delete();

      // 原图片如果存在、且不在 t_image 表，插入临时表
      if (oldAsset?.filePath) {
        const oldInTemp = await u.db("t_image").where("filePath", oldAsset.filePath).first();
        if (!oldInTemp) {
          await u.db("t_image").insert({
            assetsId: id,
            filePath: oldAsset.filePath,
            type: oldAsset.type,
          });
        }
      }

      // 更新资产表图片为新图片
      await u.db("t_assets").where("id", id).update({ filePath: imageUrl });
    }

    // 更新提示信息
    if (prompt != null) {
      await u.db("t_assets").where("id", id).update({ prompt });
    }
    if (artStyle !== undefined) {
      await u.db("t_assets").where("id", id).update({ artStyle: artStyle ?? null });
    }
    if (selectedImages !== undefined) {
      await u.db("t_assets").where("id", id).update({ selectedImages: selectedImages ?? null });
    }

    res.status(200).send(success({ message: "保存资产图片成功" }));
  },
);
