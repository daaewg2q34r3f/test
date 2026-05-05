<template>
  <div class="stage-page">
    <!-- Toolbar -->
    <div class="stage-toolbar">
      <h2 class="stage-title">项目资产库</h2>
      <div class="toolbar-actions">
        <span class="progress-stat" v-if="assets.length > 0">
          已生成图片 {{ generatedCount }} / {{ assets.length }}
        </span>
        <el-button :loading="extracting" @click="extractAssets">从大纲提取</el-button>
        <el-button :loading="batchPolishing" @click="batchPolishPrompts">批量优化提示词</el-button>
        <el-button :loading="generatingAll" @click="generateAllImages">生成全部图片</el-button>
        <el-button @click="showAddDialog = true">手动添加</el-button>
<el-button type="primary" :disabled="assets.length === 0" @click="completeStage">
          完成，进入分镜制作
        </el-button>
      </div>
    </div>

    <!-- Art Style Lock Bar -->
    <div class="art-style-bar">
      <span class="art-style-label">画风锁定</span>
      <div class="art-style-presets">
        <button
          v-for="preset in ART_STYLE_PRESETS"
          :key="preset"
          class="preset-btn"
          :class="{ active: currentArtStyle === preset }"
          @click="setArtStyle(preset)"
        >{{ preset }}</button>
        <div class="custom-style-wrap" v-if="showCustomInput">
          <input
            v-model="customStyleInput"
            class="custom-style-input"
            placeholder="自定义画风..."
            @keydown.enter="applyCustomStyle"
            @blur="applyCustomStyle"
            ref="customInputRef"
          />
        </div>
        <button
          class="preset-btn"
          :class="{ active: isCustomStyle }"
          @click="toggleCustomInput"
        >自定义</button>
      </div>
      <span class="art-style-current" v-if="currentArtStyle">当前：{{ currentArtStyle }}</span>
    </div>

    <!-- Tabs + Content -->
    <div class="stage-content" v-loading="loading">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="角色">
          <template #label><span>角色（{{ countByType('角色') }}）</span></template>
        </el-tab-pane>
        <el-tab-pane name="场景">
          <template #label><span>场景（{{ countByType('场景') }}）</span></template>
        </el-tab-pane>
        <el-tab-pane name="道具">
          <template #label><span>道具（{{ countByType('道具') }}）</span></template>
        </el-tab-pane>
      </el-tabs>

      <div v-if="filteredAssets.length === 0" class="empty-hint">
        <el-empty :description="`暂无${activeTab}，点击工具栏按钮提取或手动添加`" />
      </div>
      <div v-else class="assets-grid">
        <AssetCard
          v-for="asset in filteredAssets"
          :key="asset.id"
          :asset="asset"
          :generating="generatingImageId === asset.id"
          :polishing="polishingId === asset.id"
          :image-count="imageCountMap[asset.id] ?? null"
          :global-art-style="currentArtStyle"
          @generate-image="handleGenerateImage(asset)"
          @polish-prompt="handlePolishPrompt(asset)"
          @view-images="openImagePicker(asset)"
          @update-style="handleUpdateStyle"
          @save-prompt="handleSavePrompt"
          @delete="handleDelete(asset)"
        />
      </div>
    </div>

    <!-- Add Asset Dialog -->
    <el-dialog v-model="showAddDialog" title="添加资产" width="440px">
      <el-form :model="addForm" label-width="72px">
        <el-form-item label="类型">
          <el-select v-model="addForm.type" style="width: 100%">
            <el-option label="角色" value="角色" />
            <el-option label="场景" value="场景" />
            <el-option label="道具" value="道具" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="addForm.name" placeholder="输入名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="addForm.intro" type="textarea" :rows="3" placeholder="人物 / 场景 / 道具描述" />
        </el-form-item>
        <el-form-item label="提示词">
          <el-input v-model="addForm.prompt" type="textarea" :rows="2" placeholder="图像生成提示词（可留空）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="handleAdd">确定</el-button>
      </template>
    </el-dialog>

    <!-- Image Picker -->
    <ImagePicker
      v-model="imagePickerVisible"
      :images="pickerImages"
      :generating="generatingPickerImage"
      :generating-state="generatingState"
      :generating-panel="generatingPanelLabel"
      :panel-progress="panelProgress"
      :asset-type="currentAssetForPicker?.type"
      :initial-selected-urls="pickerInitialSelected"
      :initial-primary-url="pickerInitialPrimary"
      :panel-sections="pickerPanelSections || undefined"
      @generate="generatePickerImage"
      @generate-state="generatePickerState"
      @generate-panel="generatePickerPanel"
      @generate-all-panels="generateAllPanels"
      @generate-full-sheet="generatePickerFullSheet"
      @select="handleSelectImages"
      @delete-image="handleDeleteImage"
      @close="imagePickerVisible = false"
    />

    <!-- 优化提示词工作台 -->
    <el-dialog
      v-model="polishDialogVisible"
      :title="`优化提示词 — ${polishDialogAsset?.name}`"
      width="780px"
      :close-on-click-modal="false"
    >
      <div class="polish-workspace">
        <!-- 左：剧本段落 -->
        <div class="workspace-left">
          <div class="workspace-section-title">
            剧本参考段落
            <span class="section-hint">AI 将基于以下内容优化提示词</span>
          </div>
          <div v-if="polishContextLoading" class="context-loading">
            <div class="mini-spinner-lg"></div>
            <span>搜索剧本中...</span>
          </div>
          <div v-else-if="polishContextExcerpts.length === 0" class="context-empty-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
            <p>剧本中未找到相关段落</p>
            <p class="hint-sub">建议先完成剧本生成后再优化</p>
          </div>
          <div v-else class="context-list">
            <div v-for="(item, idx) in polishContextExcerpts" :key="idx" class="context-item">
              <div class="context-episode">{{ item.scriptName }}</div>
              <p class="context-excerpt">{{ item.excerpt }}</p>
            </div>
          </div>
        </div>

        <!-- 右：提示词预览/编辑 -->
        <div class="workspace-right">
          <div class="workspace-section-title">
            当前提示词
            <div class="mode-toggle">
              <button
                class="mode-btn"
                :class="{ active: !polishDialogEditMode }"
                @click="polishDialogEditMode = false"
              >预览</button>
              <button
                class="mode-btn"
                :class="{ active: polishDialogEditMode }"
                @click="polishDialogEditMode = true"
              >编辑</button>
            </div>
          </div>

          <!-- 预览模式：渲染 markdown -->
          <div
            v-if="!polishDialogEditMode"
            class="polish-preview"
            v-html="polishDialogPrompt ? renderMarkdown(polishDialogPrompt) : '<span class=\'preview-placeholder\'>点击 AI 基于剧情重新生成，或切换编辑模式手动输入</span>'"
          />

          <!-- 编辑模式：textarea -->
          <textarea
            v-else
            v-model="polishDialogPrompt"
            class="polish-prompt-textarea"
            placeholder="输入图像生成提示词..."
          />

          <button
            class="ai-regen-btn"
            :disabled="polishDialogGenerating"
            @click="runPolishFromDialog"
          >
            <span v-if="polishDialogGenerating" class="mini-spinner white"></span>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {{ polishDialogGenerating ? 'AI 生成中...' : 'AI 基于剧情重新生成' }}
          </button>
        </div>
      </div>

      <template #footer>
        <el-button @click="polishDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePolishDialog">保存提示词</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, nextTick } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getOutline } from '@/api/outline'
