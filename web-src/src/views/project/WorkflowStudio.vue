<template>
  <div class="workflow-page" v-loading="booting">
    <header class="studio-toolbar">
      <div class="toolbar-copy">
        <span class="toolbar-badge">Mode 02 / 画布编排</span>
        <div>
          <h2 class="toolbar-title">工作流工作台</h2>
          <p class="toolbar-desc">
            参考 InvokeAI 的工作流库体验与 ComfyUI 的节点画布范式，用模板、节点和项目上下文编排短剧生产链路。
          </p>
        </div>
      </div>

      <div class="toolbar-actions">
        <el-select v-model="selectedProjectId" placeholder="选择项目上下文" style="width: 240px" @change="handleProjectChange">
          <el-option :value="null" label="全部项目 / 通用工作台" />
          <el-option
            v-for="project in studioProjects"
            :key="project.id"
            :label="project.name"
            :value="project.id"
          />
        </el-select>

        <el-button @click="createBlankWorkflow">新建工作流</el-button>
        <el-button :disabled="!workflowDraft" @click="fitCanvas">适配视图</el-button>
        <el-button :disabled="!workflowDraft" @click="autoLayoutGraph">自动排布</el-button>
        <el-button :disabled="!workflowDraft" :loading="saving" @click="saveActiveWorkflow">保存</el-button>
        <el-button type="primary" :disabled="!workflowDraft" :loading="running" @click="runActiveWorkflow">
          运行工作流
        </el-button>
      </div>
    </header>

    <div class="studio-body">
      <aside class="studio-sidebar">
        <div v-if="projectSummary" class="summary-card">
          <div class="summary-head">
            <strong>项目上下文</strong>
            <span>{{ currentProjectLabel }}</span>
          </div>
          <div class="summary-grid">
            <div v-for="item in summaryItems" :key="item.label" class="summary-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </div>

        <div class="panel-tabs">
          <button
            v-for="tab in sidebarTabs"
            :key="tab.key"
            class="panel-tab"
            :class="{ active: sidebarTab === tab.key }"
            @click="sidebarTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="sidebar-scroll">
          <template v-if="sidebarTab === 'workflows'">
            <div class="sidebar-section">
              <div class="section-head">
                <strong>工作流库</strong>
                <span>{{ workflowSummaries.length }} 个</span>
              </div>

              <button class="create-entry" @click="createBlankWorkflow">
                <span>＋</span>
                <div>
                  <strong>空白工作流</strong>
                  <p>从项目上下文开始编排新的短剧生产链路</p>
                </div>
              </button>

              <article
                v-for="workflow in workflowSummaries"
                :key="workflow.id"
                class="workflow-card fade-in"
                :class="{ active: workflowDraft?.id === workflow.id }"
              >
                <button class="workflow-card-main" @click="openWorkflow(workflow.id)">
                  <div class="workflow-card-top">
                    <strong>{{ workflow.name }}</strong>
                    <el-tag size="small" :type="workflow.latestRun ? runTagType(workflow.latestRun.status) : 'info'">
                      {{ workflow.latestRun?.status || '未运行' }}
                    </el-tag>
                  </div>
                  <p>{{ workflow.description || '暂无描述' }}</p>
                  <div class="workflow-meta">
                    <span>v{{ workflow.version }}</span>
                    <span>{{ formatTime(workflow.updateTime) }}</span>
                  </div>
                </button>

                <div class="workflow-actions">
                  <el-button text size="small" @click="copyWorkflowSummary(workflow)">复制</el-button>
                  <el-button text size="small" @click="deleteWorkflowSummary(workflow)">删除</el-button>
                </div>
              </article>
            </div>
          </template>

          <template v-else-if="sidebarTab === 'templates'">
            <div class="sidebar-section">
              <div class="section-head">
                <strong>模板工作流</strong>
                <span>{{ templates.length }} 套</span>
              </div>

              <article v-for="template in templates" :key="template.key" class="template-card fade-in">
                <div class="template-head">
                  <strong>{{ template.name }}</strong>
                  <span>{{ template.tags.join(' / ') }}</span>
                </div>
                <p>{{ template.description }}</p>
                <div class="template-actions">
                  <el-button size="small" @click="createWorkflowFromTemplateCard(template)">导入为工作流</el-button>
                  <el-button size="small" type="primary" plain @click="insertTemplateAsSubgraph(template)">
                    插入当前画布
                  </el-button>
                </div>
              </article>
            </div>
          </template>

          <template v-else>
            <div v-for="group in nodeCatalogGroups" :key="group.key" class="sidebar-section">
              <div class="section-head">
                <strong>{{ group.label }}</strong>
                <span>{{ group.items.length }}</span>
              </div>

              <article v-for="node in group.items" :key="node.type" class="node-card fade-in">
                <div class="node-card-head">
                  <strong>{{ node.label }}</strong>
                  <el-tag size="small" :type="node.status === 'ready' ? 'success' : 'warning'">
                    {{ node.status === 'ready' ? '可运行' : '规划中' }}
                  </el-tag>
                </div>
                <p>{{ node.description }}</p>
                <div class="node-card-meta">
                  <span>{{ node.inputs.length }} 入</span>
                  <span>{{ node.outputs.length }} 出</span>
                </div>
                <el-button size="small" type="primary" plain @click="addNodeFromCatalog(node)">
                  添加到画布
                </el-button>
              </article>
            </div>
          </template>
        </div>
      </aside>

      <section class="canvas-panel">
        <div class="canvas-header">
          <div>
            <strong>{{ workflowDraft?.name || '未选择工作流' }}</strong>
            <p v-if="workflowDraft">
              {{ workflowDraft.description || '围绕项目数据组织一条可复用的节点执行链路。' }}
            </p>
            <p v-else>从左侧模板库或节点库开始，搭一条真正能复用的工作流。</p>
          </div>

          <div class="canvas-actions">
            <el-tag v-if="workflowDraft?.templateKey" type="info">{{ workflowDraft.templateKey }}</el-tag>
            <el-tag v-if="dirty" type="warning">未保存</el-tag>
            <el-button size="small" :disabled="!selectedNode" @click="duplicateSelectedNode">复制节点</el-button>
            <el-button size="small" :disabled="!selectedNode && !selectedEdge" @click="removeSelection">删除</el-button>
          </div>
        </div>

        <div class="flow-shell">
          <VueFlow
            ref="flowRef"
            v-model:nodes="flowNodes"
            v-model:edges="flowEdges"
            class="flow-stage"
            :nodes-draggable="true"
            :nodes-connectable="true"
            :elements-selectable="true"
            :select-nodes-on-drag="false"
            :snap-to-grid="true"
            :fit-view-on-init="true"
            :default-viewport="initialViewport"
            :min-zoom="0.3"
            :max-zoom="1.8"
            :delete-key-code="['Backspace', 'Delete']"
            :connection-line-type="ConnectionLineType.SmoothStep"
            :default-edge-options="defaultEdgeOptions"
            @init="handleFlowInit"
            @connect="handleConnect"
            @selection-change="handleSelectionChange"
            @node-drag-stop="markDirty"
            @nodes-delete="markDirty"
            @edges-delete="markDirty"
            @move-end="handleMoveEnd"
          >
            <template #node-workflowNode="{ data, selected }">
              <div class="canvas-node" :class="{ selected }">
                <div class="canvas-node-head">
                  <div>
                    <strong>{{ data.title }}</strong>
                    <span>{{ data.definition?.label || data.nodeType }}</span>
                  </div>
                  <el-tag size="small" :type="data.definition?.status === 'ready' ? 'success' : 'warning'">
                    {{ data.definition?.status === 'ready' ? 'ready' : 'planned' }}
                  </el-tag>
                </div>

                <p class="canvas-node-desc">{{ data.definition?.description || '自定义业务节点' }}</p>

                <div class="port-columns">
                  <div class="port-column">
                    <span class="port-label">输入</span>
                    <div
                      v-for="(port, index) in data.definition?.inputs || []"
                      :key="`${data.nodeType}-in-${port.key}`"
                      class="port-row input"
                    >
                      <Handle
                        type="target"
                        :id="port.key"
                        :position="Position.Left"
                        :style="{ top: `${58 + index * 28}px` }"
                      />
                      <span>{{ port.label }}</span>
                    </div>
                  </div>

                  <div class="port-column align-right">
                    <span class="port-label">输出</span>
                    <div
                      v-for="(port, index) in data.definition?.outputs || []"
                      :key="`${data.nodeType}-out-${port.key}`"
                      class="port-row output"
                    >
                      <span>{{ port.label }}</span>
                      <Handle
                        type="source"
                        :id="port.key"
                        :position="Position.Right"
                        :style="{ top: `${58 + index * 28}px` }"
                      />
                    </div>
                  </div>
                </div>

                <div class="canvas-node-foot">
                  <span>{{ summarizeConfig(data.config) }}</span>
                </div>
              </div>
            </template>

            <Background :gap="20" :size="1.2" pattern-color="#d7dce5" />
            <MiniMap pannable zoomable />
            <Controls />
          </VueFlow>

          <div v-if="!workflowDraft" class="canvas-empty">
            <div class="canvas-empty-card">
              <h3>开始搭建你的工作流</h3>
              <p>它现在基于成熟图编辑器承载，不再是原来的手搓画布。先选模板，再按项目补节点。</p>
              <div class="canvas-empty-actions">
                <el-button @click="createBlankWorkflow">新建工作流</el-button>
                <el-button type="primary" @click="setSidebarTab('templates')">查看模板</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="canvas-footer">
          <span>{{ flowNodes.length }} 个节点</span>
          <span>{{ flowEdges.length }} 条连线</span>
          <span>缩放 {{ Math.round(viewport.zoom * 100) }}%</span>
          <span>支持拖拽、框选、缩放、连线、Delete 删除和小地图导航</span>
        </div>
      </section>

      <aside class="studio-inspector">
        <div class="panel-tabs">
          <button
            v-for="tab in inspectorTabs"
            :key="tab.key"
            class="panel-tab"
            :class="{ active: inspectorTab === tab.key }"
            @click="setInspectorTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="inspector-scroll">
          <template v-if="inspectorTab === 'details'">
            <div class="inspector-section">
              <div class="section-head">
                <strong>工作流概览</strong>
                <span>{{ workflowDraft?.id ? `#${workflowDraft.id}` : '未保存' }}</span>
              </div>
              <el-input v-model="workflowName" :disabled="!workflowDraft" placeholder="工作流名称" @input="markDirty" />
              <el-input
                v-model="workflowDescription"
                :disabled="!workflowDraft"
                type="textarea"
                :rows="4"
                placeholder="工作流描述"
                @input="markDirty"
              />
              <el-input
                v-model="workflowTagsInput"
                :disabled="!workflowDraft"
                placeholder="标签，使用英文逗号分隔"
                @input="markDirty"
              />
            </div>

            <div v-if="selectedNode" class="inspector-section">
              <div class="section-head">
                <strong>节点详情</strong>
                <span>{{ selectedNode.id }}</span>
              </div>
              <el-input
                :model-value="selectedNodeData?.title || ''"
                placeholder="节点标题"
                @update:model-value="updateSelectedNodeTitle"
              />
              <div class="detail-grid">
                <div><span>类型</span><strong>{{ selectedNodeData?.definition?.label || selectedNodeData?.nodeType || '-' }}</strong></div>
                <div><span>坐标</span><strong>{{ Math.round(selectedNode.position.x) }}, {{ Math.round(selectedNode.position.y) }}</strong></div>
              </div>
              <p class="detail-text">{{ selectedNodeData?.definition?.description || '' }}</p>
            </div>

            <div v-else-if="selectedEdge" class="inspector-section">
              <div class="section-head">
                <strong>连线详情</strong>
                <span>{{ selectedEdge.id }}</span>
              </div>
              <div class="detail-grid">
                <div><span>来源</span><strong>{{ selectedEdge.source }} / {{ selectedEdge.sourceHandle || '默认' }}</strong></div>
                <div><span>目标</span><strong>{{ selectedEdge.target }} / {{ selectedEdge.targetHandle || '默认' }}</strong></div>
              </div>
              <el-input
                :model-value="selectedEdge.label || ''"
                placeholder="连线备注"
                @update:model-value="updateSelectedEdgeLabel"
              />
            </div>
          </template>

          <template v-else-if="inspectorTab === 'params'">
            <div class="inspector-section">
              <div class="section-head">
                <strong>参数视图</strong>
                <span>{{ configurableNodes.length }} 个节点</span>
              </div>
              <p class="detail-text">
                这是参考 InvokeAI 参数面板思路做的线性化配置区，不需要先理解整张图，也能先把模板跑起来。
              </p>
            </div>

            <div
              v-for="node in configurableNodes"
              :key="`params-${node.id}`"
              class="inspector-section node-params"
            >
              <div class="section-head">
                <strong>{{ getNodeData(node)?.title || node.id }}</strong>
                <span>{{ getNodeData(node)?.definition?.label || '' }}</span>
              </div>

              <div class="param-list">
                <div
                  v-for="field in getNodeData(node)?.definition?.configFields || []"
                  :key="`${node.id}-${field.key}`"
                  class="param-field"
                >
                  <label>{{ field.label }}</label>

                  <el-input
                    v-if="field.type === 'text'"
                    :model-value="String(getNodeData(node)?.config?.[field.key] ?? '')"
                    :placeholder="field.placeholder"
                    @update:model-value="setNodeConfigValue(node.id, field.key, $event)"
                  />

                  <el-input
                    v-else-if="field.type === 'textarea'"
                    type="textarea"
                    :rows="3"
                    :model-value="String(getNodeData(node)?.config?.[field.key] ?? '')"
                    :placeholder="field.placeholder"
                    @update:model-value="setNodeConfigValue(node.id, field.key, $event)"
                  />

                  <el-input-number
                    v-else-if="field.type === 'number'"
                    :model-value="Number(getNodeData(node)?.config?.[field.key] ?? 0)"
                    :min="0"
                    controls-position="right"
                    style="width: 100%"
                    @update:model-value="setNodeConfigValue(node.id, field.key, $event)"
                  />

                  <el-switch
                    v-else-if="field.type === 'boolean'"
                    :model-value="Boolean(getNodeData(node)?.config?.[field.key])"
                    @update:model-value="setNodeConfigValue(node.id, field.key, $event)"
                  />

                  <el-select
                    v-else-if="field.type === 'select'"
                    :model-value="String(getNodeData(node)?.config?.[field.key] ?? '')"
                    placeholder="请选择"
                    style="width: 100%"
                    @update:model-value="setNodeConfigValue(node.id, field.key, $event)"
                  >
                    <el-option
                      v-for="option in field.options || []"
                      :key="`${field.key}-${option.value}`"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="inspector-section">
              <div class="section-head">
                <strong>运行记录</strong>
                <span>{{ workflowRuns.length }} 次</span>
              </div>
              <p class="detail-text">
                当前会记录每次执行的节点日志和状态，后面继续对齐 InvokeAI 的工作流运行追踪方式。
              </p>
            </div>

            <article v-for="run in workflowRuns" :key="run.id" class="run-card fade-in">
              <div class="run-card-head">
                <strong>#{{ run.id }}</strong>
                <el-tag size="small" :type="runTagType(run.status)">{{ run.status }}</el-tag>
              </div>
              <p>{{ run.summary }}</p>
              <div class="run-card-meta">
                <span>{{ formatTime(run.createTime) }}</span>
                <span>{{ run.logs.length }} 条节点日志</span>
              </div>

              <div class="run-log-list">
                <div v-for="log in run.logs" :key="`${run.id}-${log.nodeId}-${log.timestamp}`" class="run-log">
                  <div class="run-log-head">
                    <strong>{{ log.nodeTitle }}</strong>
                    <el-tag size="small" :type="runTagType(log.status)">{{ log.status }}</el-tag>
                  </div>
                  <p>{{ log.message }}</p>
                </div>
              </div>
            </article>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  VueFlow,
  Handle,
  Position,
  MarkerType,
  ConnectionLineType,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type VueFlowStore,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import {
  copyWorkflow,
  createWorkflowFromTemplate,
  deleteWorkflow,
  getWorkflowDetail,
  getWorkflowStudioData,
  runWorkflow,
  saveWorkflow,
  type WorkflowDetail,
  type WorkflowGraph,
  type WorkflowNodeDefinition,
  type WorkflowRun,
  type WorkflowStudioData,
  type WorkflowSummary,
  type WorkflowTemplate,
} from '@/api/workflow'
import { useProjectStore } from '@/stores/project'

