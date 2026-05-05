<template>
  <div class="storyboard-strip">
    <div class="strip-scroll">
      <div
        v-for="(frame, idx) in frames"
        :key="frame.id"
        class="frame-item"
        :class="{ selected: selectedId === frame.id }"
        @click="emit('select', frame)"
      >
        <div class="frame-number">{{ idx + 1 }}</div>
        <div class="frame-image">
          <img v-if="frame.imageUrl" :src="frame.imageUrl" :alt="`镜头${idx + 1}`" />
          <div v-else class="frame-placeholder">
            <el-icon><Film /></el-icon>
          </div>
        </div>
        <div class="frame-meta">
          <span class="frame-duration">{{ frame.duration || 3 }}s</span>
        </div>
        <div class="frame-overlay">
          <el-button text size="small" icon="Edit" @click.stop="emit('edit', frame)" />
        </div>
      </div>

      <div class="frame-add" @click="emit('add')">
        <el-icon size="24" color="#ccc"><Plus /></el-icon>
        <span>添加</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  frames: Array<{
    id: number
    imageUrl?: string
    duration?: number
    prompt?: string
  }>
  selectedId?: number
}>()

const emit = defineEmits<{
  select: [frame: any]
  edit: [frame: any]
  add: []
}>()
</script>

<style scoped>
.storyboard-strip {
  background: #1a1a2e;
  padding: 16px;
  border-radius: 8px;
  overflow: hidden;
}

.strip-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.strip-scroll::-webkit-scrollbar {
  height: 4px;
}

.strip-scroll::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 2px;
}

.frame-item {
  flex-shrink: 0;
  width: 120px;
  cursor: pointer;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.frame-item:hover,
.frame-item.selected {
  border-color: #409eff;
}

.frame-number {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  z-index: 2;
}

.frame-image {
  height: 80px;
  background: #2d2d44;
  overflow: hidden;
}

.frame-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.frame-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.frame-meta {
  background: #16213e;
  padding: 4px 8px;
  display: flex;
  justify-content: center;
}

.frame-duration {
  font-size: 11px;
  color: #aaa;
}

.frame-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.frame-item:hover .frame-overlay {
  opacity: 1;
}

.frame-add {
  flex-shrink: 0;
  width: 80px;
  height: 100px;
  border: 2px dashed #444;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  transition: all 0.2s;
}

.frame-add:hover {
  border-color: #409eff;
  color: #409eff;
}
</style>
