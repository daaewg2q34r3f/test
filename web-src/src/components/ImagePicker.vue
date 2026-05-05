<template>
  <el-dialog v-model="visible" title="图片管理" width="800px" @close="emit('close')">
    <!-- Multi-panel row -->
    <div v-if="panelSections && panelSections.length > 0" class="panel-row">
      <span class="action-label">格：</span>
      <select v-model="selectedPanelIdx" class="panel-select">
        <option v-for="(p, i) in panelSections" :key="i" :value="i">{{ p.label }}</option>
      </select>
      <button
        class="generate-panel-btn"
        :class="{ loading: !!generatingPanel }"
        :disabled="!!generatingPanel || generating"
        @click="emit('generate-panel', panelSections[selectedPanelIdx].label, panelSections[selectedPanelIdx].fullPrompt, linkedMode)"
      >
        <span v-if="!!generatingPanel" class="mini-spinner"></span>
        {{ !!generatingPanel ? '生成中...' : '为此格生成' }}
      </button>
      <button
        class="generate-all-panels-btn"
        :disabled="!!generatingPanel || generating"
        @click="emit('generate-all-panels', linkedMode)"
      >
        <span v-if="!!generatingPanel" class="mini-spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></span>
        <template v-if="panelProgress && panelProgress.total > 0">
          {{ panelProgress.current }}/{{ panelProgress.total }} 生成中...
        </template>
        <template v-else>
          {{ `分格生成（${panelSections.length}）` }}
        </template>
      </button>
      <button
        class="generate-full-sheet-btn"
        :disabled="!!generatingPanel || generating"
        @click="emit('generate-full-sheet', linkedMode)"
      >
        <span v-if="generating" class="mini-spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></span>
        {{ generating ? '生成中...' : '整版设定表' }}
      </button>
    </div>

    <div class="picker-toolbar">
      <div class="picker-info">
        <span v-if="images.length > 0" class="selected-count">
          已选 {{ selectedUrls.size }} / {{ images.length }} 张
        </span>
        <span v-if="selectedUrls.size > 0" class="ref-ready">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#22c55e"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          分镜参考图已就绪
        </span>
      </div>
      <div class="picker-actions">
        <template v-if="stateGroups.length > 0">
          <div
            v-for="group in stateGroups"
            :key="group.groupLabel"
            class="btn-group"
          >
            <span class="action-label">{{ group.groupLabel }}：</span>
            <button
              v-for="btn in group.buttons"
              :key="btn.label"
              class="state-btn"
              :class="{ loading: generatingState === btn.label }"
              :disabled="!!generatingState || generating"
              :title="btn.desc"
              @click="emit('generate-state', btn.label, btn.prompt, linkedMode)"
            >
              <span v-if="generatingState === btn.label" class="mini-spinner"></span>
              {{ btn.label }}
            </button>
          </div>
        </template>
        <button
          class="linked-mode-btn"
          :class="{ linked: linkedMode }"
          :title="linkedMode ? '关联模式：新图参考已有图片保持风格一致（点击切换）' : '自由模式：随机生成，风格可能有差异（点击切换）'"
          @click="linkedMode = !linkedMode"
        >
          <svg v-if="linkedMode" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 00-.12-7.07 5.006 5.006 0 00-6.95 0l-1.72 1.72"/>
            <path d="M5.17 11.75l-1.71 1.71a5.004 5.004 0 00.12 7.07 5.006 5.006 0 006.95 0l1.71-1.71"/>
            <line x1="8" y1="2" x2="8" y2="5"/>
            <line x1="2" y1="8" x2="5" y2="8"/>
            <line x1="16" y1="19" x2="16" y2="22"/>
            <line x1="19" y1="16" x2="22" y2="16"/>
          </svg>
          {{ linkedMode ? '关联' : '自由' }}
        </button>
        <button class="generate-more-btn" :disabled="generating || !!generatingState" @click="emit('generate', linkedMode)">
          <span v-if="generating" class="mini-spinner"></span>
          {{ generating ? '生成中...' : '生成更多' }}
        </button>
      </div>
    </div>

    <div v-loading="loading" class="image-picker">
      <div class="images-grid" v-if="images.length > 0">
        <div
          v-for="(img, idx) in images"
          :key="idx"
          class="image-item"
          :class="{ selected: selectedUrls.has(img.url), primary: primaryUrl === img.url }"
          @click="toggleSelect(img.url)"
        >
          <img :src="img.url" :alt="`图片${idx + 1}`" @dblclick.stop="previewUrl = img.url" />

          <div class="select-indicator">
            <div class="checkbox" :class="{ checked: selectedUrls.has(img.url) }">
              <svg v-if="selectedUrls.has(img.url)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          </div>

          <div class="primary-badge" v-if="primaryUrl === img.url">封面</div>

          <div class="image-actions" @click.stop>
            <button class="set-primary-btn" :class="{ active: primaryUrl === img.url }" title="设为封面" @click="setPrimary(img.url)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
            <button class="del-btn" title="删除" @click="emit('delete-image', img.url)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="empty-images">
        <el-empty description="暂无图片，点击上方按钮生成" />
      </div>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="previewUrl" class="lightbox" @click="previewUrl = ''" @keydown.esc="previewUrl = ''">
        <img :src="previewUrl" class="lightbox-img" @click.stop />
        <button class="lightbox-close" @click="previewUrl = ''">✕</button>
      </div>
    </Teleport>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :disabled="selectedUrls.size === 0" @click="handleConfirm">
        确认选择（{{ selectedUrls.size }} 张）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, reactive, computed } from 'vue'
