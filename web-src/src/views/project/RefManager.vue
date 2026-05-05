<template>
  <div class="ref-manager">
    <!-- Header -->
    <div class="rm-header">
      <button class="rm-back" @click="router.push(`/project/${projectId}/creation/stage4`)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        返回资产
      </button>
      <h2 class="rm-title">参考图管理</h2>
      <span class="rm-subtitle">管理角色、场景、道具及分镜图片</span>
    </div>

    <!-- Category tabs -->
    <div class="rm-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="rm-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="rm-tab-count">{{ (grouped[tab.key] || []).length }}</span>
      </button>
    </div>

    <!-- Content -->
    <div class="rm-body" v-loading="loading">
      <div v-if="!loading && !currentAssets.length" class="rm-empty">
        <el-empty :description="`暂无${TABS.find(t=>t.key===activeTab)?.label}资产`" />
      </div>

      <div class="rm-grid" v-else>
        <div class="rm-asset-card" v-for="asset in currentAssets" :key="asset.id">
          <!-- Asset header -->
          <div class="rm-asset-head">
            <div class="rm-asset-info">
              <span class="rm-asset-name">{{ asset.name }}</span>
              <el-tag size="small" :type="typeTagColor(asset.type)" class="rm-type-tag">{{ asset.type }}</el-tag>
              <span v-if="asset.type === '分镜'" class="rm-storyboard-label">
                S{{ asset.segmentId }}-{{ String(asset.shotIndex).padStart(2, '0') }}
              </span>
            </div>
            <el-button size="small" @click="openUpload(asset)">+ 上传图片</el-button>
          </div>

          <!-- Images -->
          <div class="rm-images" v-if="asset.images.length">
            <div
              class="rm-img-item"
              v-for="img in asset.images"
              :key="img.path"
              :class="{ cover: img.isCover }"
            >
              <img :src="img.url" @click="previewUrl = img.url" />
              <div class="rm-img-cover-badge" v-if="img.isCover">封面</div>
              <div class="rm-img-actions">
                <button
                  v-if="!img.isCover && asset.type !== '分镜'"
                  class="rm-img-btn"
                  title="设为封面"
                  @click="setCover(asset, img)"
                >封</button>
                <button
                  class="rm-img-btn danger"
                  title="删除"
                  @click="deleteImage(asset, img)"
                >×</button>
              </div>
            </div>
          </div>
          <div v-else class="rm-no-images">暂无图片</div>
        </div>
      </div>
    </div>

    <!-- Upload dialog -->
    <el-dialog v-model="uploadVisible" title="上传参考图" width="440px" destroy-on-close>
      <div v-if="uploadTarget" class="upload-area">
        <p class="upload-hint">为「{{ uploadTarget.name }}」上传新参考图，将加入该资产的参考图库。</p>
        <el-upload
          class="upload-dragger"
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept="image/*"
          @change="onFileChange"
        >
          <div class="upload-icon">+</div>
          <div class="upload-text">拖拽或点击选择图片</div>
        </el-upload>
        <div v-if="uploadPreview" class="upload-preview">
          <img :src="uploadPreview" />
        </div>
      </div>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" :disabled="!uploadPreview" @click="doUpload">上传</el-button>
      </template>
    </el-dialog>

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="previewUrl" class="rm-lightbox" @click="previewUrl = ''">
        <img :src="previewUrl" @click.stop />
        <button @click="previewUrl = ''">✕</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllAssetsForManager, saveAssets } from '@/api/assets'
import { removeAssetRefImage } from '@/api/storyboard'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(route.params.id as string))

const TABS = [
  { key: '角色', label: '角色' },
  { key: '场景', label: '场景' },
  { key: '道具', label: '道具' },
  { key: '分镜', label: '分镜图片' },
]

interface AssetImage { path: string; url: string; isCover: boolean }
interface Asset {
  id: number
  name: string
  type: string
  intro: string
  prompt: string
  coverUrl: string
  scriptId: number | null
  segmentId: number | null
  shotIndex: number | null
  images: AssetImage[]
}

const loading = ref(false)
const grouped = ref<Record<string, Asset[]>>({})
const activeTab = ref('角色')
const previewUrl = ref('')

const uploadVisible = ref(false)
const uploadTarget = ref<Asset | null>(null)
const uploadPreview = ref('')
const uploadBase64 = ref('')
const uploading = ref(false)

const currentAssets = computed(() => grouped.value[activeTab.value] || [])

function typeTagColor(type: string) {
  return { '角色': 'primary', '场景': 'success', '道具': 'warning', '分镜': 'info' }[type] ?? ''
}

