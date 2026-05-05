import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const router = express.Router();

type MediaInfo = {
  duration: number;
  hasAudio: boolean;
};

const EDGE_TRIM_SECONDS = 0.15;
const MIN_SEGMENT_SECONDS = 0.35;

function probeMedia(inputPath: string): Promise<MediaInfo> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        resolve({ duration: 0.1, hasAudio: false });
        return;
      }

      const hasAudio = metadata.streams?.some((stream: any) => stream.codec_type === "audio") ?? false;
      const streamDuration = metadata.streams
        ?.map((stream: any) => Number(stream.duration))
        .find((duration) => Number.isFinite(duration) && duration > 0);
      const duration = Number(metadata.format?.duration) || streamDuration || 0.1;

      resolve({ duration: Math.max(duration, 0.1), hasAudio });
    });
  });
}

function getTrimmedDuration(duration: number) {
  if (duration <= MIN_SEGMENT_SECONDS) return duration;
  const trimPerSide = duration > EDGE_TRIM_SECONDS * 2 + MIN_SEGMENT_SECONDS
    ? EDGE_TRIM_SECONDS
    : 0;
  return Math.max(duration - trimPerSide * 2, MIN_SEGMENT_SECONDS);
}

function getTrimStart(duration: number) {
  return duration > EDGE_TRIM_SECONDS * 2 + MIN_SEGMENT_SECONDS ? EDGE_TRIM_SECONDS : 0;
}

