<template>
  <WorkspacePlaceholderPage
    badge="阶段创作 / 剧本管理"
    title="剧本管理"
    description="这里将集中管理项目的分集剧本、改稿版本、审核记录和结构化元数据。当前先搭好页面骨架，后续再接入真实的剧本数据和编辑动作。"
    :stats="stats"
    :panels="panels"
    checklist-title="首版规划"
    :checklist="checklist"
    note="这个页面会承接 Stage 3 产出的剧本正文，也会给分镜制作、画布编排和智能导演模式提供统一的剧本入口。"
  >
    <template #actions>
      <el-button disabled>导入已有剧本</el-button>
      <el-button disabled>批量标记状态</el-button>
      <el-button type="primary" disabled>新建剧本草稿</el-button>
    </template>
  </WorkspacePlaceholderPage>
</template>

<script setup lang="ts">
import WorkspacePlaceholderPage from '@/components/WorkspacePlaceholderPage.vue'

const stats = [
  { label: '分集剧本', value: '00', hint: '统一承接每一集、每一版的剧本正文和拆解结果。' },
  { label: '草稿版本', value: '00', hint: '用于沉淀扩写稿、导演修订稿、定稿等版本。' },
  { label: '审核节点', value: '00', hint: '后续可挂接审阅意见、通过状态和发布时间。' }
]

const panels = [
  {
    title: '分集剧本列表',
    tag: 'Episode',
    description: '从分集维度查看剧本标题、对应大纲、改写状态和最近更新时间。',
    points: ['剧本可按集数、场次、角色维度筛选', '后续支持从大纲直接跳入对应剧本', '为分镜页和视频页提供统一引用入口']
  },
  {
    title: '版本轨迹',
    tag: 'Timeline',
    description: '记录每次扩写、改稿、人工修订和导演建议的版本轨迹。',
    points: ['区分自动生成稿与人工确认稿', '预留版本对比和差异高亮', '适合接入 Agent 自动修订记录']
  },
  {
    title: '结构化信息',
    tag: 'Metadata',
    description: '把场景、角色、台词密度、镜头提示等结构化字段沉淀下来。',
    points: ['为后续工作流节点直接消费剧本数据', '支撑资产引用、分镜引用与统计分析', '可进一步扩展为镜头级脚本视图']
  },
  {
    title: '审阅与发布',
    tag: 'Review',
    description: '这里将承载审校状态、分镜前置检查和导出发布动作。',
    points: ['区分待审、修改中、已确认、已投喂分镜', '预留批量导出和版本冻结', '让阶段创作与智能导演协同更清晰']
  }
]

const checklist = [
  '接入现有 Stage 3 产出的剧本列表',
  '补充剧本状态、版本号和更新时间字段',
  '支持剧本摘要、内容检索和版本切换',
  '为分镜制作与工作流节点提供标准化输入'
]
</script>
