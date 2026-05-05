import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 获取资产
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    type: z.string(),
  }),
  async (req, res) => {
    const { projectId, type } = req.body;

    const data = await u.db("t_assets").where("projectId", projectId).where("type", type).select("*");

    for (const item of data) {
      if (item.filePath && await u.oss.fileExists(item.filePath)) {
        item.filePath = await u.oss.getFileUrl(item.filePath);
      } else {
        if (item.filePath) {
          await u.db("t_assets").where("id", item.id).update({ filePath: null });
        }
        item.filePath = "";
      }
    }

    res.status(200).send(success(data));
  }
);
