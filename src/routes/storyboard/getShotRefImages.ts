import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

type ImageEntry = {
  url: string;
  rawPath: string;
  defaultSelected?: boolean;
};

type RefGroup = {
  id: number;
  name: string;
  type: string;
  images: ImageEntry[];
};

async function toImageEntry(stored: string, options?: { defaultSelected?: boolean }): Promise<ImageEntry | null> {
  if (!stored) return null;

  let relPath = stored;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    try {
      relPath = new URL(stored).pathname;
    } catch {
      return null;
    }
  }

  if (!(await u.oss.fileExists(relPath))) return null;
  const url = await u.oss.getFileUrl(relPath);
  return {
    url,
    rawPath: relPath,
    ...(options?.defaultSelected ? { defaultSelected: true } : {}),
  };
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    assetNames: z.array(z.string()),
    scriptId: z.number().optional(),
    segmentId: z.number().optional(),
    currentShotId: z.number().optional(),
  }),
  async (req, res) => {
    const { projectId, assetNames, scriptId, segmentId, currentShotId } = req.body;

    const result: RefGroup[] = [];

    if (assetNames.length > 0) {
      const assets = await u.db("t_assets")
        .where({ projectId })
        .whereNot({ type: "分镜" })
        .whereIn("name", assetNames)
        .select("id", "name", "type", "filePath", "selectedImages");

      for (const asset of assets) {
        const images: ImageEntry[] = [];

        if (asset.selectedImages) {
          try {
            const paths: string[] = JSON.parse(asset.selectedImages);
            for (const p of paths) {
              const entry = await toImageEntry(p);
              if (entry) images.push(entry);
            }
          } catch {
            /**/
          }
        }

        if (asset.filePath) {
          const relPath = asset.filePath.startsWith("http")
            ? new URL(asset.filePath).pathname
            : asset.filePath;

          if (!images.some((i) => i.rawPath === relPath)) {
            const entry = await toImageEntry(asset.filePath);
            if (entry) images.push(entry);
          }
        }

        result.push({ id: asset.id, name: asset.name, type: asset.type, images });
      }
    }

    if (scriptId && segmentId && segmentId > 1) {
      const previousSegmentShots = await u.db("t_assets")
        .where({ scriptId, type: "分镜", segmentId: segmentId - 1 })
        .whereNot({ filePath: null })
        .orderBy("shotIndex", "asc")
        .orderBy("id", "asc")
        .select("id", "name", "filePath");

      const previousSegmentImages: ImageEntry[] = [];
      const lastShotId = previousSegmentShots.length > 0
        ? Number(previousSegmentShots[previousSegmentShots.length - 1]?.id)
        : null;

      for (const shot of previousSegmentShots) {
        if (Number(shot.id) === lastShotId) continue;
        const entry = await toImageEntry(shot.filePath);
        if (entry) previousSegmentImages.push(entry);
      }

      if (previousSegmentImages.length > 0) {
        result.push({
          id: -2,
          name: `上一场参考（第${segmentId - 1}场）`,
          type: "上一场",
          images: previousSegmentImages,
        });
      }

      const previousSegmentLastShot = previousSegmentShots[previousSegmentShots.length - 1];
      if (previousSegmentLastShot?.filePath) {
        const entry = await toImageEntry(previousSegmentLastShot.filePath, { defaultSelected: true });
        if (entry) {
          result.push({
            id: -3,
            name: `上一场结尾参考（第${segmentId - 1}场）`,
            type: "上一场结尾",
            images: [entry],
          });
        }
      }
    }

    if (scriptId && segmentId) {
      const sameSegShots = await u.db("t_assets")
        .where({ scriptId, segmentId, type: "分镜" })
        .whereNot({ filePath: null })
        .modify((qb: any) => {
          if (currentShotId) qb.whereNot("id", currentShotId);
        })
        .select("id", "name", "filePath");

      const segImages: ImageEntry[] = [];
      for (const shot of sameSegShots) {
        if (shot.filePath) {
          const entry = await toImageEntry(shot.filePath);
          if (entry) segImages.push(entry);
        }
      }

      if (segImages.length > 0) {
        result.push({
          id: -1,
          name: `同场参考（第${segmentId}场）`,
          type: "同场",
          images: segImages,
        });
      }
    }

    res.status(200).send(success(result));
  },
);