import type { PanelSection } from '@/utils/parseMultiPanel'

interface StateButton {
  label: string
  prompt: string
  desc: string
}

interface ButtonGroup {
  groupLabel: string
  buttons: StateButton[]
}

// 角色：角度 + 情绪，两组
const CHARACTER_GROUPS: ButtonGroup[] = [
  {
    groupLabel: '角度',
    buttons: [
      { label: '正面', prompt: 'front view, facing forward, full body', desc: '正面角度' },
      { label: '侧面', prompt: 'side view, profile shot, full body', desc: '侧面角度' },
      { label: '3/4角', prompt: 'three-quarter view, 3/4 angle, full body', desc: '四分之三角度' },
      { label: '背面', prompt: 'back view, from behind, full body', desc: '背面角度' },
    ],
  },
  {
    groupLabel: '情绪',
    buttons: [
      { label: '正常', prompt: 'neutral expression, calm, standard state', desc: '标准状态' },
      { label: '愤怒', prompt: 'angry expression, furious, intense eyes, rage', desc: '愤怒情绪' },
      { label: '悲伤', prompt: 'sad expression, sorrowful, tearful, downcast eyes', desc: '悲伤情绪' },
      { label: '惊恐', prompt: 'frightened expression, terror, wide eyes, panic', desc: '惊恐情绪' },
      { label: '喜悦', prompt: 'joyful expression, happy smile, bright eyes, cheerful', desc: '喜悦情绪' },
      { label: '受伤', prompt: 'injured, wounded, disheveled, exhausted, hurt', desc: '受伤状态' },
    ],
  },
]

// 场景：角度（远近景） + 氛围
const SCENE_GROUPS: ButtonGroup[] = [
  {
    groupLabel: '景别',
    buttons: [
      { label: '全景', prompt: 'wide shot, full scene view, establishing shot', desc: '全景视角' },
      { label: '中景', prompt: 'medium shot, mid-range view', desc: '中景视角' },
      { label: '特写', prompt: 'close-up detail, focused view', desc: '特写视角' },
    ],
  },
  {
    groupLabel: '氛围',
    buttons: [
      { label: '白天', prompt: 'daytime, bright natural lighting, clear sky', desc: '白天光线' },
      { label: '深夜', prompt: 'night time, dark atmosphere, dim lighting, moonlight', desc: '夜晚氛围' },
      { label: '黄昏', prompt: 'dusk, golden hour, sunset orange light', desc: '黄昏光线' },
      { label: '雨天', prompt: 'rainy weather, wet surfaces, gray overcast sky', desc: '雨天阴沉' },
      { label: '紧张', prompt: 'tense dramatic atmosphere, high contrast, ominous', desc: '紧张氛围' },
      { label: '温馨', prompt: 'warm cozy atmosphere, soft golden lighting', desc: '温馨氛围' },
    ],
  },
]

