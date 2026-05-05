import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { getWorkflowNodeCatalog, getWorkflowTemplates } from "@/workflow/catalog";

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
    projectId: z.number().nullable().optional(),
  }),
  async (req, res) => {
    const projectId = req.body.projectId ?? null;
    const projects = await u.db("t_project").select("*").orderBy("createTime", "desc");

    const workflowQuery = u.db("t_workflow").select("*");
    if (projectId) {
      workflowQuery.where((builder) => builder.where("projectId", projectId).orWhereNull("projectId"));
    }
    const workflowRows = await workflowQuery.orderBy("updateTime", "desc");
    const workflowIds = workflowRows.map((item) => item.id).filter(Boolean) as number[];

    let latestRuns: any[] = [];
    if (workflowIds.length > 0) {
      latestRuns = await u.db("t_workflow_run")
        .whereIn("workflowId", workflowIds)
        .select("id", "workflowId", "status", "summary", "createTime")
        .orderBy("createTime", "desc");
    }

    const latestRunMap = new Map<number, any>();
    for (const run of latestRuns) {
      if (!run.workflowId || latestRunMap.has(run.workflowId)) continue;
      latestRunMap.set(run.workflowId, run);
    }

    let projectSummary = null;
    if (projectId) {
      const novels = await u.db("t_novel").where({ projectId }).count("* as total").first();
      const outlines = await u.db("t_outline").where({ projectId }).count("* as total").first();
      const scripts = await u.db("t_script").where({ projectId }).count("* as total").first();
      const assets = await u.db("t_assets").where({ projectId }).count("* as total").first();
      const storyboards = await u.db("t_assets").where({ projectId, type: "分镜" }).count("* as total").first();
      const scriptRows = await u.db("t_script").where({ projectId }).select("id");
      const scriptIds = scriptRows.map((item) => item.id).filter(Boolean) as number[];
      const videos = scriptIds.length
        ? await u.db("t_video").whereIn("scriptId", scriptIds).count("* as total").first()
        : { total: 0 };

      projectSummary = {
        projectId,
        novelCount: Number((novels as any)?.total || 0),
        outlineCount: Number((outlines as any)?.total || 0),
        scriptCount: Number((scripts as any)?.total || 0),
        assetCount: Number((assets as any)?.total || 0),
        storyboardCount: Number((storyboards as any)?.total || 0),
        videoCount: Number((videos as any)?.total || 0),
      };
    }

    res.status(200).send(success({
      projects,
      projectSummary,
      templates: getWorkflowTemplates(),
      nodeCatalog: getWorkflowNodeCatalog(),
      workflows: workflowRows.map((item) => {
        const latestRun = item.id ? latestRunMap.get(item.id) : null;
        return {
          id: item.id,
          name: item.name,
          description: item.description || "",
          projectId: item.projectId ?? null,
          templateKey: item.templateKey || "",
          tags: parseJson<string[]>(item.tags, []),
          version: item.version || 1,
          createTime: item.createTime || null,
          updateTime: item.updateTime || null,
          latestRun,
        };
      }),
    }));
  },
);
