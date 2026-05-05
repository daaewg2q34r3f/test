<template>
  <div class="settings-page">
    <header class="settings-header">
      <el-button icon="ArrowLeft" @click="router.back()">返回</el-button>
      <h2>API 配置</h2>
    </header>

    <div class="settings-content" v-loading="loading">

      <!-- 语言模型 -->
      <el-card class="settings-card">
        <template #header><span class="card-title">🤖 语言模型</span></template>

        <el-form label-width="100px">
          <el-form-item label="厂商">
            <el-select v-model="lang.manufacturer" style="width:100%">
              <el-option label="OpenAI / 兼容接口（Kimi、DeepSeek 等）" value="openai" />
              <el-option label="Anthropic" value="anthropic" />
              <el-option label="智谱AI" value="智谱AI" />
            </el-select>
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="lang.apiKey" type="password" show-password placeholder="请输入 API Key" />
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input v-model="lang.baseURL" placeholder="如 https://api.moonshot.cn/v1，OpenAI 可留空" />
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input v-model="lang.model" placeholder="如 kimi-k2-turbo-preview" />
          </el-form-item>
          <el-form-item label=" ">
            <el-button type="primary" :loading="testingLang" @click="handleTestLang">
              {{ testingLang ? '检测中...' : '检测并保存' }}
            </el-button>
            <el-tag v-if="langResult === 'ok'" type="success" style="margin-left:10px">✅ 连接成功</el-tag>
            <el-tag v-else-if="langResult === 'fail'" type="danger" style="margin-left:10px">❌ 连接失败</el-tag>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 图像模型 -->
      <el-card class="settings-card">
        <template #header><span class="card-title">🎨 图像模型</span></template>

        <el-form label-width="100px">
          <el-form-item label="厂商">
            <el-select v-model="image.manufacturer" style="width:100%">
              <el-option label="硅基流动 (SiliconFlow)" value="siliconflow" />
              <el-option label="BasicRouter" value="basicrouter" />
              <el-option label="OpenAI / DALL-E" value="openai" />
              <el-option label="Stability AI" value="stability" />
              <el-option label="火山引擎" value="volcengine" />
            </el-select>
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="image.apiKey" type="password" show-password placeholder="请输入 API Key" />
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input v-model="image.baseURL" placeholder="如 https://api.siliconflow.cn/v1" />
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input v-model="image.model" placeholder="如 black-forest-labs/FLUX.1-schnell" />
          </el-form-item>
          <el-form-item label=" ">
            <el-button type="primary" :loading="testingImage" @click="handleTestImage">
              {{ testingImage ? '检测中...' : '检测并保存' }}
            </el-button>
            <el-tag v-if="imageResult === 'ok'" type="success" style="margin-left:10px">✅ 连接成功</el-tag>
            <el-tag v-else-if="imageResult === 'fail'" type="danger" style="margin-left:10px">❌ 连接失败</el-tag>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 视频生成 -->
      <el-card class="settings-card">
        <template #header>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span class="card-title">🎬 视频生成</span>
            <el-button type="primary" size="small" icon="Plus" @click="addVideoConfig">添加</el-button>
          </div>
        </template>

        <el-form label-width="100px">
          <div v-for="(vc, idx) in videoConfigs" :key="idx" class="video-config-item">
            <div class="vc-header">
              <span>配置 {{ idx + 1 }}</span>
              <el-button type="danger" text icon="Delete" @click="removeVideoConfig(idx)" />
            </div>
            <el-form-item label="厂商">
              <el-select v-model="vc.manufacturer" style="width:100%">
                <el-option label="火山引擎" value="volcengine" />
                <el-option label="BasicRouter" value="basicrouter" />
                <el-option label="RunningHub" value="runninghub" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
            <el-form-item label="名称"><el-input v-model="vc.name" placeholder="配置名称" /></el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="vc.apiKey" type="password" show-password placeholder="API Key" />
            </el-form-item>
            <el-form-item label="Base URL"><el-input v-model="vc.baseUrl" placeholder="接口地址" /></el-form-item>
            <el-form-item label="模型"><el-input v-model="vc.model" placeholder="模型名称" /></el-form-item>
          </div>
          <el-empty v-if="videoConfigs.length === 0" description="暂无视频配置" :image-size="60" />
          <el-form-item v-if="videoConfigs.length > 0" label=" ">
            <el-button type="primary" :loading="savingVideo" @click="handleSaveVideo">保存视频配置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getSetting, testAI, testImage, updateSetting } from '@/api/setting'
