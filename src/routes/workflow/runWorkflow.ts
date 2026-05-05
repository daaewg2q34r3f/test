import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { executeWorkflowById } from "@/workflow/engine";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    workflowId: z.number(),
  }),
  async (req, res) => {
    const { workflowId } = req.body;
    const workflow = await u.db("t_workflow").where({ id: workflowId }).first();
    if (!workflow) return res.status(404).send(error("工作流不存在"));

    const now = Date.now();
    const [runId] = await u.db("t_workflow_run").insert({
      workflowId,
      projectId: workflow.projectId ?? null,
      status: "running",
      summary: "工作流执行中",
      logs: "[]",
      result: "{}",
      createTime: now,
      updateTime: now,
    });

    const execution = await executeWorkflowById(workflowId);

    await u.db("t_workflow_run").where({ id: runId }).update({
      status: execution.status,
      summary: execution.summary,
      logs: JSON.stringify(execution.logs),
      result: JSON.stringify({
        outputs: execution.outputs,
        nodeCount: execution.nodeCount,
      }),
      updateTime: Date.now(),
    });
    await u.db("t_workflow").where({ id: workflowId }).update({ updateTime: Date.now() });

    res.status(200).send(success({
      runId,
      workflowId,
      status: execution.status,
      summary: execution.summary,
      logs: execution.logs,
      outputs: execution.outputs,
    }));
  },
);