type SidebarTabKey = 'workflows' | 'templates' | 'nodes'
type InspectorTabKey = 'details' | 'params' | 'runs'

interface WorkflowDraftMeta {
  id: number | null
  name: string
  description: string
  projectId: number | null
  templateKey: string
  tags: string[]
  version: number
  graph: WorkflowGraph
  createTime: number | null
  updateTime: number | null
}

interface FlowNodeData {
  nodeType: string
  title: string
  definition?: WorkflowNodeDefinition
  config: Record<string, any>
}

const projectStore = useProjectStore()

const booting = ref(true)
const saving = ref(false)
const running = ref(false)
const dirty = ref(false)

const sidebarTab = ref<SidebarTabKey>('workflows')
const inspectorTab = ref<InspectorTabKey>('details')

const studioData = ref<WorkflowStudioData | null>(null)
const workflowDraft = ref<WorkflowDraftMeta | null>(null)
const workflowRuns = ref<WorkflowRun[]>([])

const selectedProjectId = ref<number | null>(projectStore.currentProject?.id ?? null)

const workflowName = ref('')
const workflowDescription = ref('')
const workflowTagsInput = ref('')

const flowNodes = ref<any[]>([])
const flowEdges = ref<any[]>([])
const flowInstance = ref<any>(null)
const viewport = ref({ x: 0, y: 0, zoom: 1 })

