import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { createWorkflowDraftFromTemplate } from "@/workflow/catalog";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    templateKey: z.string(),
    projectId: z.number().nullable().optional(),
  }),
  async (req, res) => {
    const { templateKey } = req.body;
    const projectId = req.body.projectId ?? null;
    const draft = createWorkflowDraftFromTemplate(templateKey, projectId);
    if (!draft) return res.status(404).send(error("模板不存在"));

    const now = Date.now();
    const [id] = await u.db("t_workflow").insert({
      ...draft,
      createTime: now,
      updateTime: now,
    });

    res.status(200).send(success({ id, message: "模板已导入工作台" }));
  },
);
