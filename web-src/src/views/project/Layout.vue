<template>
  <div class="project-layout">
    <header class="project-header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/creation/projects')" aria-label="返回项目列表">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          项目列表
        </button>
        <div class="header-sep" />
        <div class="brand-mini">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#6366F1"/>
            <path d="M8 11l8-4 8 4v10l-8 4-8-4V11z" stroke="white" stroke-width="1.5" fill="none"/>
            <circle cx="16" cy="16" r="3" fill="white"/>
          </svg>
        </div>
        <div class="project-copy">
          <span class="project-mode">阶段创作</span>
          <span class="project-name">{{ project?.name || '加载中...' }}</span>
        </div>
      </div>

      <div class="header-center">
        <PipelineNav :current-stage="activeStage" :completed-stage="completedStage" />
      </div>

      <div class="header-right">
        <span class="project-chip">{{ project?.type || '未设置类型' }}</span>
        <span class="project-chip">{{ project?.videoRatio || '16:9' }}</span>
      </div>
    </header>

    <main class="project-content">
      <div v-if="!project" class="project-loading">
        <span>加载中...</span>
      </div>
      <router-view v-else @stage-complete="onStageComplete" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import PipelineNav from '@/components/PipelineNav.vue'
import { useProjectStore } from '@/stores/project'
import { getSingleProject } from '@/api/project'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const project = computed(() => projectStore.currentProject)
const activeStage = computed(() => Number(route.meta.stageId || 1))
const completedStage = computed(() => project.value?.currentStage || projectStore.currentStage || 1)

async function loadProject(id: string | string[] | undefined) {
  const projectId = Array.isArray(id) ? id[0] : id
  if (!projectId) return
  if (project.value?.id === Number(projectId)) return
  try {
    const res = await getSingleProject(Number(projectId)) as any
    const data = Array.isArray(res.data) ? res.data[0] : res.data
    if (data) projectStore.setProject(data)
  } catch (e) {
    console.error('[Layout 项目加载失败]:', e)
  }
}

watch(() => route.params.id, loadProject, { immediate: true })

function onStageComplete(stage: number) {
  if (project.value) {
    const newStage = Math.max(project.value.currentStage || 1, stage + 1)
    projectStore.advanceStage(newStage)
  }
}
</script>

<style scoped>
.project-layout {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--tf-bg);
}

.project-header {
  height: 60px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--tf-border);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-left {
  min-width: 260px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  color: var(--tf-text-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 7px;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}

.back-btn:hover {
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
}

.header-sep {
  width: 1px;
  height: 18px;
  background: var(--tf-border-a);
}

.brand-mini {
  display: flex;
  align-items: center;
}

.project-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.project-mode {
  font-size: 11px;
  color: var(--tf-primary);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tf-text);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.header-right {
  min-width: 160px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.project-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--tf-surface-3);
  color: var(--tf-text-2);
  font-size: 12px;
  font-weight: 600;
}

.project-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.project-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tf-text-3);
  font-size: 13px;
}

@media (max-width: 1180px) {
  .project-header {
    height: auto;
    min-height: 60px;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .header-left,
  .header-center,
  .header-right {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
  }
}
</style>