const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)

const initialViewport = { x: 0, y: 0, zoom: 0.9 }
const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
}

const sidebarTabs: Array<{ key: SidebarTabKey; label: string }> = [
  { key: 'workflows', label: '工作流库' },
  { key: 'templates', label: '模板库' },
  { key: 'nodes', label: '节点库' },
]

const inspectorTabs: Array<{ key: InspectorTabKey; label: string }> = [
  { key: 'details', label: '详情' },
  { key: 'params', label: '参数' },
  { key: 'runs', label: '运行' },
]

const categoryLabels: Record<string, string> = {
  project: '项目与上下文',
  text: '文本处理',
  image: '图像生成',
  audio: '音频生成',
  video: '视频生成',
  control: '流程控制',
  agent: 'Agent / Skill',
}

const definitionMap = computed(() => {
  const map = new Map<string, WorkflowNodeDefinition>()
  for (const item of studioData.value?.nodeCatalog || []) map.set(item.type, item)
  return map
})

const templates = computed(() => studioData.value?.templates || [])
const studioProjects = computed(() => studioData.value?.projects || [])
const projectSummary = computed(() => studioData.value?.projectSummary || null)
const workflowSummaries = computed(() => studioData.value?.workflows || [])

const currentProjectLabel = computed(() => {
  if (selectedProjectId.value == null) return '全部项目'
  return studioProjects.value.find(project => project.id === selectedProjectId.value)?.name || '当前项目'
})

