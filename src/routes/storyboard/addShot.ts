import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number(),
    segmentId: z.number().optional(),
    shotIndex: z.number().optional(),
    name: z.string().optional(),
    prompt: z.string().optional(),
    duration: z.number().optional(),
    meta: z.string().optional(),
  }),
  async (req, res) => {
    const { projectId, scriptId, segmentId = 1, shotIndex = 1, name = "新镜头", prompt = "", duration = 4, meta } = req.body;
    const [id] = await u.db("t_assets").insert({
      projectId,
      scriptId,
      type: "分镜",
      name,
      prompt,
      duration,
      segmentId,
      shotIndex,
      intro: meta ?? null,
      filePath: null,
    });
    res.status(200).send(success({ id }));
  }
);
