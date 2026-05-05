import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
    name: z.string().optional(),
  }),
  async (req, res) => {
    const { id, name } = req.body;
    const workflow = await u.db("t_workflow").where({ id }).first();
    if (!workflow) return res.status(404).send(error("工作流不存在"));

    const now = Date.now();
    const [newId] = await u.db("t_workflow").insert({
      name: name || `${workflow.name || "未命名工作流"} 副本`,
      description: workflow.description || "",
      projectId: workflow.projectId ?? null,
      templateKey: workflow.templateKey || "",
      tags: workflow.tags || "[]",
      version: workflow.version || 1,
      graph: workflow.graph || "",
      createTime: now,
      updateTime: now,
    });

    res.status(200).send(success({ id: newId, message: "工作流已复制" }));
  },
);