async function loadData() {
  loading.value = true
  try {
    const res = await getAllAssetsForManager(projectId.value) as any
    grouped.value = res.data || {}
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function openUpload(asset: Asset) {
  uploadTarget.value = asset
  uploadPreview.value = ''
  uploadBase64.value = ''
  uploadVisible.value = true
}

function onFileChange(file: any) {
  const f = file.raw as File
  if (!f) return
  const reader = new FileReader()
  reader.onload = (e) => {
    uploadBase64.value = e.target?.result as string
    uploadPreview.value = e.target?.result as string
  }
  reader.readAsDataURL(f)
}

async function doUpload() {
  const asset = uploadTarget.value
  if (!asset || !uploadBase64.value) return
  uploading.value = true
  try {
    // saveAssets with base64 uploads the image and sets it as cover
    // For reference images, we want to add to selectedImages, not replace cover
    // Strategy: upload via saveAssets (saves file), then update selectedImages to include new path
    // First save as new cover to get the path
    await saveAssets({
      id: asset.id,
      projectId: projectId.value,
      base64: uploadBase64.value,
    })
    // Reload to get the new filePath
    const fresh = await getAllAssetsForManager(projectId.value) as any
    const freshGrouped = fresh.data || {}
    const freshAsset = (freshGrouped[asset.type] || []).find((a: Asset) => a.id === asset.id)
    if (freshAsset) {
      // Add the new image to selectedImages too (so it appears in reference pool)
      const existingPaths = freshAsset.images
        .filter((img: AssetImage) => !img.isCover)
        .map((img: AssetImage) => img.path)
      const allPaths = [...new Set([...existingPaths, freshAsset.images.find((i: AssetImage) => i.isCover)?.path].filter(Boolean))]
      await saveAssets({
        id: asset.id,
        projectId: projectId.value,
        selectedImages: JSON.stringify(allPaths),
      })
    }
    ElMessage.success('上传成功')
    uploadVisible.value = false
    await loadData()
  } catch {
    ElMessage.error('上传失败')
  } finally {
    uploading.value = false
  }
}

async function setCover(asset: Asset, img: AssetImage) {
  try {
    await saveAssets({ id: asset.id, projectId: projectId.value, filePath: img.url })
    ElMessage.success('已设为封面')
    await loadData()
  } catch { ElMessage.error('设置失败') }
}

async function deleteImage(asset: Asset, img: AssetImage) {
  await ElMessageBox.confirm('确认删除该参考图？', '删除确认', { type: 'warning' })
  try {
    if (img.isCover) {
      // Clear cover
      await saveAssets({ id: asset.id, projectId: projectId.value, filePath: null as any })
    }
    // Remove from selectedImages
    await removeAssetRefImage({ assetId: asset.id, rawPath: img.path })
    ElMessage.success('已删除')
    await loadData()
  } catch { ElMessage.error('删除失败') }
}

onMounted(loadData)
</script>

<style scoped>
.ref-manager {
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  overflow: hidden;
}

/* Header */
.rm-header {
  background: white;
  padding: 14px 24px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.rm-back {
  display: flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  font-size: 13px; color: #888; padding: 5px 10px;
  border-radius: 6px; font-family: inherit;
  transition: background 0.15s, color 0.15s;
}
.rm-back:hover { background: #f0f4ff; color: #6366f1; }
.rm-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0; }
.rm-subtitle { font-size: 12px; color: #aaa; }

/* Tabs */
.rm-tabs {
  background: white;
  padding: 0 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  gap: 0;
  flex-shrink: 0;
}
.rm-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 18px;
  background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 13px; color: #888; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.rm-tab:hover { color: #6366f1; }
.rm-tab.active { color: #6366f1; font-weight: 600; border-bottom-color: #6366f1; }
.rm-tab-count {
  background: #f0f0f0; color: #888; font-size: 10px;
  padding: 1px 6px; border-radius: 10px; font-weight: 500;
}
.rm-tab.active .rm-tab-count { background: #e0e7ff; color: #6366f1; }

/* Body */
.rm-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
.rm-empty { padding: 40px 0; }

/* Asset grid */
.rm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.rm-asset-card {
  background: white;
  border-radius: 10px;
  border: 1px solid #e8e8e8;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rm-asset-head {
  display: flex; align-items: center; justify-content: space-between;
}
.rm-asset-info {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.rm-asset-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
.rm-type-tag { flex-shrink: 0; }
.rm-storyboard-label {
  font-size: 11px; color: #6366f1; background: #e0e7ff;
  padding: 1px 6px; border-radius: 4px; font-weight: 500;
}

/* Images */
.rm-images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 6px;
}
.rm-img-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  background: #f0f0f0;
  cursor: zoom-in;
}
.rm-img-item.cover { border-color: #6366f1; }
.rm-img-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rm-img-cover-badge {
  position: absolute; bottom: 2px; left: 2px;
  background: #6366f1; color: white;
  font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px;
}
.rm-img-actions {
  position: absolute; top: 2px; right: 2px;
  display: flex; flex-direction: column; gap: 2px;
  opacity: 0; transition: opacity 0.15s;
}
.rm-img-item:hover .rm-img-actions { opacity: 1; }
.rm-img-btn {
  background: rgba(0,0,0,0.6); color: white;
  border: none; border-radius: 3px; font-size: 10px;
  padding: 2px 5px; cursor: pointer; font-family: inherit;
}
.rm-img-btn:hover { background: #6366f1; }
.rm-img-btn.danger:hover { background: #ef4444; }

.rm-no-images { font-size: 12px; color: #bbb; padding: 10px 0; }

/* Upload dialog */
.upload-area { display: flex; flex-direction: column; gap: 12px; }
.upload-hint { font-size: 13px; color: #555; margin: 0; }
.upload-dragger :deep(.el-upload-dragger) {
  padding: 20px; border-color: #d0d5dd;
}
.upload-icon { font-size: 28px; color: #6366f1; font-weight: 300; }
.upload-text { font-size: 13px; color: #888; margin-top: 6px; }
.upload-preview {
  text-align: center;
}
.upload-preview img {
  max-height: 180px; max-width: 100%;
  border-radius: 6px; border: 1px solid #e8e8e8;
}

/* Lightbox */
.rm-lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; cursor: zoom-out;
}
.rm-lightbox img {
  max-width: 90vw; max-height: 90vh;
  border-radius: 6px; object-fit: contain;
}
.rm-lightbox button {
  position: absolute; top: 20px; right: 24px;
  background: rgba(255,255,255,0.15); border: none;
  color: white; font-size: 20px; cursor: pointer;
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
</style>
