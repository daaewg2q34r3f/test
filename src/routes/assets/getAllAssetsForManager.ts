import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

// 获取项目下所有资产及其完整图片列表（参考图管理页专用）
export default router.post(
  "/",
  validateFields({ projectId: z.number() }),
  async (req, res) => {
    const { projectId } = req.body;

    const assets = await u.db("t_assets")
      .where({ projectId })
      .select("id", "name", "type", "filePath", "selectedImages", "intro", "prompt", "scriptId", "segmentId", "shotIndex");

    const result = await Promise.all(assets.map(async (asset: any) => {
      const images: { path: string; url: string; isCover: boolean }[] = [];

      // Resolve selectedImages (reference image pool)
      if (asset.selectedImages) {
        try {
          const paths: string[] = JSON.parse(asset.selectedImages);
          for (const p of paths) {
            if (!p) continue;
            try {
              const url = await u.oss.getFileUrl(p);
              images.push({ path: p, url, isCover: asset.filePath === p });
            } catch { /**/ }
          }
        } catch { /**/ }
      }

      // filePath (cover) — add if not already in selectedImages
      let coverUrl = "";
      if (asset.filePath) {
        try {
          coverUrl = await u.oss.getFileUrl(asset.filePath);
          if (!images.some(img => img.path === asset.filePath)) {
            images.unshift({ path: asset.filePath, url: coverUrl, isCover: true });
          } else {
            // Mark the correct one as cover
            for (const img of images) img.isCover = img.path === asset.filePath;
          }
        } catch { /**/ }
      }

      return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        intro: asset.intro || "",
        prompt: asset.prompt || "",
        coverUrl,
        scriptId: asset.scriptId ?? null,
        segmentId: asset.segmentId ?? null,
        shotIndex: asset.shotIndex ?? null,
        images,
      };
    }));

    // Group by type
    const grouped: Record<string, typeof result> = {};
    for (const item of result) {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    }

    res.status(200).send(success(grouped));
  },
);