import { getSingleProject, updateProject } from '@/api/project'
import {
  getAssets, addAssets, generateAssetImage,
  polishPromptStream, getImage, saveAssets, delAssets, delImage, getAssetContext
} from '@/api/assets'
import AssetCard from '@/components/AssetCard.vue'
import ImagePicker from '@/components/ImagePicker.vue'
import { parseMultiPanelPrompt, type PanelSection } from '@/utils/parseMultiPanel'

const emit = defineEmits<{ stageComplete: [stage: number] }>()
const route = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(route.params.id as string))

const ART_STYLE_PRESETS = ['写实风格', '动漫风格', '水墨风格', '像素风格', '赛博朋克']


const dbTypeToApiType: Record<string, string> = {
  '角色': 'role',
  '场景': 'scene',
  '道具': 'props',
}

const assets = ref<any[]>([])
const loading = ref(false)
const extracting = ref(false)
const generatingAll = ref(false)
const batchPolishing = ref(false)
const generatingImageId = ref<number | null>(null)
const polishingId = ref<number | null>(null)
const activeTab = ref('角色')
const showAddDialog = ref(false)
const adding = ref(false)

// Image picker state
const imagePickerVisible = ref(false)
const pickerImages = ref<Array<{ url: string }>>([])
const pickerTempAssets = ref<Array<{ id: number; url: string }>>([])
const generatingPickerImage = ref(false)
const generatingState = ref('')
const generatingPanelLabel = ref('')
const panelProgress = ref({ current: 0, total: 0 })
const currentAssetForPicker = ref<any>(null)
const pickerPanelSections = ref<PanelSection[] | null>(null)

