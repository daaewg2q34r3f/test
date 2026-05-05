<template>
  <div class="pipeline-nav">
    <div
      v-for="(stage, index) in stages"
      :key="stage.id"
      class="stage-item"
      :class="{
        done: completedStage > stage.id,
        current: currentStage === stage.id
      }"
      @click="handleClick(stage.id)"
    >
      <div class="connector" v-if="index > 0" :class="{ done: completedStage > stage.id }" />
      <div class="circle">
        <svg v-if="completedStage > stage.id" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else-if="currentStage === stage.id" class="spin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        <span v-else>{{ stage.id }}</span>
      </div>
      <span class="label">{{ stage.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

defineProps<{ currentStage: number; completedStage: number }>()

const router = useRouter()
const route = useRoute()

const stages = [
  { id: 1, label: '故事灵感' },
  { id: 2, label: '剧集大纲' },
  { id: 3, label: '剧本生成' },
  { id: 4, label: '项目资产' },
  { id: 5, label: '分镜制作' },
  { id: 6, label: '视频合成' }
]

function handleClick(stageId: number) {
  router.push(`/project/${route.params.id}/creation/stage${stageId}`)
}
</script>

<style scoped>
.pipeline-nav {
  display: flex;
  align-items: center;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  position: relative;
  min-width: 76px;
  cursor: pointer;
  user-select: none;
}

/* Connector line */
.connector {
  position: absolute;
  top: 12px;
  left: -50%;
  width: calc(100% - 24px);
  height: 1.5px;
  background: var(--tf-border-a);
  transform: translateX(12px);
  transition: background 0.25s ease;
}
.connector.done { background: var(--tf-primary); }

/* Circle */
.circle {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid var(--tf-border-a);
  color: var(--tf-text-3);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
  transition: all 0.2s ease;
  position: relative; z-index: 1;
}

.stage-item:hover .circle {
  border-color: var(--tf-primary-b);
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
}

.stage-item.done .circle {
  background: var(--tf-primary);
  border-color: var(--tf-primary);
  color: #fff;
}

.stage-item.current .circle {
  background: var(--tf-primary);
  border-color: var(--tf-primary);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(99,102,241,0.18);
}

/* Label */
.label {
  font-size: 10px;
  color: var(--tf-text-3);
  white-space: nowrap;
  transition: color 0.18s;
  font-weight: 500;
}
.stage-item.done .label,
.stage-item.current .label { color: var(--tf-primary); }

/* Spin animation */
@media (prefers-reduced-motion: no-preference) {
  .spin-icon { animation: spin 1.2s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
