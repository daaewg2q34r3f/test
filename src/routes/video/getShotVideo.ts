import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

// 查询某个分镜镜头的最新视频状态
// state: 0=生成中, 1=完成, -1=失败
export default router.post(
  "/",
  validateFields({
    shotIds: z.array(z.number()),
  }),
  async (req, res) => {
    const { shotIds } = req.body;
    if (!shotIds.length) return res.status(200).send(success([]));

    try {
      // 每个 shotId 取最新一条记录
      const videos = await u.db("t_video")
        .whereIn("shotId", shotIds)
        .orderBy("id", "desc")
        .select("id", "shotId", "state", "filePath");

      // 去重，每个 shotId 只保留最新一条
      const map = new Map<number, any>();
      for (const v of videos) {
        if (!map.has(v.shotId)) map.set(v.shotId, v);
      }

      const result = await Promise.all(
        Array.from(map.values()).map(async (v) => {
          let url = "";
          if (v.state === 1 && v.filePath) {
            // filePath 可能已是完整 URL，也可能是相对路径
            if (v.filePath.startsWith("http://") || v.filePath.startsWith("https://")) {
              url = v.filePath;
            } else {
              url = await u.oss.getFileUrl(v.filePath);
            }
          }
          return {
            shotId: v.shotId,
            videoId: v.id,
            state: v.state, // 0=生成中, 1=完成, -1=失败
            url,
          };
        })
      );

      res.status(200).send(success(result));
    } catch (err: any) {
      // shotId 列可能还未迁移，返回空数组不报错
      console.error("getShotVideo error:", err?.message);
      res.status(200).send(success([]));
    }
  }
);
