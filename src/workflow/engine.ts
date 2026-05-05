import u from "@/utils";
import type { WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode } from "@/workflow/catalog";

export interface WorkflowRunLog {
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  status: "success" | "skipped" | "error";
  message: string;
  timestamp: number;
  output?: any;
}

export interface WorkflowExecutionResult {
  status: "success" | "error";
  summary: string;
  nodeCount: number;
  logs: WorkflowRunLog[];
  outputs: Record<string, any>;
}

function safeParseGraph(rawGraph: string | null | undefined): WorkflowGraph {
  if (!rawGraph) {
    return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], groups: [] };
  }
  try {
    const parsed = JSON.parse(rawGraph) as WorkflowGraph;
    return {
      version: parsed.version || 1,
      viewport: parsed.viewport || { x: 0, y: 0, zoom: 1 },
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch {
    return { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], groups: [] };
  }
}

function sortNodes(nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]);
  }

  const queue = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
  const result: WorkflowGraphNode[] = [];

  while (queue.length > 0) {
    const nextId = queue.shift()!;
    const currentNode = nodeMap.get(nextId);
    if (!currentNode) continue;
    result.push(currentNode);
    for (const targetId of adjacency.get(nextId) || []) {
      const nextDegree = (indegree.get(targetId) || 0) - 1;
      indegree.set(targetId, nextDegree);
      if (nextDegree === 0) queue.push(targetId);
    }
  }

  if (result.length !== nodes.length) {
    return [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  return result;
}

async function getProjectContext(projectId?: number | null) {
  if (!projectId) return null;
  const project = await u.db("t_project").where({ id: projectId }).first();
  if (!project) return null;

  const novels = await u.db("t_novel").where({ projectId }).select("id", "chapter", "chapterIndex");
  const outlines = await u.db("t_outline").where({ projectId }).select("id", "episode");
  const scripts = await u.db("t_script").where({ projectId }).select("id", "name");
  const assets = await u.db("t_assets").where({ projectId }).select("id", "type", "name");
  const storyboardCountRow = await u.db("t_assets").where({ projectId, type: "分镜" }).count("* as total").first();
  const scriptIds = scripts.map((item) => item.id).filter(Boolean) as number[];
  const videoCountRow = scriptIds.length
    ? await u.db("t_video").whereIn("scriptId", scriptIds).count("* as total").first()
    : { total: 0 };

  return {
    project,
    summary: {
      novelCount: novels.length,
      outlineCount: outlines.length,
      scriptCount: scripts.length,
      assetCount: assets.length,
      storyboardCount: Number((storyboardCountRow as any)?.total || 0),
      videoCount: Number((videoCountRow as any)?.total || 0),
    },
    novels,
    outlines,
    scripts,
    assets,
  };
}

function getUpstreamOutputs(nodeId: string, edges: WorkflowGraphEdge[], outputs: Record<string, any>) {
  const upstreamNodeIds = edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
  return upstreamNodeIds
    .map((upstreamId) => outputs[upstreamId])
    .filter((item) => item !== undefined);
}

async function executeNode(
  node: WorkflowGraphNode,
  projectContext: Awaited<ReturnType<typeof getProjectContext>>,
  upstreamOutputs: any[],
) {
  const summary = projectContext?.summary || {
    novelCount: 0,
    outlineCount: 0,
    scriptCount: 0,
    assetCount: 0,
    storyboardCount: 0,
    videoCount: 0,
  };
  const project = projectContext?.project || null;

  switch (node.type) {
    case "project_input":
      return {
        message: project
          ? `已加载项目「${project.name || "未命名项目"}」`
          : "当前未绑定项目，节点仅返回空上下文",
        output: {
          projectId: project?.id ?? null,
          name: project?.name ?? "",
          type: project?.type ?? "",
          artStyle: project?.artStyle ?? "",
          videoRatio: project?.videoRatio ?? "",
        },
      };
    case "novel_input":
      return {
        message: `读取到 ${summary.novelCount} 条小说章节`,
        output: {
          count: summary.novelCount,
          sampleTitles: (projectContext?.novels || []).slice(0, 3).map((item) => item.chapter || `第 ${item.chapterIndex || 0} 章`),
          limit: node.config?.limit || null,
        },
      };
    case "storyline_summary":
      return {
        message: "故事线节点已根据项目上下文生成摘要",
        output: {
          summary: `项目当前已有 ${summary.novelCount} 条原稿、${summary.outlineCount} 条大纲，可继续推进阶段创作。`,
          focus: node.config?.focus || "项目现状总览",
        },
      };
    case "outline_input":
      return {
        message: `读取到 ${summary.outlineCount} 条分集大纲`,
        output: {
          count: summary.outlineCount,
          episodes: (projectContext?.outlines || []).slice(0, 5).map((item) => item.episode),
        },
      };
    case "script_input":
      return {
        message: `读取到 ${summary.scriptCount} 条剧本记录`,
        output: {
          count: summary.scriptCount,
          names: (projectContext?.scripts || []).slice(0, 5).map((item) => item.name || "未命名剧本"),
        },
      };
    case "asset_inventory":
      return {
        message: `读取到 ${summary.assetCount} 条资产，含 ${summary.storyboardCount} 条分镜资产`,
        output: {
          count: summary.assetCount,
          grouped: (projectContext?.assets || []).reduce<Record<string, number>>((acc, asset) => {
            const type = asset.type || "未分类";
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {}),
        },
      };
    case "storyboard_input":
      return {
        message: `读取到 ${summary.storyboardCount} 条分镜资产`,
        output: {
          count: summary.storyboardCount,
          readyForVideo: summary.storyboardCount > 0,
        },
      };
    case "subtitle_generate":
      return {
        message: "已生成字幕规划草案",
        output: {
          status: "simulated",
          segments: Math.max(summary.scriptCount, 1),
          basedOn: upstreamOutputs[0] || null,
          language: node.config?.language || "zh-CN",
        },
      };
    case "character_voice":
      return {
        message: "已生成角色配音任务草案",
        output: {
          status: "simulated",
          voiceTracks: Math.max(summary.scriptCount, 1),
          dependencies: upstreamOutputs.length,
          voiceStyle: node.config?.voiceStyle || "emotional",
        },
      };
    case "narration_voice":
      return {
        message: "已生成旁白配音计划",
        output: {
          status: "simulated",
          narratorEnabled: true,
          tone: node.config?.tone || "剧情旁白",
        },
      };
    case "bgm_generate":
      return {
        message: "已生成 BGM 编排草案",
        output: {
          status: "simulated",
          suggestedMood: summary.storyboardCount > 0 ? "跟随分镜情绪曲线" : "等待分镜输入",
          mood: node.config?.mood || "",
        },
      };
    case "sfx_generate":
      return {
        message: "已生成音效规划草案",
        output: {
          status: "simulated",
          cues: Math.max(summary.storyboardCount, 1),
          intensity: node.config?.intensity || null,
        },
      };
    case "video_generate":
      return {
        message: "已创建视频生成任务骨架",
        output: {
          status: "simulated",
          ready: summary.storyboardCount > 0,
          existingVideos: summary.videoCount,
          model: node.config?.model || "",
          resolution: node.config?.resolution || "",
        },
      };
    case "approval_gate":
      return {
        message: "人工确认节点默认标记为待确认后继续",
        output: {
          approved: false,
          status: "manual-review",
          reviewLabel: node.config?.reviewLabel || "",
        },
      };
    case "branch_condition":
      return {
        message: "条件分支节点已执行默认判断",
        output: {
          branch: summary.scriptCount > 0 ? "true" : "false",
          expression: node.config?.expression || "",
        },
      };
    case "loop_batch":
      return {
        message: "批量循环节点已根据现有分集数量给出批处理规模",
        output: {
          batchSize: Math.max(summary.outlineCount, summary.scriptCount, 1),
          loopBy: node.config?.loopBy || "episodes",
        },
      };
    case "agent_skill":
      return {
        message: "Agent / Skill 节点当前作为扩展占位，已返回模拟结果",
        output: {
          status: "simulated",
          goal: node.config?.goal || "围绕当前项目继续推进工作流",
          skill: node.config?.skill || "",
        },
      };
    case "export_package":
      return {
        message: "已生成导出包结构说明",
        output: {
          status: "simulated",
          files: ["workflow.json", "run-log.json", "video-manifest.json"],
          format: node.config?.format || "package",
        },
      };
    default:
      return {
        message: `${node.title} 当前属于规划节点，已记录占位执行结果`,
        output: {
          status: "planned",
          upstreamCount: upstreamOutputs.length,
        },
      };
  }
}

export async function executeWorkflowById(workflowId: number): Promise<WorkflowExecutionResult> {
  const workflow = await u.db("t_workflow").where({ id: workflowId }).first();
  if (!workflow) {
    return {
      status: "error",
      summary: "工作流不存在",
      nodeCount: 0,
      logs: [],
      outputs: {},
    };
  }

  const graph = safeParseGraph(workflow.graph);
  const sortedNodes = sortNodes(graph.nodes, graph.edges);
  const projectContext = await getProjectContext(workflow.projectId || null);
  const outputs: Record<string, any> = {};
  const logs: WorkflowRunLog[] = [];

  for (const node of sortedNodes) {
    try {
      const upstreamOutputs = getUpstreamOutputs(node.id, graph.edges, outputs);
      const result = await executeNode(node, projectContext, upstreamOutputs);
      outputs[node.id] = result.output;
      logs.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: node.title,
        status: "success",
        message: result.message,
        timestamp: Date.now(),
        output: result.output,
      });
    } catch (error: any) {
      logs.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: node.title,
        status: "error",
        message: error?.message || "节点执行失败",
        timestamp: Date.now(),
      });
      return {
        status: "error",
        summary: `${node.title} 执行失败`,
        nodeCount: sortedNodes.length,
        logs,
        outputs,
      };
    }
  }

  return {
    status: "success",
    summary: `已完成 ${sortedNodes.length} 个节点的模拟执行`,
    nodeCount: sortedNodes.length,
    logs,
    outputs,
  };
}
