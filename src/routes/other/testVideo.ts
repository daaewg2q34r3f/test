import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
import axios from "axios";
const router = express.Router();

// 检查视频模型连通性
export default router.post(
  "/",
  validateFields({
    modelName: z.string().optional(),
    apiKey: z.string(),
    baseURL: z.string().optional(),
    manufacturer: z.enum(["runninghub", "volcengine", "basicrouter", "apimart", "gemini", "openAi"]),
  }),
  async (req, res) => {
    const { modelName, apiKey, baseURL, manufacturer } = req.body;
    const cleanKey = apiKey.replace("Bearer ", "");
    try {
      if (manufacturer === "basicrouter") {
        const cleanedBaseUrl = (baseURL ?? "").trim().replace(/\/+$/, "");
        const taskUrl = cleanedBaseUrl
          ? /\/midwayApi\/createVideo$/i.test(cleanedBaseUrl)
            ? cleanedBaseUrl
            : /\/api$/i.test(cleanedBaseUrl)
              ? `${cleanedBaseUrl}/midwayApi/createVideo`
              : `${cleanedBaseUrl}/api/midwayApi/createVideo`
          : "https://api.basicrouter.ai/api/midwayApi/createVideo";
        const createRes = await axios.post(
          taskUrl,
          {
            model: modelName || "seedance-2.0",
            text: "a cat walking slowly in cinematic lighting",
            videoType: 1,
            duration: 4,
            resolution: "720p",
            ratio: "16:9",
            urls: [],
          },
          { headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" } },
        );
        const taskId = createRes.data?.id || createRes.data?.taskId || createRes.data?.task_id || createRes.data?.data?.id;
        if (!taskId) throw new Error("浠诲姟鍒涘缓澶辫触: " + JSON.stringify(createRes.data));
        res.status(200).send(success({ message: "杩炴帴鎴愬姛锛屼换鍔″凡鍒涘缓", taskId, data: createRes.data }));
      } else if (manufacturer === "volcengine") {
        const taskUrl = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
        // 创建一个真实的视频任务来测试连通性
        const createRes = await axios.post(
          taskUrl,
          {
            model: modelName || "doubao-seedance-1-0-lite-t2v-250428",
            content: [{ type: "text", text: "a cat --ratio 16:9 --resolution 720p --duration 5" }],
          },
          { headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" } },
        );
        const taskId = createRes.data?.id || createRes.data?.taskId || createRes.data?.task_id || createRes.data?.data?.id;
        if (!taskId) throw new Error("任务创建失败: " + JSON.stringify(createRes.data));
        res.status(200).send(success({ message: "连接成功，任务已创建", taskId }));
      } else if (manufacturer === "runninghub") {
        const testRes = await axios.post(
          "https://www.runninghub.cn/openapi/v2/rhart-video-s/text-to-video",
          { prompt: "a cat", model: modelName || "default" },
          { headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" } },
        );
        res.status(200).send(success({ message: "连接成功", data: testRes.data }));
      } else {
        res.status(400).send(error(`暂不支持测试厂商: ${manufacturer}`));
      }
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || "模型调用失败";
      res.status(500).send(error(message));
    }
  },
);
