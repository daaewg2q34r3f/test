import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { z } from "zod";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 获取生成图片
export default router.post(
  "/",
  validateFields({
    assetsId: z.number(),
  }),
  async (req, res) => {
    const { assetsId } = req.body;

    const assets = await u.db("t_assets").where("id", assetsId).select("id", "filePath", "scriptId", "type", "state").first();

    const tempAssets = await u.db("t_image").where("assetsId", assetsId).select("id", "filePath", "assetsId", "type", "state", "createTime");

    // 自动超时：生成中超过 5 分钟的图片标记为失败
    const timeout = 5 * 60 * 1000;
    const now = Date.now();
    for (const item of tempAssets) {
      if (item.state === "生成中" && item.createTime && now - item.createTime > timeout) {
        await u.db("t_image").where("id", item.id).update({ state: "生成失败" });
        item.state = "生成失败";
      }
    }

    for (const item of tempAssets) {
      if (item.filePath && await u.oss.fileExists(item.filePath)) {
        item.filePath = await u.oss.getFileUrl(item.filePath);
      } else {
        item.filePath = "";
      }
    }

    const coverExists = assets!.filePath && await u.oss.fileExists(assets!.filePath);
    const data = {
      id: assets!.id,
      state: assets!.state,
      filePath: coverExists ? await u.oss.getFileUrl(assets!.filePath) : "",
      scriptId: assets!.scriptId,
      tempAssets,
    };

    res.status(200).send(success(data));
  },
);