// 优化提示词工作台
const polishDialogVisible = ref(false)
const polishDialogAsset = ref<any>(null)
const polishDialogPrompt = ref('')
const polishContextLoading = ref(false)
const polishContextExcerpts = ref<Array<{ scriptName: string; excerpt: string }>>([])
const polishDialogGenerating = ref(false)
const polishDialogEditMode = ref(false) // false = markdown preview, true = textarea edit

// State prompts mapping (label → English prompt suffix for image gen)
const STATE_PROMPTS: Record<string, string> = {
  // Angles (character & prop)
  '正面': 'front view, facing forward, full body',
  '侧面': 'side view, profile shot, full body',
  '3/4角': 'three-quarter view, 3/4 angle, full body',
  '背面': 'back view, from behind, full body',
  '俯视': 'top-down view, overhead shot',
  // Scene shots
  '全景': 'wide shot, full scene view, establishing shot',
  '中景': 'medium shot, mid-range view',
  // Character emotions
  '正常': 'neutral expression, calm, standard state',
  '愤怒': 'angry expression, furious, intense eyes, rage',
  '悲伤': 'sad expression, sorrowful, tearful, downcast eyes',
  '惊恐': 'frightened expression, terror, wide eyes, panic',
  '喜悦': 'joyful expression, happy smile, bright eyes, cheerful',
  '受伤': 'injured, wounded, disheveled, exhausted, hurt',
  // Scene atmospheres
  '白天': 'daytime, bright natural lighting, clear sky, warm sunlight',
  '深夜': 'night time, dark atmosphere, dim lighting, moonlight shadows',
  '黄昏': 'dusk, golden hour, sunset orange light, long shadows',
  '雨天': 'rainy weather, wet surfaces, gray overcast sky, gloomy foggy',
  '紧张': 'tense dramatic atmosphere, high contrast lighting, ominous mood',
  '温馨': 'warm cozy atmosphere, soft golden lighting, comfortable peaceful mood',
  // Prop states
  '标准': 'clean standard view, clear product display',
  '使用中': 'being held and used, action shot, in operation',
  '特写': 'extreme close-up, macro detail shot, texture visible',
  '陈旧': 'worn aged appearance, weathered, scratched, battered',
}
const pickerInitialSelected = ref<string[]>([])
const pickerInitialPrimary = ref('')
const imageCountMap = ref<Record<number, number>>({})

// Art style
const currentArtStyle = ref('')
const showCustomInput = ref(false)
const customStyleInput = ref('')
const customInputRef = ref<HTMLInputElement | null>(null)
const isCustomStyle = computed(() =>
  !ART_STYLE_PRESETS.includes(currentArtStyle.value) && currentArtStyle.value !== ''
)

const addForm = reactive({ type: '角色', name: '', intro: '', prompt: '' })

const filteredAssets = computed(() =>
  assets.value.filter(a => a.type === activeTab.value)
)

const generatedCount = computed(() =>
  assets.value.filter(a => a.imageUrl).length
)

function countByType(type: string) {
  return assets.value.filter(a => a.type === type).length
}

function getOutlineItems(parsed: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(parsed?.[key])) return parsed[key]
  }
  return []
}

function stringifyOutlineValue(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) return value.map(stringifyOutlineValue).filter(Boolean).join('、')
  if (typeof value === 'object') {
    const preferred = value.name ?? value.title ?? value.label ?? value.value ?? value.description ?? value.desc
    if (preferred !== undefined && preferred !== value) {
      const text = stringifyOutlineValue(preferred)
      if (text) return text
    }
    return Object.values(value).map(stringifyOutlineValue).filter(Boolean).join('、')
  }
  return ''
}

function buildAssetFromOutline(raw: any, type: string) {
  const name = stringifyOutlineValue(raw?.name ?? raw?.title ?? raw?.label)
  const intro = stringifyOutlineValue(raw?.description ?? raw?.desc ?? raw?.intro ?? raw?.prompt)
  if (!name) return null
  return {
    name,
    intro,
    type,
    prompt: stringifyOutlineValue(raw?.prompt) || intro,
  }
}