const summaryItems = computed(() => {
  if (!projectSummary.value) return []
  return [
    { label: '小说', value: projectSummary.value.novelCount },
    { label: '大纲', value: projectSummary.value.outlineCount },
    { label: '剧本', value: projectSummary.value.scriptCount },
    { label: '资产', value: projectSummary.value.assetCount },
    { label: '分镜', value: projectSummary.value.storyboardCount },
    { label: '视频', value: projectSummary.value.videoCount },
  ]
})

const nodeCatalogGroups = computed(() => {
  const groups = new Map<string, WorkflowNodeDefinition[]>()
  for (const node of studioData.value?.nodeCatalog || []) {
    const list = groups.get(node.category) || []
    list.push(node)
    groups.set(node.category, list)
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: categoryLabels[key] || key,
    items,
  }))
})

const selectedNode = computed<any | null>(() => flowNodes.value.find(node => node.id === selectedNodeId.value) || null)
const selectedEdge = computed<any | null>(() => flowEdges.value.find(edge => edge.id === selectedEdgeId.value) || null)
const selectedNodeData = computed<FlowNodeData | null>(() => selectedNode.value?.data || null)

const configurableNodes = computed<any[]>(() =>
  flowNodes.value.filter(node => (node.data.definition?.configFields || []).length > 0),
)