// Merge all completed shot videos in the current script into one full video.
export default router.post(
  "/",
  validateFields({
    scriptId: z.number(),
    projectId: z.number(),
  }),
  async (req, res) => {
    const { scriptId, projectId } = req.body;

    const videos = await u
      .db("t_video")
      .where({ scriptId, state: 1 })
      .whereNotNull("filePath")
      .select("id", "filePath", "configId", "batchId");

    if (videos.length === 0) {
      return res.status(400).json(error("当前集没有已完成的视频"));
    }

    const configIds = videos.map((v: any) => v.configId).filter(Boolean);
    const configs = configIds.length > 0
      ? await u.db("t_videoConfig").whereIn("id", configIds).select("id", "startFrame")
      : [];

    const configMap = new Map(
      configs.map((c: any) => [
        c.id,
        c.startFrame ? JSON.parse(c.startFrame)?.id ?? 0 : 0,
      ]),
    );

    const assetIds = Array.from(configMap.values()).filter(Boolean);
    const assets = assetIds.length > 0
      ? await u.db("t_assets").whereIn("id", assetIds).select("id", "segmentId", "shotIndex")
      : [];
    const assetOrderMap = new Map(
      assets.map((a: any) => [a.id, (a.segmentId ?? 1) * 1000 + (a.shotIndex ?? 1)]),
    );

    const currentVideos = videos.filter((video: any) => {
      const assetId = configMap.get(video.configId) ?? 0;
      return !assetId || assetOrderMap.has(assetId);
    });

    const latestVideoByShot = new Map<string, any>();
    for (const video of [...currentVideos].sort((a: any, b: any) => Number(b.id) - Number(a.id))) {
      const assetId = configMap.get(video.configId) ?? 0;
      const key = assetId ? `asset:${assetId}` : `config:${video.configId || video.id}`;
      if (!latestVideoByShot.has(key)) latestVideoByShot.set(key, video);
    }

    const latestVideos = Array.from(latestVideoByShot.values());
    const expectedShotCount = latestVideos.length;
    const batchStats = new Map<string, { count: number; latestId: number }>();
    for (const video of currentVideos) {
      const batchId = String(video.batchId || "").trim();
      if (!batchId) continue;
      const assetId = configMap.get(video.configId) ?? 0;
      const key = assetId ? `asset:${assetId}` : `config:${video.configId || video.id}`;
      const current = batchStats.get(batchId) || { count: 0, latestId: 0 };
      const seenKey = `__seen_${key}`;
      if (!(current as any)[seenKey]) {
        (current as any)[seenKey] = true;
        current.count += 1;
      }
      current.latestId = Math.max(current.latestId, Number(video.id) || 0);
      batchStats.set(batchId, current);
    }

    const preferredBatchId = Array.from(batchStats.entries())
      .filter(([, stat]) => stat.count === expectedShotCount)
      .sort((a, b) => b[1].latestId - a[1].latestId)[0]?.[0] || "";

    const sourceVideos = preferredBatchId
      ? latestVideos.filter((video: any) => String(video.batchId || "") === preferredBatchId)
      : latestVideos;

    const sortedVideos = sourceVideos.sort((a: any, b: any) => {
      const aAssetId = configMap.get(a.configId) ?? 0;
      const bAssetId = configMap.get(b.configId) ?? 0;
      return Number(assetOrderMap.get(aAssetId) ?? 0) - Number(assetOrderMap.get(bAssetId) ?? 0);
    });

    const uploadDir = path.join(process.cwd(), "uploads");
    const videoItems = sortedVideos
      .map((v: any) => {
        return {
          path: path.join(uploadDir, v.filePath),
        };
      })
      .filter((item: { path: string }) => fs.existsSync(item.path));
    const inputPaths = videoItems.map(item => item.path);

    if (inputPaths.length === 0) {
      return res.status(400).json(error("视频文件不存在，请重新生成"));
    }

    const outputRelPath = `/${projectId}/video/merged_${scriptId}_${uuidv4()}.mp4`;
    const outputPath = path.join(uploadDir, outputRelPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    try {
      const mediaInfos = await Promise.all(inputPaths.map(probeMedia));
      const trimmedDurations = mediaInfos.map((info) => getTrimmedDuration(info.duration));

      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg();
        for (const inputPath of inputPaths) {
          command.input(inputPath);
        }

        const filterParts = inputPaths.flatMap((_, i) => {
          const sourceDuration = mediaInfos[i]?.duration ?? 0.1;
          const start = getTrimStart(sourceDuration);
          const duration = trimmedDurations[i] ?? 0.1;
          const audioFilter = mediaInfos[i]?.hasAudio
            ? `[${i}:a]atrim=start=${start.toFixed(3)}:duration=${duration.toFixed(3)},` +
              `asetpts=PTS-STARTPTS,aresample=44100,` +
              `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`
            : `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${duration.toFixed(3)},` +
              `asetpts=PTS-STARTPTS,` +
              `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`;

          return [
            `[${i}:v]trim=start=${start.toFixed(3)}:duration=${duration.toFixed(3)},` +
              `setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,` +
              `pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,settb=AVTB,setsar=1,format=yuv420p[v${i}]`,
            audioFilter,
          ];
        });
        const concatInputs = inputPaths.map((_, i) => `[v${i}][a${i}]`).join("");
        const transitionFilters = inputPaths.length > 1
          ? [`${concatInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`]
          : [];
        const finalVideoLabel = inputPaths.length > 1 ? "outv" : "v0";
        const finalAudioLabel = inputPaths.length > 1 ? "outa" : "a0";

        const filterComplex = [...filterParts, ...transitionFilters].join(";");

        command
          .complexFilter(filterComplex)
          .outputOptions([
            `-map [${finalVideoLabel}]`,
            `-map [${finalAudioLabel}]`,
            "-c:v libx264",
            "-c:a aac",
            "-b:a 192k",
            "-preset fast",
            "-crf 23",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-shortest",
          ])
          .on("error", (err) => reject(new Error(err.message)))
          .on("end", resolve)
          .save(outputPath);
      });

      const url = await u.oss.getFileUrl(outputRelPath);
      res.status(200).json(success({ url, count: inputPaths.length, batchId: preferredBatchId || null }));
    } catch (err: any) {
      console.error("视频合并失败:", err?.message || err);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      res.status(500).json(error(err?.message || "视频合并失败"));
    }
  },
);
