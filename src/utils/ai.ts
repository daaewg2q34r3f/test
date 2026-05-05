import axios from "axios";
import u from "@/utils";
import FormData from "form-data";
import axiosRetry from "axios-retry";
import { OpenAIChatModel, type OpenAIChatModelOptions } from "@aigne/openai";
import sharp from "sharp";
import { logAIInput } from "@/utils/aiInputLogger";

axiosRetry(axios, { retries: 3, retryDelay: () => 200 });

// 清除系统代理环境变量，避免 VPN 关闭后代理失效导致请求超时
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

export const text = async (config: OpenAIChatModelOptions = {}) => {
  const { model, apiKey, baseURL } = await u.getConfig("language");
  return new OpenAIChatModel({
    apiKey: apiKey ?? "",
    baseURL: baseURL ?? "",
    model: model ?? "gpt-4.1",
    modelOptions: { temperature: 0.7 },
    ...config,
  });
};

interface ImageConfig {
  systemPrompt?: string;
  prompt: string;
  imageBase64: string[];
  imagePaths?: Array<string | { role?: string; path: string }>;
  size: "1K" | "2K" | "4K";
  aspectRatio: string;
  resType?: "url" | "b64";
  seed?: number;
  log?: {
    stage?: string;
    action?: string;
    targetId?: string | number;
    extra?: Record<string, unknown>;
  };
}

const urlToBase64 = async (url: string): Promise<string> => {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const base64 = Buffer.from(res.data).toString("base64");
  const mimeType = res.headers["content-type"] || "image/png";
  return `data:${mimeType};base64,${base64}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pollTask = async (
  queryFn: () => Promise<{ completed: boolean; imageUrl?: string; error?: string }>,
  maxAttempts = 500,
  interval = 2000,
): Promise<string> => {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(interval);
    const { completed, imageUrl, error } = await queryFn();
    if (error) throw new Error(error);
    if (completed && imageUrl) return imageUrl;
  }
  throw new Error(`任务轮询超时，已尝试 ${maxAttempts} 次`);
};

// 上传 base64 图片到 runninghub
const uploadBase64ToRunninghub = async (base64Image: string, apiKey: string, baseURL: string): Promise<string> => {
  try {
    apiKey = apiKey.replace("Bearer ", "");
    // 移除 base64 前缀
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    let buffer = Buffer.from(base64Data, "base64");

    // 压缩图片到 5MB 以下
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (buffer.length > MAX_SIZE) {
      let quality = 90;

      while (buffer.length > MAX_SIZE && quality > 10) {
        const compressed = await sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer();
        buffer = Buffer.from(compressed);
        quality -= 10;
      }

      // 如果仍然超过限制，进一步调整尺寸
      if (buffer.length > MAX_SIZE) {
        const metadata = await sharp(buffer).metadata();
        const scale = Math.sqrt(MAX_SIZE / buffer.length);

        const resized = await sharp(buffer)
          .resize({
            width: Math.floor((metadata.width || 1920) * scale),
            height: Math.floor((metadata.height || 1080) * scale),
            fit: "inside",
          })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();

        buffer = Buffer.from(resized);
      }
    }

    // 创建 FormData
    const formData = new FormData();
    formData.append("file", buffer, {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });

    // 上传图片
    const uploadRes = await axios.post(`https://www.runninghub.cn/openapi/v2/media/upload/binary`, formData, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (uploadRes.data.code !== 0 || !uploadRes.data.data?.download_url) {
      throw new Error(`图片上传失败: ${JSON.stringify(uploadRes.data)}`);
    }

    return uploadRes.data.data.download_url;
  } catch (error) {
    console.error("上传图片时发生错误:", error);
    throw error;
  }
};

const normalizeBasicRouterCreateImageUrl = (baseURL?: string) => {
  const fallback = "https://api.basicrouter.ai/api/midwayApi/createImage";
  const url = (baseURL ?? "").trim();
  if (!url) return fallback;
  const cleaned = url.replace(/\/+$/, "");
  if (/\/api$/i.test(cleaned)) return `${cleaned}/midwayApi/createImage`;
  return `${cleaned}/api/midwayApi/createImage`;
};

const buildAspectRatioPixelSize = (
  aspectRatio: string,
  highRes = false,
) => {
  const sizeMap: Record<string, string> = highRes
    ? { "16:9": "2560x1440", "9:16": "1440x2560", "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304" }
    : { "16:9": "1280x720", "9:16": "720x1280", "1:1": "1024x1024", "4:3": "1024x768", "3:4": "768x1024" };
  return sizeMap[aspectRatio] ?? (highRes ? "2560x1440" : "1280x720");
};

const mapBasicRouterImageResolution = (size: ImageConfig["size"]) => ({
  "1K": "1080p",
  "2K": "2k",
  "4K": "4k",
}[size] ?? "2k");

