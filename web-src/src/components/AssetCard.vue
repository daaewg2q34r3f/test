<template>
  <div class="asset-card" :class="{ 'is-generating': generating, 'is-polishing': polishing }">
    <!-- Image area -->
    <div class="card-image" @click="emit('view-images', asset)">
      <img v-if="asset.imageUrl" :src="asset.imageUrl" :alt="asset.name" />
      <div v-else class="image-placeholder">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>点击生成图片</span>
      </div>

      <!-- Image count badge -->
      <div class="img-count-badge" v-if="imageCount !== null && imageCount !== undefined && imageCount > 0">
        {{ imageCount }} 张
      </div>

      <!-- Generating overlay -->
      <div class="generating-overlay" v-if="generating">
        <div class="spinner"></div>
        <span>生成中...</span>
      </div>

      <!-- Hover overlay (hidden when generating) -->
      <div class="image-overlay" v-else>
        <button class="overlay-btn" @click.stop="emit('generate-image', asset)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
          生成图片
        </button>
        <button class="overlay-btn secondary" @click.stop="emit('view-images', asset)">
          查看全部
        </button>
      </div>
    </div>

    <!-- Card info -->
    <div class="card-info">
      <div class="asset-header">
        <h4 class="asset-name">{{ asset.name }}</h4>
        <span class="type-badge" :class="asset.type">{{ asset.type }}</span>
      </div>

      <!-- Prompt row with polish state / edit mode -->
      <div class="prompt-row">
        <div class="polish-loading" v-if="polishing">
          <div class="polish-bar"></div>
          <div class="polish-bar short"></div>
        </div>
        <textarea
          v-else-if="isEditingPrompt"
          v-model="editPromptValue"
          class="prompt-textarea"
          rows="3"
          placeholder="输入图像生成提示词..."
          @blur="savePrompt"
          @keydown.esc="cancelEditPrompt"
          ref="promptTextareaRef"
        />
        <div v-else class="prompt-display">
          <div
            v-if="asset.prompt || asset.description"
            class="prompt-rendered"
            v-html="renderMarkdown(asset.prompt || asset.description || '')"
          />
          <span v-else class="prompt-empty" @click="startEditPrompt">点击输入提示词</span>
          <button class="edit-icon-btn" title="编辑提示词" @click="startEditPrompt">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Art style row -->
      <div class="style-row">
        <div class="style-selector" ref="styleWrapRef">
          <button class="style-btn" @click.stop="toggleStyleMenu">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {{ asset.artStyle || globalArtStyle || '未指定风格' }}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <div class="style-menu" v-if="styleMenuOpen" @click.stop>
            <button
              v-for="preset in artStylePresets"
              :key="preset"
              class="style-menu-item"
              :class="{ active: asset.artStyle === preset }"
              @click="selectStyle(preset)"
            >{{ preset }}</button>
            <div class="style-menu-divider"></div>
            <button
              class="style-menu-item clear"
              @click="selectStyle('')"
            >使用全局风格</button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="card-actions">
        <button class="action-btn" :disabled="polishing" @click="emit('polish-prompt', asset)" title="基于剧本内容优化提示词">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          优化提示词
        </button>
        <button class="action-btn danger" @click="emit('delete', asset)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'

const props = defineProps<{
  asset: {
    id: number
    name: string
    type: string
    description?: string
    prompt?: string
    imageUrl?: string
    artStyle?: string
    episodes?: number[]
  }
  generating?: boolean
  polishing?: boolean
  imageCount?: number | null
  globalArtStyle?: string
}>()

const emit = defineEmits<{
  'generate-image': [asset: any]
  'polish-prompt': [asset: any]
  'view-images': [asset: any]
  'update-style': [assetId: number, style: string]
  'save-prompt': [assetId: number, prompt: string]
  delete: [asset: any]
}>()

const artStylePresets = ['写实风格', '动漫风格', '水墨风格', '像素风格', '赛博朋克']
const styleMenuOpen = ref(false)
const styleWrapRef = ref<HTMLElement | null>(null)

// Prompt inline editing
const isEditingPrompt = ref(false)
const editPromptValue = ref('')
const promptTextareaRef = ref<HTMLTextAreaElement | null>(null)

function startEditPrompt() {
  if (props.polishing) return
  editPromptValue.value = props.asset.prompt || props.asset.description || ''
  isEditingPrompt.value = true
  nextTick(() => promptTextareaRef.value?.focus())
}

function savePrompt() {
  isEditingPrompt.value = false
  emit('save-prompt', props.asset.id, editPromptValue.value.trim())
}

function cancelEditPrompt() {
  isEditingPrompt.value = false
}

function toggleStyleMenu() {
  styleMenuOpen.value = !styleMenuOpen.value
}