function normalizeAsset(raw: any) {
  return {
    ...raw,
    imageUrl: raw.filePath || '',
    description: raw.intro || '',
    selectedImages: raw.selectedImages
      ? JSON.parse(raw.selectedImages)
      : (raw.filePath ? [raw.filePath] : []),
  }
}

async function loadProjectInfo() {
  try {
    const res = await getSingleProject(projectId.value) as any
    currentArtStyle.value = res.data?.artStyle || ''
  } catch { /**/ }
}

async function setArtStyle(style: string) {
  if (currentArtStyle.value === style) return
  currentArtStyle.value = style
  showCustomInput.value = false
  try {
    await updateProject({ id: projectId.value, artStyle: style })
    ElMessage.success('画风已锁定：' + style)
  } catch {
    ElMessage.error('更新画风失败')
  }
}

function toggleCustomInput() {
  showCustomInput.value = !showCustomInput.value
  if (showCustomInput.value) {
    customStyleInput.value = isCustomStyle.value ? currentArtStyle.value : ''
    nextTick(() => customInputRef.value?.focus())
  }
}

async function applyCustomStyle() {
  const val = customStyleInput.value.trim()
  if (!val) { showCustomInput.value = false; return }
  await setArtStyle(val)
  showCustomInput.value = false
}

async function loadAssets() {
  loading.value = true
  try {
    const types = ['角色', '场景', '道具']
    const results = await Promise.all(types.map(t => getAssets(projectId.value, t) as Promise<any>))
    assets.value = results.flatMap(res => (res.data || []).map(normalizeAsset))
  } finally {
    loading.value = false
  }
}

async function extractAssets() {
  extracting.value = true
  try {
    const res = await getOutline(projectId.value) as any
    const outlines: any[] = res.data || []
    const existingNames = new Set(assets.value.map(a => a.name))
    let addedCount = 0

    for (const o of outlines) {
      let parsed: any = {}
      try { parsed = typeof o.data === 'string' ? JSON.parse(o.data) : (o.data || {}) } catch { /**/ }

      const addList: Array<{ name: string; intro: string; type: string; prompt: string }> = []
      ;(getOutlineItems(parsed, ['characters', 'roles']) || []).forEach((c: any) => {
        if (c.name && !existingNames.has(c.name)) {
          addList.push({ name: c.name, intro: c.description || '', type: '角色', prompt: c.description || '' })
          existingNames.add(c.name)
        }
      })
      ;(getOutlineItems(parsed, ['scenes', 'locations']) || []).forEach((s: any) => {
        if (s.name && !existingNames.has(s.name)) {
          addList.push({ name: s.name, intro: s.description || '', type: '场景', prompt: s.description || '' })
          existingNames.add(s.name)
        }
      })
      ;(getOutlineItems(parsed, ['props', 'tools', 'items', 'objects']) || []).forEach((p: any) => {
        if (p.name && !existingNames.has(p.name)) {
          addList.push({ name: p.name, intro: p.description || '', type: '道具', prompt: p.description || '' })
          existingNames.add(p.name)
        }
      })

      for (const item of addList) {
        const normalized = buildAssetFromOutline(item, item.type)
        if (!normalized) continue
        await addAssets({ projectId: projectId.value, ...normalized })
        addedCount++
      }
    }

    await loadAssets()
    if (addedCount > 0) ElMessage.success(`提取完成，新增 ${addedCount} 个资产`)
    else ElMessage.info('无新增资产（已全部存在）')
  } finally {
    extracting.value = false
  }
}

