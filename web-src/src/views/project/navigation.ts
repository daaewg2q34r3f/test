export type ProjectModeKey = 'creation' | 'workflow' | 'director'

export interface ProjectNavItem {
  key: string
  label: string
  description: string
  segment: string
  mode: ProjectModeKey
  kind: 'stage' | 'manager' | 'mode'
  stageId?: number
  badge?: string
}

export const modeMeta: Record<ProjectModeKey, { label: string; description: string }> = {
  creation: {
    label: '阶段创作',
    description: '按阶段推进短剧生产流程，并补充小说、剧本与资产管理页面。'
  },
  workflow: {
    label: '画布编排',
    description: '通过节点、连线和模块编排，把短剧生产流程组织成可复用的工作流。'
  },
  director: {
    label: '智能导演',
    description: '用 Agent 调用 Skill 与工具链，配置目标后自动推进整条创作链路。'
  }
}

export const creationStageItems: ProjectNavItem[] = [
  {
    key: 'stage1',
    label: '故事灵感',
    description: '围绕故事设定、原稿输入与章节生成推进第一阶段。',
    segment: 'creation/stage1',
    mode: 'creation',
    kind: 'stage',
    stageId: 1
  },
  {
    key: 'stage2',
    label: '剧集大纲',
    description: '生成分集大纲、故事线与剧情结构。',
    segment: 'creation/stage2',
    mode: 'creation',
    kind: 'stage',
    stageId: 2
  },
  {
    key: 'stage3',
    label: '剧本生成',
    description: '把大纲扩展成可拍摄、可修改的剧本内容。',
    segment: 'creation/stage3',
    mode: 'creation',
    kind: 'stage',
    stageId: 3
  },
  {
    key: 'stage4',
    label: '项目资产',
    description: '围绕角色、场景、道具生成与整理项目资产。',
    segment: 'creation/stage4',
    mode: 'creation',
    kind: 'stage',
    stageId: 4
  },
  {
    key: 'stage5',
    label: '分镜制作',
    description: '根据剧本和资产继续推进镜头规划与分镜生成。',
    segment: 'creation/stage5',
    mode: 'creation',
    kind: 'stage',
    stageId: 5
  },
  {
    key: 'stage6',
    label: '视频合成',
    description: '完成视频参数配置、生成和片段合成。',
    segment: 'creation/stage6',
    mode: 'creation',
    kind: 'stage',
    stageId: 6
  }
]

export const creationManagerItems: ProjectNavItem[] = [
  {
    key: 'novels',
    label: '小说管理',
    description: '集中管理项目中的原稿、章节、版本与导入内容。',
    segment: 'creation/novels',
    mode: 'creation',
    kind: 'manager',
    badge: '内容管理'
  },
  {
    key: 'scripts',
    label: '剧本管理',
    description: '集中查看分集剧本、脚本版本与后续审阅状态。',
    segment: 'creation/scripts',
    mode: 'creation',
    kind: 'manager',
    badge: '内容管理'
  }
]

export const standaloneModeItems: ProjectNavItem[] = [
  {
    key: 'assets',
    label: '资产管理',
    description: '统一管理角色、场景、道具等项目资产及其引用关系。',
    segment: '/assets',
    mode: 'creation',
    kind: 'mode',
    badge: '资产库'
  },
  {
    key: 'workflow',
    label: '画布编排',
    description: '通过组件节点、连线和条件分支设计短剧工作流。',
    segment: '/workflow',
    mode: 'workflow',
    kind: 'mode',
    badge: 'Mode 02'
  },
  {
    key: 'director',
    label: '智能导演',
    description: '用目标驱动的 Agent + Skill 模式，一键生成创作结果。',
    segment: '/director',
    mode: 'director',
    kind: 'mode',
    badge: 'Mode 03'
  }
]

export const creationProjectItem: ProjectNavItem = {
  key: 'projects',
  label: '项目列表',
  description: '查看、新建和管理当前账号下的全部短剧项目。',
  segment: '/creation/projects',
  mode: 'creation',
  kind: 'manager',
  badge: '入口'
}

export function buildProjectPath(projectId: string | number, segment: string) {
  return `/project/${projectId}/${segment}`
}
