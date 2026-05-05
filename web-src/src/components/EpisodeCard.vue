<template>
  <div class="episode-card" @click="emit('click', outline)">
    <div class="card-top">
      <div class="episode-num">第 {{ outline.episode }} 集</div>
      <div class="card-actions" @click.stop>
        <el-button text icon="Edit" size="small" @click="emit('edit', outline)" />
        <el-button text icon="RefreshRight" size="small" :loading="regenerating" @click="emit('regenerate', outline)" />
        <el-button text icon="Delete" size="small" @click="emit('delete', outline)" />
      </div>
    </div>

    <h3 class="episode-title">{{ outline.title || '未命名剧集' }}</h3>

    <div class="key-events" v-if="outline.keyEvents">
      <p class="section-label">关键事件</p>
      <p class="content-preview">{{ truncate(String(outline.keyEvents), 100) }}</p>
    </div>

    <div class="outline-content" v-if="outline.content">
      <p class="section-label">剧情主干</p>
      <p class="content-preview">{{ truncate(outline.content, 80) }}</p>
    </div>

    <div class="meta-tags" v-if="outline.characters || outline.scenes">
      <div v-if="outline.characters" class="tags-row">
        <el-icon><User /></el-icon>
        <span>{{ truncate(String(outline.characters), 50) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  outline: {
    id: number
    episode: number
    title: string
    keyEvents?: string
    characters?: string
    scenes?: string
    content?: string
  }
  regenerating?: boolean
}>()

const emit = defineEmits<{
  click: [outline: any]
  edit: [outline: any]
  regenerate: [outline: any]
  delete: [outline: any]
}>()

function truncate(str: string, len: number) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}
</script>

<style scoped>
.episode-card {
  background: white;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.episode-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.episode-num {
  font-size: 12px;
  color: #409eff;
  font-weight: 600;
  background: #ecf5ff;
  padding: 2px 8px;
  border-radius: 4px;
}

.card-actions {
  display: flex;
  gap: 0;
}

.episode-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  line-height: 1.4;
}

.key-events {
  margin-bottom: 8px;
}

.outline-content {
  margin-bottom: 8px;
}

.section-label {
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.content-preview {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

.meta-tags {
  border-top: 1px solid #f5f5f5;
  padding-top: 10px;
}

.tags-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
}
</style>
