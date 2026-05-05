import request from './index'

export interface WorkflowGraphNode {
  id: string
  type: string
  title: string
  x: number
  y: number
  config?: Record<string, any>
}

export interface WorkflowGraphEdge {
  id: string
  source: string
  target: string
  label?: string
  sourcePort?: string
  targetPort?: string
}

export interface WorkflowGraphGroup {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  color?: string
  nodeIds: string[]
}

export interface WorkflowGraph {
  version: number
  viewport: {
    x: number
    y: number
    zoom: number
  }
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
  groups?: WorkflowGraphGroup[]
}

export interface WorkflowTemplate {
  key: string
  name: string
  description: string
  tags: string[]
  recommendedMode: 'creation' | 'workflow'
  graph: WorkflowGraph
}

export interface WorkflowNodeDefinition {
  type: string
  label: string
  category: 'project' | 'text' | 'image' | 'audio' | 'video' | 'control' | 'agent'
  description: string
  inputs: Array<{ key: string; label: string; type: string }>
  outputs: Array<{ key: string; label: string; type: string }>
  status: 'ready' | 'planned'
  configFields?: Array<{
    key: string
    label: string
    type: 'text' | 'textarea' | 'number' | 'select' | 'boolean'
    placeholder?: string
    options?: Array<{ label: string; value: string }>
  }>
}

export interface WorkflowRunLog {
  nodeId: string
  nodeType: string
  nodeTitle: string
  status: 'success' | 'skipped' | 'error'
  message: string
  timestamp: number
  output?: any
}

export interface WorkflowRun {
  id: number
  workflowId: number
  projectId: number | null
  status: string
  summary: string
  logs: WorkflowRunLog[]
  result: Record<string, any>
  createTime: number | null
  updateTime: number | null
}

export interface WorkflowSummary {
  id: number
  name: string
  description: string
  projectId: number | null
  templateKey: string
  tags: string[]
  version: number
  createTime: number | null
  updateTime: number | null
  latestRun?: {
    id: number
    workflowId: number
    status: string
    summary: string
    createTime: number | null
  } | null
}

export interface WorkflowDetail extends WorkflowSummary {
  graph: WorkflowGraph
}

export interface WorkflowProjectSummary {
  projectId: number
  novelCount: number
  outlineCount: number
  scriptCount: number
  assetCount: number
  storyboardCount: number
  videoCount: number
}

export interface WorkflowStudioData {
  projects: Array<{
    id: number
    name: string
    intro?: string
    type?: string
    artStyle?: string
    videoRatio?: string
  }>
  projectSummary: WorkflowProjectSummary | null
  templates: WorkflowTemplate[]
  nodeCatalog: WorkflowNodeDefinition[]
  workflows: WorkflowSummary[]
}

export const getWorkflowStudioData = (projectId?: number | null) =>
  request.post('/workflow/getStudioData', { projectId: projectId ?? null })

export const getWorkflowDetail = (id: number) =>
  request.post('/workflow/getWorkflow', { id })

export const saveWorkflow = (data: {
  id?: number
  name: string
  description?: string
  projectId?: number | null
  templateKey?: string
  version?: number
  tags?: string[]
  graph: WorkflowGraph
}) => request.post('/workflow/saveWorkflow', data)

export const createWorkflowFromTemplate = (data: { templateKey: string; projectId?: number | null }) =>
  request.post('/workflow/createFromTemplate', data)

export const copyWorkflow = (data: { id: number; name?: string }) =>
  request.post('/workflow/copyWorkflow', data)

export const deleteWorkflow = (id: number) =>
  request.post('/workflow/deleteWorkflow', { id })

export const runWorkflow = (workflowId: number) =>
  request.post('/workflow/runWorkflow', { workflowId })