// 道具：角度 + 状态
const PROP_GROUPS: ButtonGroup[] = [
  {
    groupLabel: '角度',
    buttons: [
      { label: '正面', prompt: 'front view, facing forward', desc: '正面角度' },
      { label: '侧面', prompt: 'side view, profile', desc: '侧面角度' },
      { label: '俯视', prompt: 'top-down view, overhead shot', desc: '俯视角度' },
    ],
  },
  {
    groupLabel: '状态',
    buttons: [
      { label: '标准', prompt: 'clean standard view, clear display', desc: '标准展示' },
      { label: '使用中', prompt: 'being held and used, in operation, dynamic', desc: '使用状态' },
      { label: '特写', prompt: 'extreme close-up, macro detail, texture visible', desc: '细节特写' },
      { label: '陈旧', prompt: 'worn aged appearance, weathered, scratched', desc: '破旧状态' },
    ],
  },
]

const TYPE_GROUP_MAP: Record<string, ButtonGroup[]> = {
  '角色': CHARACTER_GROUPS,
  '场景': SCENE_GROUPS,
  '道具': PROP_GROUPS,
}

const props = defineProps<{
  modelValue: boolean
  images: Array<{ url: string }>
  loading?: boolean
  generating?: boolean
  generatingState?: string
  generatingPanel?: string
  assetType?: string
  initialSelectedUrls?: string[]
  initialPrimaryUrl?: string
  panelSections?: PanelSection[]
  panelProgress?: { current: number; total: number }
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  close: []
  generate: [linked: boolean]
  'generate-state': [label: string, prompt: string, linked: boolean]
  'generate-panel': [label: string, fullPrompt: string, linked: boolean]
  'generate-all-panels': [linked: boolean]
  'generate-full-sheet': [linked: boolean]
  select: [primary: string, selected: string[]]
  'delete-image': [url: string]
}>()

const visible = ref(props.modelValue)
const selectedUrls = reactive(new Set<string>())
const primaryUrl = ref('')
const linkedMode = ref(true)
const previewUrl = ref('')
const selectedPanelIdx = ref(0)

const stateGroups = computed(() => TYPE_GROUP_MAP[props.assetType || ''] || [])

watch(() => props.modelValue, val => {
  visible.value = val
  if (val) {
    selectedUrls.clear()
    selectedPanelIdx.value = 0
    if (props.initialSelectedUrls?.length) {
      props.initialSelectedUrls.forEach(u => selectedUrls.add(u))
    } else if (props.initialPrimaryUrl) {
      selectedUrls.add(props.initialPrimaryUrl)
    }
    primaryUrl.value = props.initialPrimaryUrl || props.initialSelectedUrls?.[0] || ''
  }
})

watch(visible, val => emit('update:modelValue', val))

// Clean up selectedUrls when images are deleted
watch(() => props.images, (newImages) => {
  const validUrls = new Set(newImages.map(img => img.url))
  for (const url of [...selectedUrls]) {
    if (!validUrls.has(url)) selectedUrls.delete(url)
  }
  if (!validUrls.has(primaryUrl.value)) {
    primaryUrl.value = [...selectedUrls][0] || ''
  }
}, { deep: true })

// Auto-select newly generated image
watch(() => props.images.length, (newLen, oldLen) => {
  if (newLen > oldLen) {
    const newImg = props.images[newLen - 1]
    if (newImg) {
      selectedUrls.add(newImg.url)
      if (!primaryUrl.value) primaryUrl.value = newImg.url
    }
  }
})

function toggleSelect(url: string) {
  if (selectedUrls.has(url)) {
    selectedUrls.delete(url)
    if (primaryUrl.value === url) {
      primaryUrl.value = [...selectedUrls][0] || ''
    }
  } else {
    selectedUrls.add(url)
    if (!primaryUrl.value) primaryUrl.value = url
  }
}

function setPrimary(url: string) {
  primaryUrl.value = url
  selectedUrls.add(url)
}

