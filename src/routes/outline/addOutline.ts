import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
const router = express.Router();

// 新增大纲
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    episode: z.number(),
    data: z.string(),
  }),
  async (req, res) => {
    const { projectId, episode, data } = req.body;

    const [id] = await u.db("t_outline").insert({
      data,
      episode,
      projectId,
    });

    res.status(200).send(success({ id, message: "新增大纲成功" }));
  }
);
