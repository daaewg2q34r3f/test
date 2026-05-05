<template>
  <WorkspacePlaceholderPage
    badge="阶段创作 / 资产管理"
    title="资产管理"
    description="这里会把角色、场景、道具统一收口到一个项目资产中心，支持检索、筛选、引用关系和批量生成。现在先把页面框架做好，后续再接入真实资产数据。"
    :stats="stats"
    :panels="panels"
    checklist-title="资产中心待接能力"
    :checklist="checklist"
    note="这个页面和 Stage 4 的资产生成页并不冲突。Stage 4 更偏生产过程，这里更偏跨阶段的总库管理和复用。"
  >
    <template #actions>
      <el-button disabled>导入参考资产</el-button>
      <el-button disabled>批量整理标签</el-button>
      <el-button type="primary" disabled>新建资产条目</el-button>
    </template>
  </WorkspacePlaceholderPage>
</template>

<script setup lang="ts">
import WorkspacePlaceholderPage from '@/components/WorkspacePlaceholderPage.vue'

const stats = [
  { label: '角色', value: '00', hint: '承接人物设定、形象参考、台词口吻和关联剧本。' },
  { label: '场景', value: '00', hint: '集中管理地点、时段、氛围和镜头使用频次。' },
  { label: '道具', value: '00', hint: '统一管理关键物件、提示词、图像与跨镜头复用。' }
]

const panels = [
  {
    title: '统一资产索引',
    tag: 'Library',
    description: '角色、场景、道具统一放在一个总库里查看，而不是分散在单个阶段页。',
    points: ['支持跨类型检索与标签过滤', '可扩展资产状态、优先级、使用频次', '适合作为工作流模式的公共输入层']
  },
  {
    title: '引用关系视图',
    tag: 'Usage',
    description: '后续会在这里展示资产被哪些章节、剧本、分镜和视频任务引用。',
    points: ['追踪角色在多集之间的使用情况', '反查某个场景和道具关联到哪些镜头', '为删改资产时提供影响面提示']
  },
  {
    title: '素材与提示词',
    tag: 'Media',
    description: '统一摆放参考图、生成图、提示词版本和风格锁定信息。',
    points: ['支持后续批量替换、风格对齐和封面选择', '为图像生成和视频生成共用素材基础', '方便导演模式自动调用已确认资产']
  },
  {
    title: '批量生产入口',
    tag: 'Batch',
    description: '后续会在这里放批量生图、批量重命名、批量归档和批量导出动作。',
    points: ['一键补齐缺失参考图', '一键更新风格词和资产标签', '一键同步到分镜和视频模式']
  }
]

const checklist = [
  '接入角色、场景、道具三类真实数据',
  '补充检索、标签、引用关系和预览面板',
  '打通 Stage 4 与分镜、视频页的资产复用链路',
  '为画布编排和智能导演提供资产总线能力'
]
</script>