// Returns the URL of the newly generated image (for reference chaining in linked mode)
async function doGenerateImage(
  asset: any,
  promptSuffix = '',
  linked = true,
  fullPromptOverride?: string,
  seed?: number,
  referenceImageUrl?: string,
  isPanel = false,
): Promise<string | undefined> {
  const apiType = dbTypeToApiType[asset.type] || 'role'
  const basePrompt = asset.prompt || asset.description || asset.name
  const prompt = fullPromptOverride || (promptSuffix ? `${basePrompt}, ${promptSuffix}` : basePrompt)
  const artStyle = asset.artStyle || undefined

  const res = await generateAssetImage({
    id: asset.id, type: apiType, projectId: projectId.value,
    name: asset.name, prompt, artStyle, linked,
    seed: linked ? seed : undefined,
    referenceImageUrl: linked ? referenceImageUrl : undefined,
    isPanel,
  }) as any
  const generatedUrl: string | undefined = res.data?.path

  const imgRes = await getImage(asset.id) as any
  const tempAssets: any[] = imgRes.data?.tempAssets || []
  const validItems = getValidTempAssets(tempAssets)
  imageCountMap.value = { ...imageCountMap.value, [asset.id]: validItems.length }

  // Auto-save latest success as cover if no image yet
  if (!asset.imageUrl) {
    const latest = tempAssets.filter((t: any) => t.state === '生成成功').pop()
    if (latest?.filePath) {
      await saveAssets({ id: asset.id, projectId: projectId.value, filePath: latest.filePath })
      asset.imageUrl = latest.filePath
      asset.filePath = latest.filePath
    }
  }
  return generatedUrl
}

// Build picker image list: cover (t_assets.filePath) + t_image records, no duplicates
function getValidTempAssets(tempAssets: any[], coverUrl?: string): Array<{ id: number; url: string }> {
  const seen = new Set<string>()
  const items: Array<{ id: number; url: string }> = []
  // Prepend cover image first so it appears at the top
  if (coverUrl && !seen.has(coverUrl)) {
    seen.add(coverUrl)
    items.push({ id: -1, url: coverUrl }) // id=-1 means it's the cover (not in t_image)
  }
  tempAssets.forEach((t: any) => {
    if (t.filePath && !seen.has(t.filePath)) {
      seen.add(t.filePath)
      items.push({ id: t.id, url: t.filePath })
    }
  })
  return items
}

async function generateAllImages() {
  generatingAll.value = true
  const noImage = assets.value.filter(a => !a.imageUrl)
  for (const asset of noImage) {
    generatingImageId.value = asset.id
    try { await doGenerateImage(asset) } catch { /**/ }
  }
  generatingImageId.value = null
  generatingAll.value = false
  ElMessage.success('图片生成完成')
}

async function handleGenerateImage(asset: any) {
  generatingImageId.value = asset.id
  try {
    await doGenerateImage(asset)
    ElMessage.success('图片已生成')
  } finally {
    generatingImageId.value = null
  }
}

// Stream polishPrompt for one asset, returns the accumulated text
async function streamPolish(asset: any): Promise<string> {
  const apiType = dbTypeToApiType[asset.type] || 'role'
  const response = await polishPromptStream({
    assetsId: asset.id, projectId: projectId.value, type: apiType,
    name: asset.name, describe: asset.description || asset.prompt || asset.name,
  })
  if (!response.body) throw new Error('No response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = '', result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const d = JSON.parse(line.slice(6))
        if (d.type === 'chunk') result += d.text
        else if (d.type === 'error') throw new Error(d.text)
      } catch { /**/ }
    }
  }
  return result.trim()
}

async function batchPolishPrompts() {
  const targets = filteredAssets.value
  if (targets.length === 0) { ElMessage.info('当前标签下无资产'); return }
  batchPolishing.value = true
  let done = 0
  for (const asset of targets) {
    polishingId.value = asset.id
    try {
      const text = await streamPolish(asset)
      if (text) {
        asset.prompt = text
        done++
        await saveAssets({ id: asset.id, projectId: projectId.value, prompt: text })
      }
    } catch { /**/ }
  }
  polishingId.value = null
  batchPolishing.value = false
  ElMessage.success(`已优化并保存 ${done} 个提示词`)
}

async function handlePolishPrompt(asset: any) {
  // 打开优化工作台，同时异步加载剧本段落
  polishDialogAsset.value = asset
  polishDialogPrompt.value = asset.prompt || asset.description || ''
  polishDialogEditMode.value = false
  polishContextExcerpts.value = []
  polishDialogVisible.value = true
  polishContextLoading.value = true
  try {
    const res = await getAssetContext(projectId.value, asset.name) as any
    polishContextExcerpts.value = res.data || []
  } finally {
    polishContextLoading.value = false
  }
}