function setSidebarTab(value: SidebarTabKey) {
  sidebarTab.value = value
}

function setInspectorTab(value: InspectorTabKey) {
  inspectorTab.value = value
}

function getNodeData(node: any): FlowNodeData | null {
  return node?.data || null
}

function summarizeConfig(config?: Record<string, any>) {
  const values = Object.values(config || {}).filter(value => value !== undefined && value !== null && value !== '')
  if (!values.length) return '未配置参数'
  return values.slice(0, 2).join(' · ')
}

function markDirty() {
  if (workflowDraft.value) dirty.value = true
}

function getDefinition(type: string) {
  return definitionMap.value.get(type)
}

function formatTime(value: number | null | undefined) {
  if (!value) return '刚刚'
  return new Date(value).toLocaleString()
}

function runTagType(status?: string) {
  if (status === 'success') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'skipped') return 'warning'
  if (status === 'running') return 'warning'
  return 'info'
}

function buildFlowNode(node: WorkflowGraph['nodes'][number]): Node<FlowNodeData> {
  const definition = getDefinition(node.type)
  return {
    id: node.id,
    type: 'workflowNode',
    position: { x: node.x, y: node.y },
    data: {
      nodeType: node.type,
      title: node.title,
      definition,
      config: { ...(node.config || {}) },
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

function buildFlowEdge(edge: WorkflowGraph['edges'][number]): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    label: edge.label,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  }
}

function hydrateWorkflow(detail: WorkflowDetail) {
  workflowDraft.value = {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    projectId: detail.projectId,
    templateKey: detail.templateKey,
    tags: [...(detail.tags || [])],
    version: detail.version,
    graph: detail.graph,
    createTime: detail.createTime,
    updateTime: detail.updateTime,
  }

  workflowName.value = detail.name
  workflowDescription.value = detail.description || ''
  workflowTagsInput.value = (detail.tags || []).join(', ')
  flowNodes.value = detail.graph.nodes.map(buildFlowNode)
  flowEdges.value = detail.graph.edges.map(buildFlowEdge)
  viewport.value = detail.graph.viewport || { ...initialViewport }
  dirty.value = false
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

async function loadStudioData(openFirst = true) {
  booting.value = true
  try {
    const response = await getWorkflowStudioData(selectedProjectId.value) as any
    const data = response.data as WorkflowStudioData
    studioData.value = data

    if (workflowDraft.value?.id) {
      const stillExists = data.workflows.find(item => item.id === workflowDraft.value?.id)
      if (!stillExists) {
        workflowDraft.value = null
        flowNodes.value = []
        flowEdges.value = []
      }
    }

    if (openFirst && !workflowDraft.value && data.workflows.length > 0) {
      await openWorkflow(data.workflows[0].id)
    }
  } finally {
    booting.value = false
  }
}

async function openWorkflow(id: number) {
  const response = await getWorkflowDetail(id) as any
  hydrateWorkflow(response.data as WorkflowDetail)
  await nextTick()
  fitCanvas()
}

function createBlankWorkflow() {
  const now = Date.now()
  workflowDraft.value = {
    id: null,
    name: selectedProjectId.value ? `${currentProjectLabel.value} / 新工作流` : '新工作流',
    description: '',
    projectId: selectedProjectId.value,
    templateKey: '',
    tags: [],
    version: 1,
    graph: {
      version: 1,
      viewport: { ...initialViewport },
      nodes: [],
      edges: [],
      groups: [],
    },
    createTime: now,
    updateTime: now,
  }
  workflowName.value = workflowDraft.value.name
  workflowDescription.value = ''
  workflowTagsInput.value = ''
  flowNodes.value = []
  flowEdges.value = []
  workflowRuns.value = []
  dirty.value = true
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

function getNextNodePosition() {
  return {
    x: 80 + (flowNodes.value.length % 3) * 300,
    y: 80 + Math.floor(flowNodes.value.length / 3) * 170,
  }
}

function addNodeFromCatalog(definition: WorkflowNodeDefinition) {
  if (!workflowDraft.value) createBlankWorkflow()
  const position = getNextNodePosition()
  flowNodes.value = flowNodes.value.concat({
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'workflowNode',
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      nodeType: definition.type,
      title: definition.label,
      definition,
      config: {},
    },
  })
  markDirty()
  setSidebarTab('nodes')
}

function updateNode(nodeId: string, updater: (node: any) => any) {
  flowNodes.value = flowNodes.value.map(node => node.id === nodeId ? updater(node) : node)
}

function updateSelectedNodeTitle(value: string) {
  if (!selectedNode.value) return
  updateNode(selectedNode.value.id, node => ({
    ...node,
    data: {
      ...node.data,
      title: value,
    },
  }))
  markDirty()
}

function updateSelectedEdgeLabel(value: string) {
  if (!selectedEdge.value) return
  flowEdges.value = flowEdges.value.map(edge => edge.id === selectedEdge.value?.id ? { ...edge, label: value } : edge)
  markDirty()
}

function setNodeConfigValue(nodeId: string, key: string, value: any) {
  updateNode(nodeId, node => ({
    ...node,
    data: {
      ...node.data,
      config: {
        ...(node.data.config || {}),
        [key]: value,
      },
    },
  }))
  markDirty()
}

function duplicateSelectedNode() {
  if (!selectedNode.value) return
  const clone = selectedNode.value
  flowNodes.value = flowNodes.value.concat({
    ...clone,
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    position: {
      x: clone.position.x + 40,
      y: clone.position.y + 40,
    },
    data: {
      ...clone.data,
      title: `${clone.data.title} 副本`,
      config: { ...(clone.data.config || {}) },
    },
    selected: false,
  })
  markDirty()
}

function removeSelection() {
  if (selectedNode.value) {
    const nodeId = selectedNode.value.id
    flowNodes.value = flowNodes.value.filter(node => node.id !== nodeId)
    flowEdges.value = flowEdges.value.filter(edge => edge.source !== nodeId && edge.target !== nodeId)
    selectedNodeId.value = null
    markDirty()
    return
  }

  if (selectedEdge.value) {
    flowEdges.value = flowEdges.value.filter(edge => edge.id !== selectedEdge.value?.id)
    selectedEdgeId.value = null
    markDirty()
  }
}

function handleSelectionChange(payload: { nodes: any[]; edges: any[] }) {
  selectedNodeId.value = payload.nodes[0]?.id || null
  selectedEdgeId.value = payload.edges[0]?.id || null
  if (selectedNodeId.value) setInspectorTab('details')
}

function handleMoveEnd(event: { flowTransform?: { x: number; y: number; zoom: number } }) {
  if (event?.flowTransform) viewport.value = event.flowTransform
}

function isConnectionValid(connection: Connection) {
  const sourceNode = flowNodes.value.find(node => node.id === connection.source)
  const targetNode = flowNodes.value.find(node => node.id === connection.target)
  if (!sourceNode || !targetNode) return false

  const sourcePort = sourceNode.data.definition?.outputs.find((port: any) => port.key === connection.sourceHandle)
  const targetPort = targetNode.data.definition?.inputs.find((port: any) => port.key === connection.targetHandle)
  if (!sourcePort || !targetPort) return true
  return sourcePort.type === targetPort.type || sourcePort.type === 'any' || targetPort.type === 'any'
}

function handleConnect(connection: Connection) {
  if (!isConnectionValid(connection)) {
    ElMessage.warning('连线类型不匹配，已阻止连接。')
    return
  }

  flowEdges.value = addEdge({
    ...connection,
    id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  }, flowEdges.value)
  markDirty()
}

function handleFlowInit(instance: VueFlowStore) {
  flowInstance.value = instance
}

function fitCanvas() {
  flowInstance.value?.fitView?.({ padding: 0.16 })
}

function autoLayoutGraph() {
  if (!flowNodes.value.length) return

  const indegree = new Map<string, number>()
  const graph = new Map<string, string[]>()
  for (const node of flowNodes.value) {
    indegree.set(node.id, 0)
    graph.set(node.id, [])
  }
  for (const edge of flowEdges.value) {
    graph.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
  }

  const queue = flowNodes.value.filter(node => (indegree.get(node.id) || 0) === 0).map(node => node.id)
  const levels = new Map<string, number>()
  while (queue.length) {
    const current = queue.shift()!
    const currentLevel = levels.get(current) || 0
    for (const next of graph.get(current) || []) {
      levels.set(next, Math.max(levels.get(next) || 0, currentLevel + 1))
      indegree.set(next, (indegree.get(next) || 1) - 1)
      if ((indegree.get(next) || 0) === 0) queue.push(next)
    }
  }

  const columns = new Map<number, any[]>()
  for (const node of flowNodes.value) {
    const level = levels.get(node.id) || 0
    const list = columns.get(level) || []
    list.push(node)
    columns.set(level, list)
  }

  flowNodes.value = flowNodes.value.map(node => {
    const columnIndex = levels.get(node.id) || 0
    const column = columns.get(columnIndex) || []
    const rowIndex = column.findIndex(item => item.id === node.id)
    return {
      ...node,
      position: {
        x: 80 + columnIndex * 320,
        y: 80 + rowIndex * 180,
      },
    }
  })

  markDirty()
  nextTick(() => fitCanvas())
}

function buildGraphFromFlow(): WorkflowGraph {
  return {
    version: workflowDraft.value?.graph.version || 1,
    viewport: { ...viewport.value },
    nodes: flowNodes.value.map(node => ({
      id: node.id,
      type: node.data.nodeType,
      title: node.data.title,
      x: node.position.x,
      y: node.position.y,
      config: { ...(node.data.config || {}) },
    })),
    edges: flowEdges.value.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : '',
      sourcePort: edge.sourceHandle || '',
      targetPort: edge.targetHandle || '',
    })),
    groups: workflowDraft.value?.graph.groups || [],
  }
}