function selectStyle(style: string) {
  styleMenuOpen.value = false
  emit('update-style', props.asset.id, style)
}

function handleOutsideClick(e: MouseEvent) {
  if (styleWrapRef.value && !styleWrapRef.value.contains(e.target as Node)) {
    styleMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))

</script>

<style scoped>
.asset-card {
  background: white;
  border-radius: 10px;
  overflow: visible;
  border: 1px solid #ebebeb;
  transition: all 0.2s;
  position: relative;
}

.asset-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  border-color: transparent;
}

/* Image */
.card-image {
  height: 160px;
  background: #f5f5f5;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  border-radius: 10px 10px 0 0;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: #aaa;
}

.img-count-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}

/* Generating overlay */
.generating-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: white;
  font-size: 13px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Hover overlay */
.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.card-image:hover .image-overlay {
  opacity: 1;
}

.overlay-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 16px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  background: #6366f1;
  color: white;
  font-weight: 500;
  transition: background 0.15s;
}

.overlay-btn:hover { background: #4f46e5; }

.overlay-btn.secondary {
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.5);
}
.overlay-btn.secondary:hover { background: rgba(255,255,255,0.3); }

/* Card info */
.card-info {
  padding: 12px;
}

.asset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.asset-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.type-badge.角色 { background: #ede9fe; color: #7c3aed; }
.type-badge.场景 { background: #d1fae5; color: #065f46; }
.type-badge.道具 { background: #fef3c7; color: #92400e; }

/* Prompt area */
.prompt-row {
  min-height: 38px;
  margin-bottom: 8px;
}

.prompt-display {
  position: relative;
  padding: 4px 28px 4px 4px;
  border-radius: 4px;
  min-height: 22px;
}

.prompt-rendered {
  max-height: 90px;
  overflow-y: auto;
  font-size: 11.5px;
  color: #555;
  line-height: 1.55;
}

.prompt-rendered :deep(h1), .prompt-rendered :deep(h2), .prompt-rendered :deep(h3),
.prompt-rendered :deep(h4), .prompt-rendered :deep(h5) {
  font-size: 11.5px; font-weight: 700; margin: 4px 0 2px; color: #333;
}
.prompt-rendered :deep(p)  { margin: 0 0 3px; }
.prompt-rendered :deep(ul), .prompt-rendered :deep(ol) { padding-left: 14px; margin: 2px 0; }
.prompt-rendered :deep(li) { margin: 1px 0; }
.prompt-rendered :deep(hr) { border: none; border-top: 1px solid #eee; margin: 4px 0; }
.prompt-rendered :deep(strong) { font-weight: 700; color: #333; }
.prompt-rendered :deep(blockquote) { border-left: 2px solid #6366f1; padding-left: 6px; color: #666; margin: 3px 0; }

.prompt-empty {
  font-size: 12px;
  color: #ccc;
  font-style: italic;
  cursor: pointer;
}

.edit-icon-btn {
  position: absolute;
  top: 4px;
  right: 2px;
  width: 22px;
  height: 22px;
  border: none;
  background: white;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.prompt-display:hover .edit-icon-btn {
  opacity: 1;
}

.edit-icon-btn:hover { color: #6366f1; background: #f5f3ff; }

.prompt-textarea {
  width: 100%;
  font-size: 12px;
  color: #444;
  line-height: 1.5;
  border: 1px solid #6366f1;
  border-radius: 5px;
  padding: 5px 7px;
  outline: none;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;
  background: #faf9ff;
}

/* Polish loading skeleton */
.polish-loading {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 4px 0;
}

.polish-bar {
  height: 10px;
  border-radius: 5px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}

.polish-bar.short {
  width: 60%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Art style row */
.style-row {
  margin-bottom: 8px;
}

.style-selector {
  position: relative;
  display: inline-block;
}

.style-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid #e8e8e8;
  background: #fafafa;
  font-size: 11px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #f5f3ff;
}

.style-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 100;
  min-width: 130px;
  padding: 4px;
  overflow: hidden;
}

.style-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: none;
  background: none;
  font-size: 12px;
  color: #444;
  cursor: pointer;
  border-radius: 5px;
  transition: background 0.1s;
}

.style-menu-item:hover { background: #f5f5f5; }
.style-menu-item.active { color: #6366f1; font-weight: 600; background: #f0eeff; }
.style-menu-item.clear { color: #999; }
.style-menu-divider { height: 1px; background: #f0f0f0; margin: 3px 0; }

/* Actions */
.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  background: white;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #f5f3ff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.danger {
  color: #ef4444;
  border-color: transparent;
  background: transparent;
  padding: 4px 6px;
  margin-left: auto;
}

.action-btn.danger:hover {
  background: #fef2f2;
}
</style>