async function runPolishFromDialog() {
  const asset = polishDialogAsset.value
  if (!asset) return
  polishDialogGenerating.value = true
  polishingId.value = asset.id
  polishDialogPrompt.value = ''
  try {
    const apiType = dbTypeToApiType[asset.type] || 'role'
    const response = await polishPromptStream({
      assetsId: asset.id, projectId: projectId.value, type: apiType,
      name: asset.name, describe: asset.description || asset.prompt || asset.name,
    })
    if (!response.body) throw new Error('No response body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const d = JSON.parse(line.slice(6))
          if (d.type === 'chunk') polishDialogPrompt.value += d.text
          else if (d.type === 'error') ElMessage.error(d.text || 'AI 生成失败')
        } catch { /**/ }
      }
    }
  } catch {
    ElMessage.error('AI 生成失败')
  } finally {
    polishDialogGenerating.value = false
    polishingId.value = null
  }
}

async function savePolishDialog() {
  const asset = polishDialogAsset.value
  if (!asset) return
  const newPrompt = polishDialogPrompt.value.trim()
  asset.prompt = newPrompt
  polishDialogVisible.value = false
  try {
    await saveAssets({ id: asset.id, projectId: projectId.value, prompt: newPrompt })
    ElMessage.success('提示词已保存')
  } catch {
    ElMessage.error('保存失败')
  }
}

async function handleUpdateStyle(assetId: number, style: string) {
  const asset = assets.value.find(a => a.id === assetId)
  if (!asset) return
  asset.artStyle = style || null
  try {
    await saveAssets({ id: assetId, projectId: projectId.value, artStyle: style || null })
    ElMessage.success(style ? `已设置风格：${style}` : '已使用全局风格')
  } catch {
    ElMessage.error('保存风格失败')
  }
}

async function openImagePicker(asset: any) {
  currentAssetForPicker.value = asset
  pickerImages.value = []
  pickerTempAssets.value = []
  pickerPanelSections.value = parseMultiPanelPrompt(asset.prompt || '')
  imagePickerVisible.value = true

  // Pre-fill selection state
  pickerInitialSelected.value = asset.selectedImages || (asset.imageUrl ? [asset.imageUrl] : [])
  pickerInitialPrimary.value = asset.imageUrl || ''

  try {
    const res = await getImage(asset.id) as any
    const tempAssets: any[] = res.data?.tempAssets || []
    const coverUrl: string = res.data?.filePath || ''
    const items = getValidTempAssets(tempAssets, coverUrl)
    pickerTempAssets.value = items
    pickerImages.value = items.map(i => ({ url: i.url }))
    imageCountMap.value = { ...imageCountMap.value, [asset.id]: items.length }
  } catch {
    pickerImages.value = []
  }
}

async function generatePickerImage(linked: boolean) {
  const asset = currentAssetForPicker.value
  if (!asset) return
  generatingPickerImage.value = true
  try {
    await doGenerateImage(asset, '', linked)
    await refreshPickerImages(asset)
  } finally {
    generatingPickerImage.value = false
  }
}

async function generatePickerState(label: string, statePrompt: string, linked: boolean) {
  const asset = currentAssetForPicker.value
  if (!asset) return
  generatingState.value = label
  try {
    await doGenerateImage(asset, statePrompt, linked, undefined, undefined, undefined, true)
    await refreshPickerImages(asset)
  } finally {
    generatingState.value = ''
  }
}

async function generatePickerPanel(label: string, fullPrompt: string, linked: boolean) {
  const asset = currentAssetForPicker.value
  if (!asset) return
  generatingPanelLabel.value = label
  try {
    await doGenerateImage(asset, '', linked, fullPrompt, undefined, undefined, true)
    await refreshPickerImages(asset)
  } finally {
    generatingPanelLabel.value = ''
  }
}

async function generateAllPanels(linked: boolean) {
  const asset = currentAssetForPicker.value
  const panels = pickerPanelSections.value
  if (!asset || !panels || panels.length === 0) return

  // 关联模式：所有格共享同一 seed，减少角色差异
  const sharedSeed = linked ? Math.floor(Math.random() * 2147483647) : undefined
  let lastGeneratedUrl: string | undefined = undefined

  panelProgress.value = { current: 0, total: panels.length }
  generatingPanelLabel.value = '__all__'
  let successCount = 0

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    panelProgress.value = { current: i + 1, total: panels.length }
    generatingPanelLabel.value = panel.label
    try {
      // 关联模式：第2格起把上一张生成图作为参考图，提升角色一致性
      const ref = linked ? lastGeneratedUrl : undefined
      const url = await doGenerateImage(asset, '', linked, panel.fullPrompt, sharedSeed, ref, true)
      if (url) lastGeneratedUrl = url
      await refreshPickerImages(asset)
      successCount++
    } catch {
      // 单格失败 → 继续下一格
    }
  }

  generatingPanelLabel.value = ''
  panelProgress.value = { current: 0, total: 0 }
  ElMessage.success(`生成完成：${successCount}/${panels.length} 格成功`)
}