function handleConfirm() {
  const selected = [...selectedUrls]
  const primary = primaryUrl.value || selected[0] || ''
  emit('select', primary, selected)
  visible.value = false
}

function handleClose() {
  visible.value = false
  emit('close')
}
</script>

<style scoped>
.panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f4ff;
  border-radius: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.panel-select {
  flex: 1;
  min-width: 160px;
  max-width: 280px;
  padding: 5px 10px;
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  font-size: 13px;
  color: #3730a3;
  background: white;
  outline: none;
  cursor: pointer;
}
.panel-select:focus { border-color: #6366f1; }

.generate-panel-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid #6366f1;
  background: #6366f1;
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.generate-panel-btn:hover:not(:disabled) { background: #4f46e5; }
.generate-panel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.generate-panel-btn.loading { background: #4f46e5; }

.generate-all-panels-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid #4f46e5;
  background: #4f46e5;
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.generate-all-panels-btn:hover:not(:disabled) { background: #3730a3; }
.generate-all-panels-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.generate-full-sheet-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid #0891b2;
  background: #0891b2;
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.generate-full-sheet-btn:hover:not(:disabled) { background: #0e7490; }
.generate-full-sheet-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.picker-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-count {
  font-size: 13px;
  color: #6366f1;
  font-weight: 500;
}

.ref-ready {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #22c55e;
  font-weight: 500;
  background: #f0fdf4;
  padding: 2px 8px;
  border-radius: 10px;
}

.picker-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #eee;
}

.action-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}

.state-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  background: white;
  font-size: 12px;
  color: #444;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.state-btn:hover:not(:disabled) { border-color: #6366f1; color: #6366f1; background: #f5f3ff; }
.state-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.state-btn.loading { border-color: #6366f1; color: #6366f1; background: #f5f3ff; }

.generate-more-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #6366f1;
  background: #f5f3ff;
  font-size: 12px;
  color: #6366f1;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
  white-space: nowrap;
}

.generate-more-btn:hover:not(:disabled) { background: #ede9fe; }
.generate-more-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.linked-mode-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: white;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.linked-mode-btn.linked {
  border-color: #22c55e;
  color: #16a34a;
  background: #f0fdf4;
}
.linked-mode-btn:hover { opacity: 0.8; }

.mini-spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid rgba(99,102,241,0.3);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

.image-picker { min-height: 200px; }

.images-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.image-item {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 2px solid transparent;
  transition: border-color 0.2s, transform 0.15s;
}

.image-item:hover { transform: scale(1.02); }
.image-item.selected { border-color: #6366f1; }
.image-item.primary { border-color: #f59e0b; }

.image-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

.select-indicator { position: absolute; top: 6px; left: 6px; }

.checkbox {
  width: 18px; height: 18px;
  border-radius: 4px;
  border: 2px solid rgba(255,255,255,0.8);
  background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.checkbox.checked { background: #6366f1; border-color: #6366f1; }

.primary-badge {
  position: absolute; top: 6px; right: 28px;
  background: #f59e0b; color: white;
  font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600;
}

.image-actions {
  position: absolute; top: 4px; right: 4px;
  display: flex; flex-direction: column; gap: 3px;
  opacity: 0; transition: opacity 0.2s;
}
.image-item:hover .image-actions { opacity: 1; }

.set-primary-btn, .del-btn {
  width: 22px; height: 22px; border-radius: 4px; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
  background: rgba(0,0,0,0.5); color: rgba(255,255,255,0.8);
}
.set-primary-btn:hover, .set-primary-btn.active { background: #f59e0b; color: white; }
.del-btn:hover { background: #ef4444; color: white; }

.empty-images { padding: 40px 0; }

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  animation: fade-in 0.15s ease;
}

@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }

.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  cursor: default;
  animation: scale-in 0.15s ease;
}

@keyframes scale-in { from { transform: scale(0.92) } to { transform: scale(1) } }

.lightbox-close {
  position: fixed;
  top: 20px;
  right: 24px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.15);
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.lightbox-close:hover { background: rgba(255,255,255,0.3); }
</style>
