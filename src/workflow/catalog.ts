export interface WorkflowPort {
  key: string;
  label: string;
  type: string;
}

export interface WorkflowNodeConfigField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "boolean";
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface WorkflowNodeDefinition {
  type: string;
  label: string;
  category: "project" | "text" | "image" | "audio" | "video" | "control" | "agent";
  description: string;
  inputs: WorkflowPort[];
  outputs: WorkflowPort[];
  status: "ready" | "planned";
  configFields?: WorkflowNodeConfigField[];
}

export interface WorkflowGraphNode {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  config?: Record<string, any>;
}

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface WorkflowGraphGroup {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  nodeIds: string[];
}

export interface WorkflowGraph {
  version: number;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  groups?: WorkflowGraphGroup[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  tags: string[];
  recommendedMode: "creation" | "workflow";
  graph: WorkflowGraph;
}

function cloneGraph(graph: WorkflowGraph): WorkflowGraph {
  return JSON.parse(JSON.stringify(graph));
}

function templateNode(
  id: string,
  type: string,
  title: string,
  x: number,
  y: number,
  config?: Record<string, any>,
): WorkflowGraphNode {
  return { id, type, title, x, y, config };
}

function templateEdge(source: string, target: string, label?: string): WorkflowGraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
  };
}

export const workflowNodeCatalog: WorkflowNodeDefinition[] = [
  {
    type: "project_input",
    label: "项目输入",
    category: "project",
    description: "加载当前项目的名称、类型、画风和比例，为整条工作流提供上下文。",
    inputs: [],
    outputs: [{ key: "project", label: "项目上下文", type: "project" }],
    status: "ready",
  },
  {
    type: "novel_input",
    label: "小说导入",
    category: "text",
    description: "读取项目下已经导入的章节与原稿信息。",
    inputs: [{ key: "project", label: "项目上下文", type: "project" }],
    outputs: [{ key: "novel", label: "小说数据", type: "text" }],
    status: "ready",
    configFields: [
      { key: "limit", label: "读取章节数", type: "number", placeholder: "默认全部" },
    ],
  },
  {
    type: "chapter_split",
    label: "章节拆分",
    category: "text",
    description: "把原稿拆成可供后续处理的章节单元。",
    inputs: [{ key: "novel", label: "小说数据", type: "text" }],
    outputs: [{ key: "chapters", label: "章节列表", type: "text[]" }],
    status: "planned",
    configFields: [
      {
        key: "strategy",
        label: "拆分策略",
        type: "select",
        options: [
          { label: "按标题规则", value: "title" },
          { label: "按固定字数", value: "length" },
          { label: "按 AI 判断", value: "ai" },
        ],
      },
    ],
  },
  {
    type: "storyline_summary",
    label: "故事线整理",
    category: "text",
    description: "整理当前项目故事线和当前创作状态。",
    inputs: [{ key: "project", label: "项目上下文", type: "project" }],
    outputs: [{ key: "storyline", label: "故事线", type: "text" }],
    status: "ready",
    configFields: [
      { key: "focus", label: "聚焦方向", type: "text", placeholder: "如：主线冲突、人物关系、商业化卖点" },
    ],
  },
  {
    type: "outline_input",
    label: "大纲读取",
    category: "text",
    description: "读取现有分集大纲，作为剧本或资产生成的输入。",
    inputs: [{ key: "project", label: "项目上下文", type: "project" }],
    outputs: [{ key: "outline", label: "大纲数据", type: "text" }],
    status: "ready",
  },
  {
    type: "outline_generate",
    label: "大纲生成",
    category: "text",
    description: "从原稿与故事线推导分集大纲。",
    inputs: [{ key: "storyline", label: "故事线", type: "text" }],
    outputs: [{ key: "outline", label: "分集大纲", type: "text" }],
    status: "planned",
    configFields: [
      { key: "episodeCount", label: "目标集数", type: "number", placeholder: "如 12" },
      { key: "episodeDuration", label: "单集时长", type: "text", placeholder: "如 60s / 90s" },
      { key: "notes", label: "创作备注", type: "textarea", placeholder: "补充需要强调的剧情节奏和风格要求" },
    ],
  },
  {
    type: "script_input",
    label: "剧本读取",
    category: "text",
    description: "读取当前项目已生成的剧本和关联分集。",
    inputs: [{ key: "project", label: "项目上下文", type: "project" }],
    outputs: [{ key: "script", label: "剧本数据", type: "text" }],
    status: "ready",
  },
  {
    type: "script_generate",
    label: "剧本生成",
    category: "text",
    description: "基于大纲推导可拍摄剧本。",
    inputs: [{ key: "outline", label: "分集大纲", type: "text" }],
    outputs: [{ key: "script", label: "剧本内容", type: "text" }],
    status: "planned",
    configFields: [
      {
        key: "style",
        label: "剧本风格",
        type: "select",
        options: [
          { label: "短剧直给版", value: "direct" },
          { label: "商业爆点版", value: "commercial" },
          { label: "情绪递进版", value: "dramatic" },
        ],
      },
    ],
  },
  {
    type: "asset_inventory",
    label: "资产读取",
    category: "image",
    description: "读取角色、场景、道具和分镜资产现状。",
    inputs: [{ key: "project", label: "项目上下文", type: "project" }],
    outputs: [{ key: "assets", label: "资产数据", type: "asset" }],
    status: "ready",
  },
  {
    type: "asset_generate",
    label: "资产生成",
    category: "image",
    description: "根据大纲或剧本规划角色、场景、道具资产。",
    inputs: [{ key: "outline", label: "分集大纲", type: "text" }],
    outputs: [{ key: "assets", label: "资产草案", type: "asset" }],
    status: "planned",
    configFields: [
      {
        key: "assetTypes",
        label: "资产范围",
        type: "text",
        placeholder: "如：角色,场景,道具",
      },
      { key: "batchSize", label: "批量生成数", type: "number", placeholder: "如 6" },
    ],
  },
  {
    type: "storyboard_input",
    label: "分镜读取",
    category: "image",
    description: "读取已经落库的分镜镜头和镜头数量。",
    inputs: [{ key: "project", label: "项目上下文", type: "project" }],
    outputs: [{ key: "storyboard", label: "分镜数据", type: "storyboard" }],
    status: "ready",
  },
  {
    type: "storyboard_generate",
    label: "分镜生成",
    category: "image",
    description: "根据剧本和资产生成可执行镜头计划。",
    inputs: [
      { key: "script", label: "剧本内容", type: "text" },
      { key: "assets", label: "资产草案", type: "asset" },
    ],
    outputs: [{ key: "storyboard", label: "分镜结果", type: "storyboard" }],
    status: "planned",
    configFields: [
      {
        key: "shotDensity",
        label: "镜头密度",
        type: "select",
        options: [
          { label: "紧凑", value: "high" },
          { label: "标准", value: "normal" },
          { label: "舒展", value: "low" },
        ],
      },
    ],
  },
  {
    type: "subtitle_generate",
    label: "字幕生成",
    category: "audio",
    description: "根据剧本或分镜生成字幕规划。",
    inputs: [{ key: "script", label: "剧本内容", type: "text" }],
    outputs: [{ key: "subtitle", label: "字幕稿", type: "subtitle" }],
    status: "ready",
    configFields: [
      { key: "language", label: "字幕语言", type: "text", placeholder: "默认 zh-CN" },
    ],
  },
  {
    type: "character_voice",
    label: "角色配音",
    category: "audio",
    description: "基于剧本和角色配置规划角色配音任务。",
    inputs: [
      { key: "script", label: "剧本内容", type: "text" },
      { key: "assets", label: "资产数据", type: "asset" },
    ],
    outputs: [{ key: "voice", label: "角色配音计划", type: "audio" }],
    status: "ready",
    configFields: [
      {
        key: "voiceStyle",
        label: "配音风格",
        type: "select",
        options: [
          { label: "情绪化", value: "emotional" },
          { label: "写实", value: "realistic" },
          { label: "广播剧", value: "narrative" },
        ],
      },
    ],
  },
  {
    type: "narration_voice",
    label: "旁白配音",
    category: "audio",
    description: "补充旁白和补白音轨。",
    inputs: [{ key: "script", label: "剧本内容", type: "text" }],
    outputs: [{ key: "voice", label: "旁白计划", type: "audio" }],
    status: "ready",
    configFields: [
      { key: "tone", label: "旁白口吻", type: "text", placeholder: "如：冷静旁白、热血口播" },
    ],
  },
  {
    type: "bgm_generate",
    label: "BGM 生成",
    category: "audio",
    description: "基于情绪和剧情阶段规划背景音乐。",
    inputs: [{ key: "storyboard", label: "分镜数据", type: "storyboard" }],
    outputs: [{ key: "bgm", label: "BGM 计划", type: "audio" }],
    status: "ready",
    configFields: [
      { key: "mood", label: "情绪关键词", type: "text", placeholder: "如：热血,悬疑,悲伤" },
    ],
  },
  {
    type: "sfx_generate",
    label: "音效生成",
    category: "audio",
    description: "根据分镜规划动作音效与环境音。",
    inputs: [{ key: "storyboard", label: "分镜数据", type: "storyboard" }],
    outputs: [{ key: "sfx", label: "音效计划", type: "audio" }],
    status: "ready",
    configFields: [
      { key: "intensity", label: "音效强度", type: "number", placeholder: "1-10" },
    ],
  },
  {
    type: "video_generate",
    label: "视频生成",
    category: "video",
    description: "根据分镜和视频素材产出视频任务。",
    inputs: [{ key: "storyboard", label: "分镜数据", type: "storyboard" }],
    outputs: [{ key: "video", label: "视频任务", type: "video" }],
    status: "ready",
    configFields: [
      { key: "model", label: "视频模型", type: "text", placeholder: "如：Sora / 豆包 / Kling" },
      { key: "resolution", label: "输出分辨率", type: "text", placeholder: "如：1080p" },
    ],
  },
  {
    type: "approval_gate",
    label: "人工确认",
    category: "control",
    description: "要求人工确认后再继续执行，适合关键阶段节点。",
    inputs: [{ key: "input", label: "上游结果", type: "any" }],
    outputs: [{ key: "approved", label: "确认结果", type: "boolean" }],
    status: "ready",
    configFields: [
      { key: "reviewLabel", label: "确认说明", type: "text", placeholder: "如：请确认本轮分镜是否可继续出视频" },
    ],
  },
  {
    type: "branch_condition",
    label: "条件分支",
    category: "control",
    description: "根据条件选择不同分支，当前阶段先提供结构占位。",
    inputs: [{ key: "input", label: "输入", type: "any" }],
    outputs: [
      { key: "true", label: "条件成立", type: "any" },
      { key: "false", label: "条件不成立", type: "any" },
    ],
    status: "ready",
    configFields: [
      { key: "expression", label: "条件表达式", type: "text", placeholder: "如：scriptCount > 0" },
    ],
  },
  {
    type: "loop_batch",
    label: "批量循环",
    category: "control",
    description: "对章节、分集或镜头进行批量遍历。",
    inputs: [{ key: "items", label: "批量项", type: "array" }],
    outputs: [{ key: "batch", label: "批处理结果", type: "array" }],
    status: "ready",
    configFields: [
      {
        key: "loopBy",
        label: "遍历对象",
        type: "select",
        options: [
          { label: "章节", value: "chapters" },
          { label: "集数", value: "episodes" },
          { label: "镜头", value: "shots" },
        ],
      },
    ],
  },
  {
    type: "agent_skill",
    label: "Agent / Skill 调用",
    category: "agent",
    description: "为未来智能导演模式保留的可扩展节点接口。",
    inputs: [{ key: "goal", label: "目标输入", type: "text" }],
    outputs: [{ key: "result", label: "执行结果", type: "any" }],
    status: "ready",
    configFields: [
      { key: "goal", label: "代理目标", type: "textarea", placeholder: "描述要交给 Agent / Skill 的任务" },
      { key: "skill", label: "技能名称", type: "text", placeholder: "如：story-director / bgm-arranger" },
    ],
  },
  {
    type: "export_package",
    label: "成片导出",
    category: "video",
    description: "汇总文本、音频、视频和元数据，导出素材包或最终结果。",
    inputs: [{ key: "video", label: "视频任务", type: "video" }],
    outputs: [{ key: "package", label: "导出包", type: "package" }],
    status: "ready",
    configFields: [
      {
        key: "format",
        label: "导出格式",
        type: "select",
        options: [
          { label: "项目素材包", value: "package" },
          { label: "交付清单", value: "manifest" },
          { label: "最终成片", value: "final-video" },
        ],
      },
    ],
  },
];

