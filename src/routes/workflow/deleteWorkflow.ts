import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.number(),
  }),
  async (req, res) => {
    const { id } = req.body;
    await u.db("t_workflow_run").where({ workflowId: id }).delete();
    await u.db("t_workflow").where({ id }).delete();
    res.status(200).send(success({ message: "工作流已删除" }));
  },
);