import type { VideoConfig } from '@/api/setting'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const loading    = ref(false)
const testingLang  = ref(false)
const testingImage = ref(false)
const savingVideo  = ref(false)
const langResult   = ref<'ok' | 'fail' | ''>('')
const imageResult  = ref<'ok' | 'fail' | ''>('')

const lang = reactive({ manufacturer: 'openai', apiKey: '', baseURL: '', model: '' })
const image = reactive({ manufacturer: 'siliconflow', apiKey: '', baseURL: '', model: '' })
const videoConfigs = ref<VideoConfig[]>([])

const userId = () => userStore.userInfo?.id ?? 1

async function loadSettings() {
  loading.value = true
  try {
    const res = await getSetting(userId()) as any
    const raw = Array.isArray(res.data) ? res.data[0] : res.data
    if (!raw) return

    if (raw.languageModel?.apiKey) {
      Object.assign(lang, {
        manufacturer: raw.languageModel.manufacturer || 'openai',
        apiKey:       raw.languageModel.apiKey || '',
        baseURL:      raw.languageModel.baseURL || '',
        model:        raw.languageModel.model || ''
      })
    }
    if (raw.imageModel?.apiKey) {
      Object.assign(image, {
        manufacturer: raw.imageModel.manufacturer || 'siliconflow',
        apiKey:       raw.imageModel.apiKey || '',
        baseURL:      raw.imageModel.baseURL || '',
        model:        raw.imageModel.model || ''
      })
    }
    videoConfigs.value = raw.videoModel || []
  } finally {
    loading.value = false
  }
}

async function handleTestLang() {
  if (!lang.apiKey || !lang.model) { ElMessage.warning('请填写 API Key 和模型名称'); return }
  testingLang.value = true
  langResult.value = ''
  try {
    const res = await testAI({
      modelName: lang.model,
      apiKey:    lang.apiKey,
      baseURL:   lang.baseURL || undefined,
      manufacturer: lang.manufacturer
    }) as any
    langResult.value = 'ok'
    ElMessage.success(`语言模型连接成功：${res.data || ''}`)
  } catch (e: any) {
    langResult.value = 'fail'
    ElMessage.error(`连接失败：${e?.message || '未知错误'}`)
  } finally {
    testingLang.value = false
  }
}

async function handleTestImage() {
  if (!image.apiKey) { ElMessage.warning('请填写 API Key'); return }
  testingImage.value = true
  imageResult.value = ''
  try {
    await testImage({
      modelName:    image.model || undefined,
      apiKey:       image.apiKey,
      baseURL:      image.baseURL || undefined,
      manufacturer: image.manufacturer
    })
    imageResult.value = 'ok'
    ElMessage.success('图像模型连接成功')
  } catch (e: any) {
    imageResult.value = 'fail'
    ElMessage.error(`连接失败：${e?.message || '未知错误'}`)
  } finally {
    testingImage.value = false
  }
}

async function handleSaveVideo() {
  savingVideo.value = true
  try {
    await updateSetting(userId(), { videoModel: videoConfigs.value })
    ElMessage.success('视频配置已保存')
  } finally {
    savingVideo.value = false
  }
}

function addVideoConfig() {
  videoConfigs.value.push({ name: '', model: '', apiKey: '', baseUrl: '', manufacturer: 'volcengine' })
}
function removeVideoConfig(idx: number) {
  videoConfigs.value.splice(idx, 1)
}

onMounted(loadSettings)
</script>

<style scoped>
.settings-page { min-height: 100vh; background: #f0f2f5; }

.settings-header {
  background: white; padding: 0 24px; height: 64px;
  display: flex; align-items: center; gap: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  position: sticky; top: 0; z-index: 100;
}
.settings-header h2 { font-size: 18px; font-weight: 600; }

.settings-content { max-width: 700px; margin: 32px auto; padding: 0 24px; }
.settings-card { margin-bottom: 20px; }
.card-title { font-size: 15px; font-weight: 600; }

.video-config-item {
  border: 1px solid #e8e8e8; border-radius: 8px;
  padding: 16px; margin-bottom: 12px;
}
.vc-header {
  display: flex; justify-content: space-between;
  align-items: center; margin-bottom: 12px; font-weight: 500;
}
</style>