const extractGeneratedImage = (payload: any) => {
  const first = payload?.data?.[0] ?? payload?.images?.[0] ?? payload?.result?.images?.[0] ?? payload?.output?.images?.[0];
  if (first?.b64_json) return `data:image/jpeg;base64,${first.b64_json}`;
  return first?.url ?? first?.image_url ?? payload?.url ?? payload?.image_url ?? payload?.data?.url ?? payload?.result?.url ?? payload?.data?.imageUrls?.[0];
};

const generators = {
  volcengine: async (config: ImageConfig, apiKey: string, baseURL: string, model: string) => {
    apiKey = apiKey.replace("Bearer ", "");
    // doubao-seedream-4-5 requires ≥3,686,400 px; older models use lower res
    const needsHighRes = /seedream-4|seedream-5/i.test(model ?? "");
    const pixelSize = buildAspectRatioPixelSize(config.aspectRatio, needsHighRes);
    const body: Record<string, any> = {
      model: model || "doubao-seedream-3-0-t2i-250415",
      prompt: config.prompt,
      size: pixelSize,
      response_format: "b64_json",
    };
    // 关联模式：锁定 seed 提升多次生成的角色一致性
    if (config.seed !== undefined) body.seed = config.seed;
    // 图生图：存在图片时添加 image 字段（参考图，提升风格一致性）
    if (config.imageBase64 && config.imageBase64.length > 0) {
      body.image = config.imageBase64;
    }
    const res = await axios.post(`https://ark.cn-beijing.volces.com/api/v3/images/generations`, body, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const b64 = res.data.data[0].b64_json;
    return `data:image/jpeg;base64,${b64}`;
  },

  basicrouter: async (config: ImageConfig, apiKey: string, baseURL: string, model: string) => {
    apiKey = apiKey.replace("Bearer ", "");
    const taskUrl = normalizeBasicRouterCreateImageUrl(baseURL);
    const imageUrls = await toBasicRouterUrls(config.imagePaths);
    const body: Record<string, any> = {
      model,
      text: config.prompt,
      count: 1,
      resolution: mapBasicRouterImageResolution(config.size),
      ratio: config.aspectRatio,
      imageUrls,
    };
    const res = await axios.post(taskUrl, body, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    console.log("[basicrouter][image][generate]", JSON.stringify({
      taskUrl,
      model,
      resolution: body.resolution,
      ratio: body.ratio,
      imageUrls,
      status: res.status,
      data: res.data,
    }));

    if (res.data?.code !== 200) {
      throw new Error(`BasicRouter 图片生成失败: ${res.data?.message || JSON.stringify(res.data)}`);
    }

    const image = extractGeneratedImage(res.data);
    if (image) return image;

    throw new Error(`BasicRouter 图片生成失败: ${JSON.stringify(res.data)}`);
  },

  gemini: async (config: ImageConfig, apiKey: string, baseURL: string, model: string) => {
    apiKey = apiKey.replace("Bearer ", "");
    const messages = [
      ...(config.systemPrompt ? [{ role: "system", content: config.systemPrompt }] : []),
      { role: "user", content: config.prompt },
      ...config.imageBase64.map((img) => ({ role: "user", content: { image: img } })),
    ];
    const res = await axios.post(
      `${baseURL}/chat/completions`,
      { model, stream: false, messages, extra_body: { google: { image_config: { aspect_ratio: config.aspectRatio, image_size: config.size } } } },
      { headers: { Authorization: "Bearer " + apiKey } },
    );

    return res.data.choices[0].message.content;
  },

  runninghub: async (config: ImageConfig, apiKey: string, baseURL: string) => {
    apiKey = apiKey.replace("Bearer ", "");
    const imageUrls = await Promise.all(config.imageBase64.map((base64Image) => uploadBase64ToRunninghub(base64Image, apiKey, baseURL)));

    const endpoint = config.imageBase64.length === 0 ? "/openapi/v2/rhart-image-n-pro/text-to-image" : "/openapi/v2/rhart-image-n-pro/edit";
    const taskRes = await axios.post(
      `https://www.runninghub.cn${endpoint}`,
      { prompt: config.prompt, resolution: config.size, aspectRatio: config.aspectRatio, ...(imageUrls.length > 0 && { imageUrls }) },
      { headers: { Authorization: "Bearer " + apiKey } },
    );
    const taskId = taskRes.data.taskId;
    if (!taskId) throw new Error(`任务创建失败，${JSON.stringify(taskRes.data)}`);

    return pollTask(async () => {
      const res = await axios.post(`https://www.runninghub.cn/task/openapi/outputs`, { taskId, apiKey: apiKey });
      const { code, msg, data } = res.data;
      if (code === 0 && msg === "success") return { completed: true, imageUrl: data?.[0]?.fileUrl };
      if (code === 804 || code === 813) return { completed: false };
      if (code === 805) return { completed: false, error: `任务失败: ${data?.[0]?.failedReason?.exception_message || "未知原因"}` };
      return { completed: false, error: `未知状态: code=${code}, msg=${msg}` };
    });
  },

  apimart: async (config: ImageConfig, apiKey: string, baseURL: string, model: string) => {
    apiKey = apiKey.replace("Bearer ", "");
    const taskRes = await axios.post(
      `https://api.apimart.ai/v1/images/generations`,
      { model: "gemini-3-pro-image-preview", prompt: config.prompt, size: config.aspectRatio, n: 1, resolution: config.size },
      { headers: { Authorization: apiKey } },
    );

    if (taskRes.data.code !== 200 || !taskRes.data.data?.[0]?.task_id) throw new Error("任务创建失败: " + JSON.stringify(taskRes.data));

    const taskId = taskRes.data.data[0].task_id;
    return pollTask(async () => {
      const res = await axios.get(`https://api.apimart.ai/v1/tasks/${taskId}`, { headers: { Authorization: apiKey }, params: { language: "en" } });
      if (res.data.code !== 200) return { completed: false, error: `查询失败: ${JSON.stringify(res.data)}` };
      const { status, result } = res.data.data;
      if (status === "completed") return { completed: true, imageUrl: result?.images?.[0]?.url?.[0] };
      if (status === "failed" || status === "cancelled") return { completed: false, error: `任务${status}` };
      return { completed: false };
    });
  },
};

export const generateImage = async (config: ImageConfig, replaceConfig?: Awaited<ReturnType<typeof u.getConfig<"image">>>): Promise<string> => {
  let model = "", apiKey = "", baseURL = "", manufacturer = "";
  try {
    ({ model, apiKey, manufacturer } = await u.getConfig("image"));
  } catch {
    // 数据库无配置时，直接使用传入的 replaceConfig
  }
  if (replaceConfig) {
    model = replaceConfig.model || model;
    apiKey = replaceConfig.apiKey || apiKey;
    baseURL = replaceConfig.baseURL || baseURL;
    manufacturer = replaceConfig.manufacturer || manufacturer;
  }
  const imageManufacturer = manufacturer === "basicrouter" || isBasicRouterBaseUrl(baseURL) ? "basicrouter" : manufacturer;
  const generator = generators[imageManufacturer as keyof typeof generators];
  if (!generator) throw new Error(`不支持的厂商: ${manufacturer}`);

  await logAIInput({
    stage: config.log?.stage || "image",
    action: config.log?.action || "generate_image",
    targetId: config.log?.targetId,
    model,
    manufacturer: imageManufacturer,
    systemPrompt: config.systemPrompt,
    prompt: config.prompt,
    images: config.imagePaths || config.imageBase64.map((_, index) => ({ role: "reference", path: `[base64 image ${index + 1}]` })),
    extra: {
      ...config.log?.extra,
      size: config.size,
      aspectRatio: config.aspectRatio,
      seed: config.seed,
      referenceImageCount: config.imageBase64.length,
    },
  });

  let imageUrl = await generator(config, apiKey ?? "", baseURL ?? "", model ?? "");
  if (!config.resType) config.resType = "b64";
  if (config.resType === "b64" && imageUrl.startsWith("http")) imageUrl = await urlToBase64(imageUrl);
  return imageUrl;
};

type VideoAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "adaptive";
interface BaseVideoConfig {
  prompt: string;
  savePath: string;
  imageBase64?: string[]; // 单张参考图片 base64
  imagePaths?: Array<string | { role?: string; path: string }>;
  log?: {
    stage?: string;
    action?: string;
    targetId?: string | number;
    extra?: Record<string, unknown>;
  };
}
interface DoubaoVideoConfig extends BaseVideoConfig {
  duration: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12; // 支持 2~12 秒
  aspectRatio: VideoAspectRatio;
  audio?: boolean;
}
interface RunninghubVideoConfig extends BaseVideoConfig {
  duration: 10 | 15; // 仅支持 10 或 15 秒
  aspectRatio: "16:9" | "9:16" | "1:1"; // 仅支持这三种比例
}
interface OpenAIVideoConfig extends BaseVideoConfig {
  duration: 10 | 15; // 仅支持 10 或 15 秒
  aspectRatio: Exclude<VideoAspectRatio, "adaptive">; // 不支持 adaptive
}
type VideoConfig = DoubaoVideoConfig | RunninghubVideoConfig | OpenAIVideoConfig;
type VideoGenerationResult = {
  url: string;
  headers?: Record<string, string>;
  lastFrameUrl?: string;
};
const normalizeApiKey = (apiKey?: string) => (apiKey ?? "").trim().replace(/^Bearer\s+/i, "");
const normalizeVolcengineVideoTaskUrl = (baseURL?: string) => {
  const fallback = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
  const url = (baseURL ?? "").trim();
  if (!url) return fallback;
  const cleaned = url.replace(/\/+$/, "");
  if (/\/contents\/generations\/tasks$/i.test(cleaned)) return cleaned;
  if (/\/chat\/completions$/i.test(cleaned)) {
    return cleaned.replace(/\/chat\/completions$/i, "/contents/generations/tasks");
  }
  if (/\/api\/v3$/i.test(cleaned)) return `${cleaned}/contents/generations/tasks`;
  if (/\/api$/i.test(cleaned)) return `${cleaned}/v3/contents/generations/tasks`;
  return `${cleaned}/api/v3/contents/generations/tasks`;
};
const normalizeBasicRouterCreateVideoUrl = (baseURL?: string) => {
  const fallback = "https://api.basicrouter.ai/api/midwayApi/createVideo";
  const url = (baseURL ?? "").trim();
  if (!url) return fallback;
  const cleaned = url.replace(/\/+$/, "");
  if (/\/midwayApi\/createVideo$/i.test(cleaned)) return cleaned;
  if (/\/api$/i.test(cleaned)) return `${cleaned}/midwayApi/createVideo`;
  return `${cleaned}/api/midwayApi/createVideo`;
};
const normalizeBasicRouterGetVideoUrl = (baseURL?: string) => {
  const fallback = "https://api.basicrouter.ai/api/midwayApi/getVideoByTaskId";
  const url = (baseURL ?? "").trim();
  if (!url) return fallback;
  const cleaned = url.replace(/\/+$/, "");
  if (/\/midwayApi\/getVideoByTaskId$/i.test(cleaned)) return cleaned;
  if (/\/api$/i.test(cleaned)) return `${cleaned}/midwayApi/getVideoByTaskId`;
  return `${cleaned}/api/midwayApi/getVideoByTaskId`;
};
const isBasicRouterBaseUrl = (baseURL?: string) => /basicrouter\.ai/i.test((baseURL ?? "").trim());
const extractTaskId = (payload: any) =>
  payload?.id ??
  payload?.taskId ??
  payload?.task_id ??
  payload?.jobId ??
  payload?.job_id ??
  payload?.data?.id ??
  payload?.data?.taskId ??
  payload?.data?.task_id ??
  payload?.data?.jobId ??
  payload?.data?.job_id;
const extractTaskStatus = (payload: any) =>
  String(
    payload?.status ??
      payload?.state ??
      payload?.task_status ??
      payload?.data?.status ??
      payload?.data?.state ??
      payload?.data?.task_status ??
      "",
  ).toLowerCase();
const extractGeneratedVideoUrl = (payload: any) =>
  payload?.content?.video_url ??
  payload?.data?.content?.video_url ??
  payload?.video_url ??
  payload?.data?.video_url ??
  payload?.url ??
  payload?.data?.url ??
  payload?.output?.video_url ??
  payload?.data?.output?.video_url ??
  payload?.result?.video_url ??
  payload?.data?.result?.video_url ??
  payload?.result?.videos?.[0]?.url?.[0] ??
  payload?.data?.result?.videos?.[0]?.url?.[0] ??
  payload?.videos?.[0]?.url ??
  payload?.data?.videos?.[0]?.url ??
  payload?.content?.video_urls?.[0] ??
  payload?.data?.content?.video_urls?.[0] ??
  payload?.content?.unsigned_video_url ??
  payload?.data?.content?.unsigned_video_url ??
  payload?.content?.unsigned_video_urls?.[0] ??
  payload?.data?.content?.unsigned_video_urls?.[0];
const extractBasicRouterLastFrameUrl = (payload: any) =>
  payload?.data?.lastFrameUrl ??
  payload?.lastFrameUrl ??
  payload?.data?.last_frame_url ??
  payload?.last_frame_url;
const buildTaskQueryUrl = (taskUrl: string, payload: any, taskId: string) =>
  payload?.query_url ??
  payload?.polling_url ??
  payload?.data?.query_url ??
  payload?.data?.polling_url ??
  `${taskUrl}/${taskId}`;
const toAbsoluteUrl = (candidateUrl: string, baseURL?: string) => {
  if (!candidateUrl) return candidateUrl;
  if (/^https?:\/\//i.test(candidateUrl)) return candidateUrl;
  try {
    return new URL(candidateUrl, baseURL ?? "https://ark.cn-beijing.volces.com").toString();
  } catch {
    return candidateUrl;
  }
};
const getBasicRouterVideoType = (referenceCount: number) => {
  if (referenceCount <= 0) return 1;
  if (referenceCount === 1) return 2;
  if (referenceCount === 2) return 3;
  return 4;
};
const buildBasicRouterVideoPrompt = (
  prompt: string,
  imagePaths?: Array<string | { role?: string; path: string }>,
) => {
  const refs = Array.isArray(imagePaths) ? imagePaths : [];
  const landingRef = refs[refs.length - 1];
  const landingRole = typeof landingRef === "string" ? "" : String(landingRef?.role || "");
  if (!landingRole || !["last_frame", "continuity_landing_frame"].includes(landingRole)) return prompt;
  return [
    prompt,
    "Hard ending requirement: the final reference image is the mandatory landing frame for the current clip ending.",
    "Use the final 0.5-1.0 seconds to settle onto that frame as closely as possible in composition, pose, prop state, and camera momentum.",
    "Do not continue into a new action after reaching that ending frame.",
  ].filter(Boolean).join("\n");
};
const isPublicHttpUrl = (candidate: string) => {
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
};
const toBasicRouterUrls = async (imagePaths?: Array<string | { role?: string; path: string }>) => {
  if (!imagePaths || imagePaths.length === 0) return [] as string[];
  const urls = await Promise.all(
    imagePaths.map(async (item) => {
      const rawPath = typeof item === "string" ? item : item.path;
      if (!rawPath) return "";
      if (/^https?:\/\//i.test(rawPath)) return rawPath;
      return u.oss.getExternalFileUrl(rawPath);
    }),
  );
  const filteredUrls = urls.filter(Boolean);
  const invalidUrl = filteredUrls.find((url) => !isPublicHttpUrl(url));
  if (invalidUrl) {
    const quickTunnelHint = /trycloudflare\.com/i.test(invalidUrl)
      ? " 当前使用的是 Cloudflare quick tunnel；它的域名会频繁变化，而且隧道断开后旧地址会立刻失效。请重新启动 `npm run tunnel`，确认 `.env.tunnel` 或 `OSSURL` 已更新为最新地址。"
      : "";
    throw new Error(
      `BasicRouter 参考图需要公网可访问的图片地址，当前地址不可被外部访问: ${invalidUrl}。请先配置可用的内网穿透 OSSURL。${quickTunnelHint}`,
    );
  }
  return filteredUrls;
};
const generateVideoWithConfig = async (config: VideoConfig, configItem: { model: string; apiKey: string; baseURL: string; manufacturer: string }) => {
  const { baseURL, manufacturer, model } = configItem;
  const apiKey = normalizeApiKey(configItem.apiKey);
  if (!apiKey) throw new Error(`视频配置 ${model || manufacturer} 缺少 API Key`);
  const imageArrPath = [];
  for (const imageVal of config?.imageBase64!) {
    // 判断是否为base64串
    const isBase64 = typeof imageVal === "string" && /^data:image\/[a-zA-Z0-9\+\-\.]+;base64,[\s\S]+$/.test(imageVal.trim());
    if (isBase64) {
      imageArrPath.push(imageVal);
    } else {
      const base64 = await urlToBase64(imageVal);
      imageArrPath.push(base64);
    }
  }
  config.imageBase64 = imageArrPath;
  let generationResult: VideoGenerationResult | null = null;
  const videoManufacturer = manufacturer === "basicrouter" || isBasicRouterBaseUrl(baseURL) ? "basicrouter" : manufacturer;
  await logAIInput({
    stage: config.log?.stage || "video",
    action: config.log?.action || "generate_video",
    targetId: config.log?.targetId,
    model,
    manufacturer: videoManufacturer,
    prompt: config.prompt,
    images: config.imagePaths || imageArrPath.map((_, index) => ({ role: index === 0 ? "first_frame" : index === imageArrPath.length - 1 ? "last_frame" : "reference", path: `[base64 image ${index + 1}]` })),
    extra: {
      ...config.log?.extra,
      savePath: config.savePath,
      duration: (config as any).duration,
      aspectRatio: (config as any).aspectRatio,
      audio: (config as any).audio,
      referenceImageCount: imageArrPath.length,
    },
  });
  if (videoManufacturer === "basicrouter") {
    const basicRouterConfig = config as DoubaoVideoConfig;
    const taskUrl = normalizeBasicRouterCreateVideoUrl(baseURL);
    const statusUrl = normalizeBasicRouterGetVideoUrl(baseURL);
    const urls = await toBasicRouterUrls(config.imagePaths);
    const videoType = getBasicRouterVideoType(urls.length);
    const promptText = buildBasicRouterVideoPrompt(config.prompt, config.imagePaths);
    const createRes = await axios.post(
      taskUrl,
      {
        model: model || "seedance-2.0",
        text: promptText,
        videoType,
        duration: basicRouterConfig.duration,
        resolution: "720p",
        ratio: basicRouterConfig.aspectRatio,
        audio: basicRouterConfig.audio ?? true,
        urls,
      },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } },
    );
    console.log("[basicrouter][video][create]", JSON.stringify({
      taskUrl,
      model,
      videoType,
      urls,
      status: createRes.status,
      data: createRes.data,
    }));
    const taskId = extractTaskId(createRes.data);
    if (!taskId) throw new Error("视频任务创建失败");
    let basicRouterLastFrameUrl = "";
    const videoUrl = await pollTask(async () => {
      const res = await axios.get(statusUrl, {
        params: { taskId: String(taskId) },
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      console.log("[basicrouter][video][query]", JSON.stringify({
        queryUrl: statusUrl,
        status: res.status,
        data: res.data,
      }));
      if (res.data?.code !== 200) {
        return { completed: false, error: `BasicRouter query failed: ${JSON.stringify(res.data)}` };
      }
      const status = String(res.data?.data?.status ?? "").toLowerCase();
      const currentVideoUrl = res.data?.data?.videoUrl;
      const currentLastFrameUrl = extractBasicRouterLastFrameUrl(res.data);
      if (currentLastFrameUrl) {
        basicRouterLastFrameUrl = toAbsoluteUrl(currentLastFrameUrl, baseURL);
      }
      if (status === "succeeded" && currentVideoUrl) {
        return { completed: true, imageUrl: toAbsoluteUrl(currentVideoUrl, baseURL) };
      }
      if (status === "failed") {
        return { completed: false, error: `BasicRouter task failed: ${JSON.stringify(res.data?.data ?? res.data)}` };
      }
      if (["submitted", "queued", "running", "processing", "in_progress", "pending"].includes(status)) {
        return { completed: false };
      }
      if (currentVideoUrl) {
        return { completed: true, imageUrl: toAbsoluteUrl(currentVideoUrl, baseURL) };
      }
      return { completed: false, error: `Unknown BasicRouter task status: ${status || JSON.stringify(res.data)}` };
    });
    generationResult = { url: videoUrl, lastFrameUrl: basicRouterLastFrameUrl || undefined };
  } else if (videoManufacturer === "volcengine") {
    const doubaoConfig = config as DoubaoVideoConfig;
    const taskUrl = normalizeVolcengineVideoTaskUrl(baseURL);
    const createRes = await axios.post(
      taskUrl,
      {
        model: model || "doubao-seedance-1-5-pro-251215",
        content: [
          { type: "text", text: config.prompt },
          ...(doubaoConfig.imageBase64
            ? doubaoConfig.imageBase64.map((base64, i, arr) => ({
                type: "image_url",
                image_url: { url: base64 },
                ...(arr.length === 1
                  ? { role: "first_frame" }
                  : i === 0
                    ? { role: "first_frame" }
                    : i === arr.length - 1
                      ? { role: "last_frame" }
                      : {}),
              }))
            : []),
        ],
        generate_audio: doubaoConfig.audio ?? true,
        duration: doubaoConfig.duration,
        // i2v 模式（有图片）不支持 resolution 参数，仅 t2v 可用
        ...((!doubaoConfig.imageBase64 || doubaoConfig.imageBase64.length === 0) && { resolution: doubaoConfig.aspectRatio }),
        watermark: false,
      },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } },
    );
    if (videoManufacturer === "basicrouter") {
      console.log("[basicrouter][video][create]", JSON.stringify({
        taskUrl,
        model,
        status: createRes.status,
        data: createRes.data,
      }));
    }
    const taskId = extractTaskId(createRes.data);
    if (!taskId) throw new Error("视频任务创建失败");
    const queryUrl = buildTaskQueryUrl(taskUrl, createRes.data, String(taskId));
    const videoUrl = await pollTask(async () => {
      const res = await axios.get(queryUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (videoManufacturer === "basicrouter") {
        console.log("[basicrouter][video][query]", JSON.stringify({
          queryUrl,
          status: res.status,
          data: res.data,
        }));
      }
      const status = extractTaskStatus(res.data);
      const currentVideoUrl = extractGeneratedVideoUrl(res.data);
      if (["succeeded", "success", "completed"].includes(status) && currentVideoUrl) {
        return { completed: true, imageUrl: toAbsoluteUrl(currentVideoUrl, baseURL) };
      }
      if (["failed", "cancelled", "expired", "error"].includes(status)) {
        return { completed: false, error: `浠诲姟${status}: ${JSON.stringify(res.data)}` };
      }
      if (["queued", "running", "processing", "in_progress", "submitted", "pending"].includes(status)) {
        return { completed: false };
      }
      if (currentVideoUrl) {
        return { completed: true, imageUrl: toAbsoluteUrl(currentVideoUrl, baseURL) };
      }
      if (["failed", "cancelled", "expired"].includes(status)) return { completed: false, error: `任务${status}` };
      if (["queued", "running"].includes(status)) return { completed: false };
      return { completed: false, error: `未知状态: ${status}` };
    });
    generationResult = { url: videoUrl };
  } else if (manufacturer === "runninghub") {
    const runninghubConfig = config as RunninghubVideoConfig;
    // 如果有图片，先上传
    let uploadedImageUrl: string | undefined;
    if (runninghubConfig.imageBase64 && runninghubConfig.imageBase64.length > 0) {
      uploadedImageUrl = await uploadBase64ToRunninghub(runninghubConfig.imageBase64[0]!, apiKey ?? "", "https://www.runninghub.cn");
    }

    const endpoint = uploadedImageUrl ? "/openapi/v2/rhart-video-s/image-to-video" : "/openapi/v2/rhart-video-s/text-to-video";
    const requestBody = uploadedImageUrl
      ? {
          prompt: config.prompt,
          imageUrl: uploadedImageUrl,
          duration: String(runninghubConfig.duration) as "10" | "15",
          aspectRatio: runninghubConfig.aspectRatio,
        }
      : { prompt: config.prompt, model };
    const createRes = await axios.post(`https://www.runninghub.cn${endpoint}`, requestBody, {
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    });

    const { taskId, status: initialStatus, errorMessage } = createRes.data;
    if (!taskId) throw new Error(`视频任务创建失败: ${errorMessage || "未知错误"}`);
    if (initialStatus === "FAILED") throw new Error(`任务创建失败: ${errorMessage}`);
    const videoUrl = await pollTask(async () => {
      const res = await axios.post(
        `https://www.runninghub.cn/task/openapi/outputs`,
        { apiKey: apiKey?.replace("Bearer ", ""), taskId },
        { headers: { Authorization: "Bearer " + apiKey } },
      );
      const { code, msg, data } = res.data;

      // 成功完成
      if (code === 0 && msg === "success" && data?.[0]?.fileUrl) {
        return { completed: true, imageUrl: data[0].fileUrl };
      }

      // 进行中
      if (code === 804 || code === 813) {
        return { completed: false };
      }

      // 失败
      if (code === 805) {
        const failedReason = data?.[0]?.failedReason;
        let errorMsg = "未知原因";

        if (failedReason) {
          // 尝试多种可能的错误信息字段
          errorMsg =
            failedReason.exception_message ||
            failedReason.exceptionMessage ||
            failedReason.message ||
            failedReason.reason ||
            JSON.stringify(failedReason);
        }

        return {
          completed: false,
          error: `任务失败: ${errorMsg}`,
        };
      }

      // 其他未知状态
      return {
        completed: false,
        error: `未知状态: code=${code}, msg=${msg}, data=${JSON.stringify(data)}`,
      };
    });
    generationResult = { url: videoUrl };
  } else if (manufacturer === "openAi") {
    const openaiConfig = config as OpenAIVideoConfig;
    // 如果有图片，先上传
    let uploadedImageUrl: string | undefined;
    if (openaiConfig.imageBase64 && openaiConfig.imageBase64.length) {
      const base64Data = openaiConfig.imageBase64[0]!.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("file", buffer, { filename: "image.jpg", contentType: "image/jpeg" });
      const uploadRes = await axios.post(`${baseURL}/videos`, formData, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...formData.getHeaders(),
        },
      });
      uploadedImageUrl = uploadRes.data?.id || uploadRes.data?.url;
    }

    // 创建视频生成任务
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", config.prompt);
    formData.append("seconds", String(openaiConfig.duration));

    // 根据 aspectRatio 设置 size
    const sizeMap: Record<string, string> = {
      "16:9": "1920x1080",
      "9:16": "1080x1920",
      "1:1": "1080x1080",
      "4:3": "1440x1080",
      "3:4": "1080x1440",
      "21:9": "2560x1080",
    };
    formData.append("size", sizeMap[openaiConfig.aspectRatio] || "1920x1080");
    if (uploadedImageUrl) {
      formData.append("input_reference", uploadedImageUrl);
    }
    const createRes = await axios.post(`${baseURL}/videos`, formData, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
    });

    const taskId = createRes.data?.id;

    if (!taskId) throw new Error("视频任务创建失败");
    // 轮询任务状态
    const videoUrl = await pollTask(async () => {
      const res = await axios.get(`${baseURL}/videos/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      const { status, imageUrl, failReason } = res.data;
      if (status === "SUCCESS") return { completed: true, imageUrl };
      if (status === "FAILURE" || status === "CANCEL") {
        return { completed: false, error: `任务${status}: ${failReason || "未知原因"}` };
      }
      if (["NOT_START", "SUBMITTED", "IN_PROGRESS", "MODAL"].includes(status)) {
        return { completed: false };
      }
      return { completed: false, error: `未知状态: ${status}` };
    });
    generationResult = { url: videoUrl };
  } else if (manufacturer === "apimart") {
    // apimart 视频生成
    const apimartConfig = config as OpenAIVideoConfig;
    const apimartBaseURL = "https://api.apimart.ai";

    // 上传图片到 apimart 图床
    let imageUrls: string[] = [];
    if (apimartConfig.imageBase64 && apimartConfig.imageBase64.length > 0) {
      for (const base64Image of apimartConfig.imageBase64) {
        // 如果已经是 URL，直接使用
        if (base64Image.startsWith("http")) {
          imageUrls.push(base64Image);
          continue;
        }

        // 获取预签名 URL
        const presignRes = await axios.post(
          "https://apimart.ai/api/upload/presign",
          { contentType: "image/jpeg", fileExtension: "jpeg", permanent: false },
          { headers: { "Content-Type": "application/json" } },
        );

        if (!presignRes.data.success || !presignRes.data.presignedUrl || !presignRes.data.cdnUrl) {
          throw new Error(`获取预签名 URL 失败: ${JSON.stringify(presignRes.data)}`);
        }

        const { presignedUrl, cdnUrl } = presignRes.data;

        // 移除 base64 前缀并转为 buffer
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // 上传图片到预签名 URL
        await axios.put(presignedUrl, buffer, {
          headers: { "Content-Type": "image/jpeg" },
        });

        imageUrls.push(cdnUrl);
      }
    }

    // 创建视频生成任务
    const requestBody: {
      model: string;
      prompt: string;
      duration: number;
      aspect_ratio: string;
      image_urls?: string[];
    } = {
      model: model || "sora-2",
      prompt: config.prompt,
      duration: apimartConfig.duration,
      aspect_ratio: apimartConfig.aspectRatio,
    };

    if (imageUrls.length > 0) {
      requestBody.image_urls = imageUrls;
    }

    const createRes = await axios.post(`${apimartBaseURL}/v1/videos/generations`, requestBody, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (createRes.data.code !== 200 || !createRes.data.data?.[0]?.task_id) {
      const errorMsg = createRes.data.error?.message || JSON.stringify(createRes.data);
      throw new Error(`视频任务创建失败: ${errorMsg}`);
    }

    const taskId = createRes.data.data[0].task_id;

    // 轮询任务状态
    const videoUrl = await pollTask(async () => {
      const res = await axios.get(`${apimartBaseURL}/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: { language: "en" },
      });

      // 检查是否有错误
      if (res.data.error) {
        return {
          completed: false,
          error: `查询失败: ${res.data.error.message || JSON.stringify(res.data.error)}`,
        };
      }

      if (res.data.code !== 200) {
        return { completed: false, error: `查询失败: ${JSON.stringify(res.data)}` };
      }

      const { status, result } = res.data.data;

      if (status === "completed") {
        // 获取视频 URL
        const videoUrlResult = result?.videos?.[0]?.url?.[0];
        return { completed: true, imageUrl: videoUrlResult };
      }

      if (status === "failed" || status === "cancelled") {
        return { completed: false, error: `任务${status}` };
      }

      // 其他状态（submitted, processing 等）继续轮询
      return { completed: false };
    });
    generationResult = { url: videoUrl };
  } else {
    throw new Error(`不支持的厂商: ${manufacturer}`);
  }
  return generationResult;
};
export const generateVideo = async (config: VideoConfig, manufacturer: string) => {
  if (!config.imageBase64 || config.imageBase64.length <= 0) throw new Error("未传图片");
  const normalizedManufacturer = (manufacturer || "").trim();
  const hasExplicitManufacturer = normalizedManufacturer && normalizedManufacturer !== "default";
  let configList = hasExplicitManufacturer
    ? await u.getConfig("video", normalizedManufacturer)
    : await u.getConfig("video");
  if ((!configList || configList.length === 0) && hasExplicitManufacturer) {
    console.warn(`[video] 未找到厂商 ${normalizedManufacturer} 的专属配置，回退使用全局视频配置`);
    configList = await u.getConfig("video");
  }
  if (!configList || configList.length === 0) {
    throw new Error("未找到任何视频配置");
  }
  let lastError: Error | null = null;
  for (const configItem of configList) {
    // 每个配置项重试1次，共2次尝试
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const generationResult = await generateVideoWithConfig(config, configItem);
        if (generationResult?.url) {
          const response = await axios.get(generationResult.url, {
            responseType: "stream",
            headers: generationResult.headers,
          });
          await u.oss.writeFile(config.savePath, response.data);
          return {
            path: config.savePath,
            lastFrameUrl: generationResult.lastFrameUrl,
          };
        }
        return generationResult as any;
      } catch (error: any) {
        lastError = error as Error;
        console.warn(`配置 ${configItem.model} 第 ${attempt + 1} 次尝试失败:`, error?.response?.data || error.message);
        // 如果是第一次尝试失败，继续重试
        if (attempt === 0) continue;
        // 第二次也失败了,跳到下一个配置项
        break;
      }
    }
  }
  // 所有配置都失败了
  throw new Error(`所有视频配置都失败了。最后一次错误: ${lastError?.message || "未知错误"}`);
};