const workflowTemplates: WorkflowTemplate[] = [
  {
    key: "draft-to-outline",
    name: "从原稿到大纲",
    description: "用项目原稿、章节和故事线，组织到可继续生产的大纲阶段。",
    tags: ["文本", "起步模板", "阶段创作"],
    recommendedMode: "workflow",
    graph: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        templateNode("project", "project_input", "项目输入", 80, 80),
        templateNode("novel", "novel_input", "小说导入", 320, 80),
        templateNode("storyline", "storyline_summary", "故事线整理", 320, 240),
        templateNode("outline", "outline_generate", "大纲生成", 580, 160),
        templateNode("gate", "approval_gate", "人工确认", 840, 160),
      ],
      edges: [
        templateEdge("project", "novel"),
        templateEdge("project", "storyline"),
        templateEdge("storyline", "outline"),
        templateEdge("novel", "outline"),
        templateEdge("outline", "gate"),
      ],
      groups: [],
    },
  },
  {
    key: "outline-to-script",
    name: "从大纲到剧本",
    description: "把现有大纲组织成剧本生成工作流，并串上字幕预处理。",
    tags: ["文本", "剧本", "常用"],
    recommendedMode: "workflow",
    graph: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        templateNode("project", "project_input", "项目输入", 80, 100),
        templateNode("outline", "outline_input", "大纲读取", 300, 100),
        templateNode("script", "script_generate", "剧本生成", 560, 100),
        templateNode("subtitle", "subtitle_generate", "字幕生成", 820, 100),
      ],
      edges: [
        templateEdge("project", "outline"),
        templateEdge("outline", "script"),
        templateEdge("script", "subtitle"),
      ],
      groups: [],
    },
  },
  {
    key: "script-to-storyboard",
    name: "从剧本到分镜",
    description: "把剧本、现有资产和人工确认组合成分镜生产工作流。",
    tags: ["图像", "分镜", "中间产物"],
    recommendedMode: "workflow",
    graph: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        templateNode("project", "project_input", "项目输入", 80, 100),
        templateNode("script", "script_input", "剧本读取", 300, 100),
        templateNode("assets", "asset_inventory", "资产读取", 300, 260),
        templateNode("storyboard", "storyboard_generate", "分镜生成", 570, 180),
        templateNode("gate", "approval_gate", "人工确认", 840, 180),
      ],
      edges: [
        templateEdge("project", "script"),
        templateEdge("project", "assets"),
        templateEdge("script", "storyboard"),
        templateEdge("assets", "storyboard"),
        templateEdge("storyboard", "gate"),
      ],
      groups: [],
    },
  },
  {
    key: "storyboard-to-video",
    name: "从分镜到视频",
    description: "串起分镜、字幕、配音、BGM 和视频导出。",
    tags: ["音视频", "导出", "后段"],
    recommendedMode: "workflow",
    graph: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        templateNode("project", "project_input", "项目输入", 80, 140),
        templateNode("script", "script_input", "剧本读取", 300, 60),
        templateNode("storyboard", "storyboard_input", "分镜读取", 300, 220),
        templateNode("subtitle", "subtitle_generate", "字幕生成", 560, 40),
        templateNode("voice", "character_voice", "角色配音", 560, 150),
        templateNode("bgm", "bgm_generate", "BGM 生成", 560, 260),
        templateNode("video", "video_generate", "视频生成", 820, 180),
        templateNode("export", "export_package", "成片导出", 1080, 180),
      ],
      edges: [
        templateEdge("project", "script"),
        templateEdge("project", "storyboard"),
        templateEdge("script", "subtitle"),
        templateEdge("script", "voice"),
        templateEdge("storyboard", "bgm"),
        templateEdge("storyboard", "video"),
        templateEdge("voice", "video"),
        templateEdge("bgm", "video"),
        templateEdge("video", "export"),
      ],
      groups: [],
    },
  },
  {
    key: "full-production",
    name: "完整短剧生产链路",
    description: "从项目上下文起步，贯穿文本、图像、音频和视频节点的端到端模板。",
    tags: ["端到端", "全链路", "官方模板"],
    recommendedMode: "workflow",
    graph: {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 0.92 },
      nodes: [
        templateNode("project", "project_input", "项目输入", 60, 180),
        templateNode("novel", "novel_input", "小说导入", 260, 60),
        templateNode("storyline", "storyline_summary", "故事线整理", 260, 180),
        templateNode("outline", "outline_input", "大纲读取", 260, 300),
        templateNode("script", "script_input", "剧本读取", 500, 180),
        templateNode("assets", "asset_inventory", "资产读取", 500, 320),
        templateNode("storyboard", "storyboard_input", "分镜读取", 740, 180),
        templateNode("subtitle", "subtitle_generate", "字幕生成", 980, 40),
        templateNode("voice", "character_voice", "角色配音", 980, 150),
        templateNode("narration", "narration_voice", "旁白配音", 980, 260),
        templateNode("bgm", "bgm_generate", "BGM 生成", 980, 370),
        templateNode("video", "video_generate", "视频生成", 1220, 220),
        templateNode("export", "export_package", "成片导出", 1460, 220),
      ],
      edges: [
        templateEdge("project", "novel"),
        templateEdge("project", "storyline"),
        templateEdge("project", "outline"),
        templateEdge("storyline", "script"),
        templateEdge("outline", "script"),
        templateEdge("project", "assets"),
        templateEdge("script", "storyboard"),
        templateEdge("assets", "storyboard"),
        templateEdge("script", "subtitle"),
        templateEdge("script", "voice"),
        templateEdge("script", "narration"),
        templateEdge("storyboard", "bgm"),
        templateEdge("storyboard", "video"),
        templateEdge("voice", "video"),
        templateEdge("narration", "video"),
        templateEdge("bgm", "video"),
        templateEdge("video", "export"),
      ],
      groups: [],
    },
  },
];

export function getWorkflowNodeCatalog() {
  return workflowNodeCatalog.map((item) => ({ ...item }));
}

export function getWorkflowTemplates() {
  return workflowTemplates.map((template) => ({
    ...template,
    graph: cloneGraph(template.graph),
  }));
}

export function getWorkflowTemplateByKey(key: string) {
  const template = workflowTemplates.find((item) => item.key === key);
  if (!template) return null;
  return {
    ...template,
    graph: cloneGraph(template.graph),
  };
}

export function createWorkflowDraftFromTemplate(key: string, projectId?: number | null) {
  const template = getWorkflowTemplateByKey(key);
  if (!template) return null;

  return {
    name: template.name,
    description: template.description,
    templateKey: template.key,
    tags: JSON.stringify(template.tags),
    projectId: projectId ?? null,
    version: 1,
    graph: JSON.stringify(template.graph),
  };
}