// 整版生成：直接用完整原始 prompt，生成一张含所有格的设定表图
async function generatePickerFullSheet(linked: boolean) {
  const asset = currentAssetForPicker.value
  if (!asset) return
  generatingPickerImage.value = true
  try {
    const referenceImageUrl = linked && asset.imageUrl ? asset.imageUrl : undefined
    const seed = linked ? Math.floor(Math.random() * 2147483647) : undefined
    // isPanel=true：绕过后端"四视图"模板，让用户在 prompt 里自己写的布局描述直接生效
    await doGenerateImage(asset, '', linked, asset.prompt || asset.description || asset.name, seed, referenceImageUrl, true)
    await refreshPickerImages(asset)
    ElMessage.success('整版设定表已生成')
  } catch (e: any) {
    ElMessage.error('生成失败：' + (e?.message || ''))
  } finally {
    generatingPickerImage.value = false
  }
}

async function refreshPickerImages(asset: any) {
  const res = await getImage(asset.id) as any
  const tempAssets: any[] = res.data?.tempAssets || []
  const coverUrl: string = res.data?.filePath || ''
  const items = getValidTempAssets(tempAssets, coverUrl)
  pickerTempAssets.value = items
  pickerImages.value = items.map(i => ({ url: i.url }))
  imageCountMap.value = { ...imageCountMap.value, [asset.id]: items.length }
}

async function handleSelectImages(primary: string, selected: string[]) {
  const asset = currentAssetForPicker.value
  if (!asset) return

  // Save cover image (primary)
  if (primary && primary !== asset.imageUrl) {
    await saveAssets({ id: asset.id, projectId: projectId.value, filePath: primary })
    asset.imageUrl = primary
    asset.filePath = primary
  }

  // Save selected images set
  const selectedJson = JSON.stringify(selected)
  await saveAssets({ id: asset.id, projectId: projectId.value, selectedImages: selectedJson })
  asset.selectedImages = selected

  ElMessage.success(`已选 ${selected.length} 张参考图`)
}

async function handleDeleteImage(url: string) {
  const ta = pickerTempAssets.value.find(t => t.url === url)
  if (!ta) return

  if (ta.id === -1) {
    // Cover image — clear t_assets.filePath (backend will move it back to t_image)
    const asset = currentAssetForPicker.value
    if (!asset) return
    await saveAssets({ id: asset.id, projectId: projectId.value, filePath: null })
    asset.imageUrl = ''
    asset.filePath = ''
    // Refresh picker so the image reappears as a t_image record
    await refreshPickerImages(asset)
  } else {
    // Regular t_image record
    await delImage(ta.id)
    pickerImages.value = pickerImages.value.filter(p => p.url !== url)
    pickerTempAssets.value = pickerTempAssets.value.filter(t => t.url !== url)
    const asset = currentAssetForPicker.value
    if (asset) imageCountMap.value = { ...imageCountMap.value, [asset.id]: pickerTempAssets.value.length }
  }
}

async function handleAdd() {
  adding.value = true
  try {
    await addAssets({ projectId: projectId.value, ...addForm })
    showAddDialog.value = false
    addForm.name = ''; addForm.intro = ''; addForm.prompt = ''
    await loadAssets()
    ElMessage.success('已添加')
  } finally {
    adding.value = false
  }
}

async function handleSavePrompt(assetId: number, newPrompt: string) {
  const asset = assets.value.find(a => a.id === assetId)
  if (!asset || asset.prompt === newPrompt) return
  asset.prompt = newPrompt
  try {
    await saveAssets({ id: assetId, projectId: projectId.value, prompt: newPrompt })
  } catch {
    ElMessage.error('保存提示词失败')
  }
}

async function handleDelete(asset: any) {
  await ElMessageBox.confirm(`确认删除"${asset.name}"？`, '删除确认', { type: 'warning' })
  await delAssets(asset.id)
  assets.value = assets.value.filter(a => a.id !== asset.id)
  ElMessage.success('已删除')
}