async function saveActiveWorkflow() {
  if (!workflowDraft.value) return
  saving.value = true
  try {
    const response = await saveWorkflow({
      id: workflowDraft.value.id || undefined,
      name: workflowName.value.trim() || '未命名工作流',
      description: workflowDescription.value.trim(),
      projectId: selectedProjectId.value,
      templateKey: workflowDraft.value.templateKey,
      version: workflowDraft.value.version,
      tags: workflowTagsInput.value.split(',').map(item => item.trim()).filter(Boolean),
      graph: buildGraphFromFlow(),
    }) as any

    hydrateWorkflow(response.data as WorkflowDetail)
    await loadStudioData(false)
    ElMessage.success('工作流已保存')
  } finally {
    saving.value = false
  }
}

async function runActiveWorkflow() {
  if (!workflowDraft.value?.id) {
    ElMessage.warning('请先保存工作流，再执行。')
    return
  }
  running.value = true
  try {
    const response = await runWorkflow(workflowDraft.value.id) as any
    workflowRuns.value = [response.data, ...workflowRuns.value]
    await loadStudioData(false)
    setInspectorTab('runs')
    ElMessage.success('工作流已开始执行')
  } finally {
    running.value = false
  }
}

async function createWorkflowFromTemplateCard(template: WorkflowTemplate) {
  const response = await createWorkflowFromTemplate({
    templateKey: template.key,
    projectId: selectedProjectId.value,
  }) as any
  await openWorkflow(response.data.id)
  await loadStudioData(false)
  ElMessage.success('模板已导入')
}

