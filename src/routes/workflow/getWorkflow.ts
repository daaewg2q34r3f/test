import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    const workflow = await u.db("t_workflow").where({ id }).first();
    if (!workflow) return res.status(404).send(error("工作流不存在"));

    const runs = await u.db("t_workflow_run")
      .where({ workflowId: id })
      .orderBy("createTime", "desc")
      .limit(12);

    res.status(200).send(success({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description || "",
        projectId: workflow.projectId ?? null,
        templateKey: workflow.templateKey || "",
        tags: parseJson<string[]>(workflow.tags, []),
        version: workflow.version || 1,
        graph: parseJson(workflow.graph, {
          version: 1,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
          groups: [],
        }),
        createTime: workflow.createTime || null,
        updateTime: workflow.updateTime || null,
      },
      runs: runs.map((item) => ({
        id: item.id,
        workflowId: item.workflowId,
        projectId: item.projectId ?? null,
        status: item.status || "unknown",
        summary: item.summary || "",
        logs: parseJson(item.logs, []),
        result: parseJson(item.result, {}),
        createTime: item.createTime || null,
        updateTime: item.updateTime || null,
      })),
    }));
  },
);