function completeStage() {
  emit('stageComplete', 4)
  router.push(`/project/${projectId.value}/creation/stage5`)
}

onMounted(async () => {
  await Promise.all([loadProjectInfo(), loadAssets()])
})
</script>

<style scoped>
.stage-page {
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f7f8fa;
}

.stage-toolbar {
  background: white;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.stage-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-stat {
  font-size: 13px;
  padding: 4px 10px;
  background: #f0f4ff;
  border-radius: 20px;
  color: #6366f1;
  font-weight: 500;
}

/* Art style bar */
.art-style-bar {
  background: white;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.art-style-label {
  font-size: 13px;
  color: #888;
  font-weight: 500;
  white-space: nowrap;
}

.art-style-presets {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-btn {
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid #e0e0e0;
  background: white;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.preset-btn:hover { border-color: #6366f1; color: #6366f1; }
.preset-btn.active { background: #6366f1; border-color: #6366f1; color: white; font-weight: 500; }

.custom-style-wrap { display: flex; align-items: center; }

.custom-style-input {
  padding: 4px 10px;
  border: 1px solid #6366f1;
  border-radius: 20px;
  font-size: 12px;
  outline: none;
  width: 120px;
  color: #333;
}

.art-style-current {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}

/* Content */
.stage-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.empty-hint {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

/* 优化提示词工作台 */
.polish-workspace {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  min-height: 360px;
}

.workspace-left,
.workspace-right {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}

.mode-toggle {
  display: flex;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}
.mode-btn {
  padding: 2px 10px;
  font-size: 11px;
  background: white;
  border: none;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}
.mode-btn.active { background: #6366f1; color: white; }
.mode-btn:hover:not(.active) { background: #f5f3ff; color: #6366f1; }

.polish-preview {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.7;
  color: #333;
  min-height: 0;
}
.polish-preview :deep(h1),.polish-preview :deep(h2),.polish-preview :deep(h3) {
  font-size: 13px; font-weight: 700; margin: 10px 0 4px; color: #222;
}
.polish-preview :deep(h4),.polish-preview :deep(h5) {
  font-size: 12px; font-weight: 600; margin: 8px 0 3px; color: #444;
}
.polish-preview :deep(p) { margin: 0 0 6px; }
.polish-preview :deep(ul),.polish-preview :deep(ol) { padding-left: 18px; margin: 4px 0; }
.polish-preview :deep(li) { margin: 2px 0; }
.polish-preview :deep(hr) { border: none; border-top: 1px solid #e0e0e0; margin: 8px 0; }
.polish-preview :deep(strong) { font-weight: 700; color: #222; }
.polish-preview :deep(blockquote) {
  border-left: 3px solid #6366f1; margin: 6px 0; padding: 4px 10px;
  background: #f5f3ff; border-radius: 0 4px 4px 0; color: #555;
}
.preview-placeholder { color: #bbb; font-size: 12px; }

.section-hint {
  font-size: 11px;
  color: #aaa;
  font-weight: 400;
}

/* 左侧剧本段落 */
.context-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 0;
  color: #888;
  font-size: 13px;
}

.mini-spinner-lg {
  width: 28px;
  height: 28px;
  border: 3px solid #e0e0e0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.context-empty-sm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 0;
  color: #bbb;
  font-size: 13px;
}

.hint-sub {
  font-size: 11px;
  color: #ccc;
}

.context-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 340px;
  padding-right: 2px;
}

.context-item {
  background: #f9f9fb;
  border-radius: 7px;
  padding: 10px 12px;
  border-left: 3px solid #6366f1;
  flex-shrink: 0;
}

.context-episode {
  font-size: 11px;
  font-weight: 600;
  color: #6366f1;
  margin-bottom: 5px;
}

.context-excerpt {
  font-size: 12px;
  color: #555;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 右侧提示词编辑 */
.polish-prompt-textarea {
  flex: 1;
  min-height: 240px;
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 7px;
  padding: 10px 12px;
  font-size: 13px;
  color: #333;
  line-height: 1.6;
  resize: none;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.polish-prompt-textarea:focus { border-color: #6366f1; }

.ai-regen-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 7px;
  border: none;
  background: #6366f1;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}

.ai-regen-btn:hover:not(:disabled) { background: #4f46e5; }
.ai-regen-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.mini-spinner.white {
  border-color: rgba(255,255,255,0.3);
  border-top-color: white;
}
</style>