function insertTemplateAsSubgraph(template: WorkflowTemplate) {
  if (!workflowDraft.value) createBlankWorkflow()

  const prefix = `sub_${Date.now()}`
  const nodeIdMap = new Map<string, string>()
  const xOffset = 120 + (flowNodes.value.length % 2) * 320
  const yOffset = 120

  const nextNodes = template.graph.nodes.map(node => {
    const nextId = `${prefix}_${node.id}`
    nodeIdMap.set(node.id, nextId)
    return {
      id: nextId,
      type: 'workflowNode',
      position: {
        x: node.x + xOffset,
        y: node.y + yOffset,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        nodeType: node.type,
        title: `${template.name} / ${node.title}`,
        definition: getDefinition(node.type),
        config: { ...(node.config || {}) },
      },
    } as any
  })

  const nextEdges = template.graph.edges.map(edge => ({
    id: `${prefix}_${edge.id}`,
    source: nodeIdMap.get(edge.source) || edge.source,
    target: nodeIdMap.get(edge.target) || edge.target,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    label: edge.label,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  } as any))

  flowNodes.value = [...flowNodes.value, ...nextNodes]
  flowEdges.value = [...flowEdges.value, ...nextEdges]
  markDirty()
  fitCanvas()
  ElMessage.success('模板子流程已插入')
}

async function copyWorkflowSummary(workflow: WorkflowSummary) {
  const response = await copyWorkflow({
    id: workflow.id,
    name: `${workflow.name} 副本`,
  }) as any
  await loadStudioData(false)
  await openWorkflow(response.data.id)
  ElMessage.success('工作流已复制')
}

