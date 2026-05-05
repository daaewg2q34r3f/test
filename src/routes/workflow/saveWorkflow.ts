import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number().optional(),
    name: z.string(),
    description: z.string().optional(),
    projectId: z.number().nullable().optional(),
    templateKey: z.string().optional(),
    version: z.number().optional(),
    tags: z.array(z.string()).optional(),
    graph: z.any(),
  }),
  async (req, res) => {
    const now = Date.now();
    const payload = {
      name: req.body.name,
      description: req.body.description || "",
      projectId: req.body.projectId ?? null,
      templateKey: req.body.templateKey || "",
      version: req.body.version || 1,
      tags: JSON.stringify(req.body.tags || []),
      graph: JSON.stringify(req.body.graph || { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], groups: [] }),
      updateTime: now,
    };

    if (req.body.id) {
      await u.db("t_workflow").where({ id: req.body.id }).update(payload);
      return res.status(200).send(success({ id: req.body.id, message: "工作流已保存" }));
    }

    const [id] = await u.db("t_workflow").insert({
      ...payload,
      createTime: now,
    });

    res.status(200).send(success({ id, message: "工作流已创建" }));
  },
);
