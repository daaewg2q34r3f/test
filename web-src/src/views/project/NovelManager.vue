<template>
  <WorkspacePlaceholderPage
    badge="阶段创作 / 小说管理"
    title="小说管理"
    description="这里将汇总项目里的长篇原稿、章节拆分结果、批注记录与版本快照。当前先把页面框架搭起来，后续再接入导入、检索、对比和批量整理能力。"
    :stats="stats"
    :panels="panels"
    checklist-title="后续接入方向"
    :checklist="checklist"
    note="这个页面属于阶段创作模式下的内容管理区，目标是把 Stage 1 的原稿和章节沉淀为长期可维护的数据资产。"
  >
    <template #actions>
      <el-button disabled>导入长篇原稿</el-button>
      <el-button disabled>批量拆分章节</el-button>
      <el-button type="primary" disabled>新建小说条目</el-button>
    </template>
  </WorkspacePlaceholderPage>
</template>

<script setup lang="ts">
import WorkspacePlaceholderPage from '@/components/WorkspacePlaceholderPage.vue'

const stats = [
  { label: '原稿池', value: '00', hint: '统一承接项目内所有长篇原稿和外部导入内容。' },
  { label: '章节索引', value: '00', hint: '面向章节、卷宗、剧情线索构建基础索引。' },
  { label: '版本快照', value: '00', hint: '后续用于保存阶段性改写、对比和回滚节点。' }
]

const panels = [
  {
    title: '原稿收纳区',
    tag: 'Collection',
    description: '承接全文导入、手动录入、章节拆分和项目内已有内容回流。',
    points: ['支持按作品、卷、章节组织内容结构', '预留原始文本和清洗文本两套视图', '方便后续给大纲与导演模式做内容供给']
  },
  {
    title: '章节视图',
    tag: 'Index',
    description: '把单章内容、字数、标签和时间线统一展示，便于跨阶段检索。',
    points: ['按章节查看摘要、状态、更新时间', '支持后续按角色、事件、线索过滤', '为 Stage 1 与 Stage 2 的联动打基础']
  },
  {
    title: '版本与批注',
    tag: 'Revision',
    description: '记录改写过程中的差异、评论和确认结果，避免原稿演化过程丢失。',
    points: ['预留手动批注和 AI 批注双轨结构', '为后续版本对比页准备元数据', '适合承接导演模式的自动修订建议']
  },
  {
    title: '批量操作面板',
    tag: 'Batch',
    description: '后续在这里放导入、合并、拆章、重命名、归档等批量动作。',
    points: ['批量规范化章节标题', '批量补齐标签和来源信息', '将原稿快速投喂到大纲或工作流模式']
  }
]

const checklist = [
  '接入项目内现有章节数据和全文粘贴入口',
  '支持原稿导入、拆章和批量归类',
  '增加版本快照、恢复和对比视图',
  '与阶段创作 Stage 1 和智能导演模式打通'
]
</script>