async function deleteWorkflowSummary(workflow: WorkflowSummary) {
  await ElMessageBox.confirm(`确认删除工作流「${workflow.name}」？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  await deleteWorkflow(workflow.id)
  if (workflowDraft.value?.id === workflow.id) {
    workflowDraft.value = null
    flowNodes.value = []
    flowEdges.value = []
  }
  await loadStudioData(false)
  ElMessage.success('工作流已删除')
}

async function handleProjectChange() {
  workflowDraft.value = null
  flowNodes.value = []
  flowEdges.value = []
  workflowRuns.value = []
  await loadStudioData(true)
}

onMounted(async () => {
  await loadStudioData(true)
})
</script>

<style scoped>
.workflow-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(244, 114, 182, 0.08), transparent 28%),
    radial-gradient(circle at left center, rgba(59, 130, 246, 0.08), transparent 30%),
    linear-gradient(180deg, #f7f8fb 0%, #eef2f7 100%);
  color: #172033;
}

.studio-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.toolbar-copy {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.toolbar-badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.toolbar-title {
  font-size: 30px;
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.toolbar-desc {
  margin-top: 6px;
  max-width: 780px;
  color: #5f6b7d;
  font-size: 13px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.studio-body {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 320px;
  gap: 18px;
  padding: 18px 20px 22px;
  min-height: calc(100vh - 122px);
}

.studio-sidebar,
.studio-inspector,
.canvas-panel {
  min-height: 0;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.studio-sidebar,
.studio-inspector {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.summary-card {
  margin: 16px;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96));
  color: #f8fafc;
}

.summary-head,
.section-head,
.template-head,
.canvas-header,
.workflow-card-top,
.run-card-head,
.run-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-head span,
.section-head span,
.template-head span,
.workflow-meta span,
.detail-text,
.canvas-footer span,
.run-card-meta span,
.summary-item span {
  color: inherit;
  opacity: 0.72;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.summary-item {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
}

.summary-item strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
}

.panel-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 0 16px 14px;
}

.panel-tab {
  border: none;
  border-radius: 14px;
  padding: 10px 8px;
  font-size: 13px;
  font-weight: 700;
  background: rgba(15, 23, 42, 0.05);
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.panel-tab.active {
  background: #172033;
  color: #f8fafc;
}

.sidebar-scroll,
.inspector-scroll {
  flex: 1;
  overflow: auto;
  padding: 0 16px 16px;
}

.sidebar-section,
.inspector-section {
  margin-bottom: 14px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.workflow-card,
.template-card,
.node-card,
.run-card {
  margin-top: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #fff;
}

.workflow-card.active {
  border-color: rgba(59, 130, 246, 0.48);
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.12);
}

.workflow-card-main,
.create-entry {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.create-entry {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 14px;
  border-radius: 18px;
  border: 1px dashed rgba(59, 130, 246, 0.34);
  color: #0f172a;
  background: rgba(239, 246, 255, 0.78);
}

.create-entry span {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: #0f172a;
  color: #fff;
}

.workflow-card p,
.template-card p,
.node-card p,
.run-card p,
.create-entry p {
  margin-top: 6px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.workflow-meta,
.node-card-meta,
.run-card-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.workflow-actions,
.template-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.canvas-panel {
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.canvas-header {
  padding: 4px 4px 14px;
}

.canvas-header strong {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.canvas-header p {
  margin-top: 6px;
  color: #64748b;
  font-size: 13px;
}

.canvas-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.flow-shell {
  position: relative;
  flex: 1;
  min-height: 620px;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  background: linear-gradient(180deg, rgba(250, 250, 252, 0.95), rgba(239, 243, 248, 0.95));
}

.flow-stage {
  width: 100%;
  height: 100%;
}

:deep(.vue-flow__controls),
:deep(.vue-flow__minimap) {
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.12);
}

:deep(.vue-flow__controls-button) {
  background: #fff;
  border-color: rgba(203, 213, 225, 0.9);
}

:deep(.vue-flow__edge-path) {
  stroke: #2563eb;
  stroke-width: 2;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #0f172a;
}

:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  background: #2563eb;
}

.canvas-node {
  width: 250px;
  min-height: 150px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98)),
    linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(244, 114, 182, 0.08));
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.12);
}

.canvas-node.selected {
  border-color: rgba(37, 99, 235, 0.72);
  box-shadow: 0 20px 36px rgba(37, 99, 235, 0.2);
}

.canvas-node-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.canvas-node-head strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}

.canvas-node-head span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.canvas-node-desc {
  margin: 10px 0 12px;
  color: #5f6b7d;
  font-size: 12px;
  line-height: 1.5;
}

.port-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.port-column {
  position: relative;
}

.port-column.align-right {
  text-align: right;
}

.port-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.port-row {
  position: relative;
  min-height: 28px;
  padding: 4px 0;
  font-size: 12px;
  color: #1e293b;
}

.port-row.input {
  padding-left: 12px;
}

.port-row.output {
  padding-right: 12px;
}

.canvas-node-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  font-size: 12px;
  color: #64748b;
}

.canvas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.canvas-empty-card {
  width: min(460px, calc(100% - 40px));
  padding: 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 24px 38px rgba(15, 23, 42, 0.12);
  text-align: center;
  pointer-events: auto;
}

.canvas-empty-card h3 {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.canvas-empty-card p {
  margin-top: 8px;
  color: #64748b;
  line-height: 1.6;
}

.canvas-empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.canvas-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 4px 2px;
  font-size: 12px;
  color: #64748b;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0;
}

.detail-grid div {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.9);
}

.detail-grid span {
  display: block;
  font-size: 11px;
  color: #94a3b8;
}

.detail-grid strong {
  display: block;
  margin-top: 6px;
  color: #0f172a;
  font-size: 13px;
}

.detail-text {
  margin-top: 10px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.param-list {
  display: grid;
  gap: 12px;
}

.param-field label {
  display: block;
  margin-bottom: 6px;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.run-log-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.run-log {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.92);
}

@media (max-width: 1440px) {
  .studio-body {
    grid-template-columns: 280px minmax(0, 1fr) 300px;
  }
}

@media (max-width: 1200px) {
  .studio-body {
    grid-template-columns: 1fr;
  }

  .studio-sidebar,
  .studio-inspector {
    min-height: 320px;
  }

  .flow-shell {
    min-height: 560px;
  }
}
</style>
