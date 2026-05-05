<template>
  <div class="stage-page">
    <div class="stage-toolbar">
      <h2 class="stage-title">视频合成</h2>
      <div class="toolbar-actions">
        <el-checkbox v-model="allowAiDurationAdjust" class="duration-toggle">
          AI自动调整时长
        </el-checkbox>
        <el-button icon="VideoPlay" @click="previewAll">逐段预览</el-button>
        <el-button icon="MagicStick" :loading="batchOptimizing" @click="batchOptimizePrompts">
          批量优化提示词
        </el-button>
        <el-button icon="VideoCamera" :loading="batchVideoGenerating" @click="batchGenerateVideos">
          {{ batchVideoGenerating ? `批量生成视频 ${batchVideoProgress}/${batchVideoTotal}` : '批量生成视频' }}
        </el-button>
        <el-button type="primary" icon="Film" :loading="merging" @click="mergeEpisode">
          合并导出完整视频
        </el-button>
      </div>
    </div>

    <div class="stage-body" v-loading="loading">
      <el-tabs v-model="activeEpisode" class="episode-tabs" @tab-change="loadEpisodeData">
        <el-tab-pane
          v-for="ep in episodes"
          :key="ep.scriptId"
          :label="`第${ep.episode}集`"
          :name="String(ep.scriptId)"
        />
      </el-tabs>

      <div class="shots-list">
        <div v-if="shots.length === 0" class="empty-hint">
          <el-empty description="请先完成分镜制作阶段" />
        </div>

        <div v-for="shot in shots" :key="shot.clipKey" class="shot-row">
          <div class="shot-thumb clip-thumb">
            <div class="clip-thumb__header">
              <div class="clip-thumb__title">{{ getClipName(shot) }}</div>
              <div class="clip-thumb__summary">{{ getClipSummary(shot) }}</div>
            </div>
            <div class="clip-thumb__grid">
              <div
                v-for="source in shot.sourceShots"
                :key="`${shot.clipKey}-${source.id}`"
                class="clip-thumb__item"
              >
                <img v-if="source.imageUrl" :src="source.imageUrl" alt="" />
                <div v-else class="no-thumb">
                  <el-icon><Film /></el-icon>
                </div>
                <span class="clip-thumb__tag">{{ `#${source.shotIndex || source.id}` }}</span>
              </div>
            </div>
          </div>

          <div class="shot-config">
            <div class="config-row">
              <el-form :model="shot.config" inline>
                <el-form-item label="动感类型">
                  <el-select v-model="shot.config.mode" style="width: 120px" @change="handleModeChange(shot)">
                    <el-option label="静态转动态" value="single" />
                    <el-option label="A->B 过渡" value="startEnd" />
                    <el-option label="多图混剪" value="multi" />
                  </el-select>
                </el-form-item>
                <el-form-item label="分辨率">
                  <el-select v-model="shot.config.resolution" style="width: 100px">
                    <el-option label="720p" value="720p" />
                    <el-option label="1080p" value="1080p" />
                  </el-select>
                </el-form-item>
                <el-form-item label="音频模式">
                  <el-select v-model="shot.config.audioMode" style="width: 120px">
                    <el-option label="自动" value="auto" />
                    <el-option label="对白优先" value="dialogue" />
                    <el-option label="旁白优先" value="narration" />
                    <el-option label="静音" value="silent" />
                  </el-select>
                </el-form-item>
                <el-form-item label="时长(秒)">
                  <el-slider
                    v-model="shot.config.duration"
                    :min="2"
                    :max="30"
                    style="width: 150px"
                    @change="handleDurationChange(shot)"
                  />
                  <span class="duration-text">{{ shot.config.duration }}s</span>
                </el-form-item>
              </el-form>
            </div>

            <el-input
              v-model="shot.config.prompt"
              type="textarea"
              :rows="2"
              placeholder="可继续修改视频提示词"
            />
            <div class="prompt-tip">AI 已自动生成，可修改</div>
            <div v-if="shot.promptStatus === 'generating'" class="prompt-tip">
              正在补生成该分镜的视频提示词...
            </div>
            <div v-if="shot.promptStatus === 'optimizing'" class="prompt-tip">
              正在优化该分镜的视频提示词...
            </div>

            <div class="mode-summary">
              <div class="mode-summary__title">{{ getModeLabel(shot.config.mode) }}</div>
              <div class="mode-summary__hint">{{ getModeHint(shot) }}</div>
              <div v-if="shot.nextClipFirstFrame?.imageUrl" class="continuity-ref">
                <img :src="shot.nextClipFirstFrame.imageUrl" class="continuity-ref__image" alt="" />
                <div class="continuity-ref__text">
                  <strong>连续性参考</strong>
                  <span>当前 clip 结尾会参考下一 clip 首帧 #{{ shot.nextClipFirstFrame.shotIndex || shot.nextClipFirstFrame.id }}</span>
                </div>
              </div>
              <div class="mode-refs">
                <div
                  v-for="(refItem, idx) in getVideoFrameRefs(shot)"
                  :key="`${shot.id}-${refItem.id}-${idx}`"
                  class="mode-ref"
                >
                  <img :src="refItem.filePath" class="mode-ref__image" alt="" />
                  <div class="mode-ref__meta">
                    <span class="mode-ref__tag">{{ getFrameRefLabel(shot, idx, getVideoFrameRefs(shot).length) }}</span>
                    <span class="mode-ref__id">#{{ refItem.id }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="shot-actions">
            <div class="video-status">
              <el-tag v-if="shot.videoStatus === 'done'" type="success">已完成</el-tag>
              <el-tag v-else-if="shot.videoStatus === 'generating'" type="warning">
                <el-icon class="is-loading"><Loading /></el-icon>
                生成中
              </el-tag>
              <el-tag v-else type="info">待生成</el-tag>
            </div>

            <video
              v-if="shot.videoUrl"
              :src="shot.videoUrl"
              controls
              class="video-preview"
            />

            <el-button
              type="primary"
              size="small"
              :loading="shot.videoStatus === 'generating'"
              @click="generateVideo(shot)"
            >
              {{ shot.videoUrl ? '重新生成' : '生成视频' }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="mergedVideoUrl" class="merged-result">
      <div class="merged-title">完整集数视频</div>
      <video :src="mergedVideoUrl" controls class="merged-video" />
      <el-button size="small" tag="a" :href="mergedVideoUrl" download>下载</el-button>
    </div>

    <el-dialog v-model="previewDialogVisible" title="全集预览" width="800px" fullscreen>
      <div class="preview-player">
        <video
          v-if="previewUrls.length > 0"
          ref="previewVideoRef"
          :src="previewUrls[currentPreviewIdx]"
          controls
          autoplay
          class="preview-video"
          @ended="playNext"
        />
        <div class="preview-controls">
          <span>{{ currentPreviewIdx + 1 }} / {{ previewUrls.length }}</span>
          <el-button @click="currentPreviewIdx = Math.max(0, currentPreviewIdx - 1)">上一个</el-button>
          <el-button @click="playNext">下一个</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getOutline } from '@/api/outline'
import { getSingleProject } from '@/api/project'
import { getScript } from '@/api/script'
import { generateVideoPrompt, getStoryboard, getVideoPromptTips } from '@/api/storyboard'
import {
  addVideoConfig,
  generateVideo as apiGenerateVideo,
  getVideo,
  getVideoConfigs,
  mergeVideos,
  updateVideoConfig,
} from '@/api/video'

const route = useRoute()
const projectId = computed(() => parseInt(route.params.id as string))

interface Episode {
  episode: number
  scriptId: number
}

interface ShotConfig {
  mode: string
  audioMode?: 'auto' | 'dialogue' | 'narration' | 'silent'
  duration: number
  durationSource?: 'stage5' | 'manual' | 'ai'
  prompt: string
  resolution: string
  configId?: number
  manufacturer?: string
}

interface ClipSourceShot {
  id: number
  segmentId?: number
  shotIndex?: number
  imageUrl?: string
  prompt?: string
  videoPrompt?: string
  duration?: number
}

interface Shot {
  id: number
  clipKey: string
  clipOrder: number
  segmentId?: number
  shotIndex?: number
  imageUrl?: string
  prompt?: string
  sourceShots: ClipSourceShot[]
  nextClipFirstFrame?: ClipSourceShot
  videoPrompt?: string
  lastAutoPrompt?: string
  videoUrl?: string
  videoLastFrame?: string
  videoStatus: 'pending' | 'generating' | 'done'
  promptStatus?: 'idle' | 'generating' | 'optimizing'
  config: ShotConfig
}

interface VideoFrameRef {
  id: number
  filePath: string
  prompt?: string
  role?: string
}

const episodes = ref<Episode[]>([])
const activeEpisode = ref('')
const shots = ref<Shot[]>([])
const loading = ref(false)
const previewDialogVisible = ref(false)
const previewUrls = ref<string[]>([])
const currentPreviewIdx = ref(0)
const previewVideoRef = ref<HTMLVideoElement>()
const merging = ref(false)
const mergedVideoUrl = ref('')
const promptGeneratingIds = ref(new Set<number>())
const batchOptimizing = ref(false)
const batchVideoGenerating = ref(false)
const batchVideoProgress = ref(0)
const batchVideoTotal = ref(0)
const allowAiDurationAdjust = ref(false)
const projectArtStyle = ref('')
const episodeVoiceStyleMap = ref<Record<string, string>>({})
const legacyVideoPromptForbiddenText = '禁止：闪烁、变形、卡顿、跳帧、低画质、模糊、噪点。'
const legacyVideoPromptForbiddenTextV2 = '【绝对禁止】：低画质、模糊、噪点、闪烁、人物变形、画面撕裂、水印、文字、logo。'
const legacyVideoPromptQualityText = '质量要求：电影感、动作自然、光影稳定、画面清晰。'
const legacyVideoPromptQualityTextV2 = '质量要求：电影级质感，动作连贯，光影自然，主体稳定。'
const legacyVideoPromptQualityTextV3 = '质量要求：电影级质感，动作自然连贯，风格统一，画面稳定。'
const videoPromptQualityText = '质量要求：以首帧和尾帧为准，保持角色、道具、场景和镜头运动一致。'
const videoPromptForbiddenText = '【绝对禁止】：闪烁、跳帧、人物变形、主体丢失、水印、logo、文字、低画质。'
const animeStyleWords = ['动漫', '动画', '二次元', '漫画', '卡通']
const animeForbiddenConflicts = ['动画风格', '卡通效果', '卡通化', '非真实感']
const heldPropKeywords = ['雨伞', '伞', '手机', '箱包', '包', '刀', '剑', '枪', '书', '书册', '杯子', '茶杯', '酒杯', '灯笼', '玉碟', '信封', '证件', '钥匙', '花束']
const heldPropActionMap: Record<string, string[]> = {
  雨伞: ['撑伞', '打伞', '举伞', '握伞', '持伞'],
  伞: ['撑伞', '打伞', '举伞', '握伞', '持伞'],
  手机: ['拿手机', '看手机', '举起手机', '接电话', '握手机'],
  箱包: ['提包', '拎包', '背包', '抓包'],
  包: ['提包', '拎包', '背包', '抓包'],
  刀: ['持刀', '握刀', '举刀'],
  剑: ['持剑', '握剑', '举剑'],
  枪: ['持枪', '握枪', '举枪', '指枪'],
  书: ['拿书', '捧书', '翻书', '举书'],
  书册: ['拿书册', '捧书册', '翻书册'],
  杯子: ['拿杯', '端杯', '举杯', '捧杯'],
  茶杯: ['拿茶杯', '端茶杯', '举茶杯'],
  酒杯: ['拿酒杯', '端酒杯', '举酒杯'],
  灯笼: ['提灯笼', '举灯笼', '拿灯笼'],
  玉碟: ['拿起玉碟', '握住玉碟', '递玉碟', '捧玉碟'],
  信封: ['拿信封', '递信封', '举信封'],
  证件: ['拿证件', '出示证件', '递证件'],
  钥匙: ['拿钥匙', '举钥匙', '握钥匙'],
  花束: ['拿花束', '捧花束', '递花束'],
}

function isAnimeProjectStyle() {
  return animeStyleWords.some(word => projectArtStyle.value.includes(word))
}

function filterForbiddenTextForStyle(text: string) {
  if (!isAnimeProjectStyle()) return text
  return animeForbiddenConflicts.reduce((result, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return result.replace(new RegExp(`,?\\s*${escaped}`, 'g'), '')
  }, text).replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '')
}

function getVideoPromptForbiddenText() {
  return filterForbiddenTextForStyle(`${videoPromptForbiddenText} 禁止手部与关键手持道具分离，禁止手持道具悬浮、滞留原地、漂移、复制、穿模或与角色动作不同步。`)
}

function extractHeldPropsFromText(text: string) {
  return heldPropKeywords.filter(keyword => text.includes(keyword))
}

function extractHeldPropActions(text: string, prop: string) {
  return (heldPropActionMap[prop] || []).filter(action => text.includes(action))
}

function inferHeldPropHand(text: string) {
  if (/双手|两手/.test(text)) return '双手'
  if (/右手|右臂/.test(text)) return '右手'
  if (/左手|左臂/.test(text)) return '左手'
  return ''
}

function inferHeldPropHolder(text: string) {
  const names = extractCharacterNames(text)
  return names[0] || ''
}

function buildHeldPropSpecificBinding(prop: string, holder: string, hand: string, actions: string[]) {
  const holderPrefix = holder ? `${holder}${hand || ''}` : `${hand || '角色手部'}`
  const actionText = actions.length ? `当前涉及${actions.join('、')}这类高风险手持动作，` : ''

  if (prop === '雨伞' || prop === '伞') {
    return `${actionText}${holderPrefix}必须持续握住${prop}的伞柄，整段镜头里${prop}都要跟随人物步伐、手臂摆动和转身同步移动，不能让伞柄脱离手部，也不能让伞面留在原地像背景物一样不动。`
  }

  if (['手机', '玉碟', '信封', '证件', '钥匙'].includes(prop)) {
    return `${actionText}${holderPrefix}必须持续拿稳${prop}，让${prop}始终处于清晰、连续的手持状态；人物抬手、转身、递出或收回时，${prop}都要同步跟随，不能悬浮、拖尾或停在上一位置。`
  }

  if (['箱包', '包', '灯笼', '花束'].includes(prop)) {
    return `${actionText}${holderPrefix}必须持续提着或握着${prop}，让${prop}与手臂、肩部和身体位移同步变化；不要把${prop}重置成静止摆件，也不要让它在角色移动后还留在原地。`
  }

  if (['刀', '剑', '枪'].includes(prop)) {
    return `${actionText}${holderPrefix}必须持续稳固持有${prop}，让${prop}严格跟随手腕、前臂和身体动作，不得瞬间脱手、错位漂移、复制残影，或在人物继续动作时停留在旧位置。`
  }

  if (['书', '书册', '杯子', '茶杯', '酒杯'].includes(prop)) {
    return `${actionText}${holderPrefix}必须持续捧住或拿稳${prop}，保持${prop}与手部接触和重量感一致；无论人物走动、停顿还是转身，${prop}都不能脱手悬浮、穿模或滞留原地。`
  }

  return `${actionText}${holderPrefix}必须持续稳定持有${prop}，让${prop}始终与手部保持接触并与全身动作同步，不得脱手后留在原地、悬浮、漂移、复制或穿模。`
}

function buildHeldPropConstraintText(sourceShots: ClipSourceShot[], mode?: string) {
  const text = sourceShots
    .map(item => `${item.prompt || ''}\n${item.videoPrompt || ''}`)
    .join('\n')
  const matchedProps = Array.from(new Set(extractHeldPropsFromText(text)))
  if (!matchedProps.length) return ''

  return matchedProps
    .map(prop => {
      const matchedActions = extractHeldPropActions(text, prop)
      const holder = inferHeldPropHolder(text)
      const hand = inferHeldPropHand(text)
      const actionHint = buildHeldPropSpecificBinding(prop, holder, hand, matchedActions)
      const montageHint = mode === 'multi' || mode === 'multiTransition'
        ? `在多图混剪的所有参考分镜和动作 beat 之间，${prop}都必须保持同一持有关系，不能在某个中间 beat 被重置成背景物体或留在上一位置。`
        : ''
      return `${actionHint}${prop}属于关键手持主道具，若角色持有它，则必须始终与手部保持物理接触，并随手臂、肩部和身体同步移动；不得把${prop}理解为独立漂浮物或静止背景物件。禁止脱手后仍停留原地、悬浮、漂移、复制、穿模、动作滞后，或出现人物继续移动但${prop}留在上一位置的错误。${montageHint}`.trim()
    })
    .join(' ')
}

function getDefaultMode(frameCount: number) {
  return frameCount > 1 ? 'multi' : 'single'
}

function resolveInitialClipMode(sourceShots: ClipSourceShot[], savedMode?: string) {
  const frameCount = sourceShots.length
  if (frameCount <= 1) return 'single'
  if (savedMode === 'single') return 'single'
  return 'multi'
}

function getClipDurationBounds() {
  return { min: 4, max: 12 }
}

function getShotDuration(sourceShot: ClipSourceShot) {
  return Math.max(0, Number(sourceShot.duration) || 0)
}

function getSourceShotsDuration(sourceShots: ClipSourceShot[]) {
  return sourceShots.reduce((sum, item) => sum + getShotDuration(item), 0)
}

function getStage5ClipDuration(sourceShots: ClipSourceShot[]) {
  const bounds = getClipDurationBounds()
  const summedDuration = getSourceShotsDuration(sourceShots)
  return Math.min(bounds.max, Math.max(bounds.min, summedDuration || bounds.min))
}

function buildModeAwarePrompt(basePrompt: string, mode: string) {
  const trimmed = cleanVideoPromptForModel(basePrompt)
  if (!trimmed) return ''
  const heldPropConstraint = buildHeldPropConstraintText([{ prompt: trimmed } as ClipSourceShot], mode)

  if (mode === 'startEnd') {
    return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用 A->B 过渡方式，从当前分镜自然过渡到目标分镜。结尾需要稳定落到目标画面，不要回弹、反向运动或额外动作。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
  }

  if (mode === 'multiTransition') {
    return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用多图混剪方式，按参考分镜顺序组织镜头，保持当前 clip 的节奏推进，并在结尾自然落到下一 clip 首帧，不要回弹、反向运动，也不要提前演到下一 clip 的核心动作。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
  }

  if (mode === 'multi') {
    return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用多图混剪方式，按参考分镜顺序组织镜头，节奏清晰，切换自然，保持人物、场景和道具一致。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
  }

  return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用静态转动态方式，基于当前分镜生成稳定、自然的单镜头动态效果，保持人物、场景和道具一致。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
}

function buildClipModeAwarePrompt(basePrompt: string, mode: string) {
  const trimmed = cleanVideoPromptForModel(basePrompt)
  if (!trimmed) return ''
  const heldPropConstraint = buildHeldPropConstraintText([{ prompt: trimmed } as ClipSourceShot], mode)

  if (mode === 'startEnd') {
    return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用 A->B 过渡方式，从当前参考分镜自然过渡到最后一张参考分镜。开头不要重置主体状态，结尾只需自然落到目标画面。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
  }

  if (mode === 'multiTransition') {
    return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用多图分段一体化的混剪方式，按参考分镜顺序组织为一个连续段落，让每张当前 clip 分镜都成为不同的动作 beat 或情绪节点，并在结尾自然过渡到下一 clip 首帧，作为当前 clip 的最终落点。不要提前演到下一 clip 的核心剧情动作。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
  }

  if (mode === 'multi') {
    return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用多图分段一体化的混剪方式，按参考分镜顺序组织为一个连续段落，让每张分镜都成为不同的动作 beat 或情绪节点。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
  }

  return appendForbiddenPrompt(`${trimmed}\n\n镜头运动要求：采用静态转动态方式，基于当前分镜生成稳定、自然的单镜头动态效果，不引入下一张分镜的新动作。${heldPropConstraint ? `\n\n关键道具连续性要求：${heldPropConstraint}` : ''}`)
}

function appendForbiddenPrompt(prompt: string) {
  const trimmed = (prompt || '').trim()
  const fixedPromptTail = `${videoPromptQualityText}\n\n${getVideoPromptForbiddenText()}`
  if (!trimmed) return fixedPromptTail
  const cleaned = trimmed
    .split(legacyVideoPromptForbiddenText).join('')
    .split(legacyVideoPromptForbiddenTextV2).join('')
    .split(legacyVideoPromptQualityText).join('')
    .split(legacyVideoPromptQualityTextV2).join('')
    .split(legacyVideoPromptQualityTextV3).join('')
    .split(videoPromptQualityText).join('')
    .split(videoPromptForbiddenText).join('')
    .split(getVideoPromptForbiddenText()).join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `${cleaned}\n\n${fixedPromptTail}`
}

function cleanVideoPromptForModel(prompt?: string) {
  return (prompt || '')
    .split('镜头运动要求：')[0]
    .split('质量要求：')[0]
    .split('【绝对禁止】：')[0]
    .split(legacyVideoPromptForbiddenTextV2).join('')
    .split(legacyVideoPromptQualityText).join('')
    .split(legacyVideoPromptQualityTextV2).join('')
    .split(legacyVideoPromptQualityTextV3).join('')
    .split(videoPromptQualityText).join('')
    .split(videoPromptForbiddenText).join('')
    .split(getVideoPromptForbiddenText()).join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function handleModeChange(shot: Shot) {
  const nextAutoPrompt = buildClipModeAwarePrompt(shot.videoPrompt || '', resolvePromptMode(shot))
  const currentPrompt = cleanVideoPromptForModel(shot.config.prompt || '')
  const previousAutoPrompt = cleanVideoPromptForModel(shot.lastAutoPrompt || '')

  if (!currentPrompt || currentPrompt === previousAutoPrompt) {
    shot.config.prompt = nextAutoPrompt
  }

  shot.lastAutoPrompt = nextAutoPrompt
}

function buildClipLabel(sourceShots: ClipSourceShot[]) {
  const first = sourceShots[0]
  const last = sourceShots[sourceShots.length - 1]
  if (!first) return ''
  if (sourceShots.length === 1) return `S${first.segmentId || 0}-${String(first.shotIndex || 0).padStart(2, '0')}`
  return `S${first.segmentId || 0}-${String(first.shotIndex || 0).padStart(2, '0')} ~ ${String(last.shotIndex || 0).padStart(2, '0')}`
}

function buildClipKey(sourceShots: ClipSourceShot[]) {
  const ids = sourceShots.map(item => item.id).join('-')
  return `shots:${ids}`
}

function getConfigClipKey(config: any) {
  const imageIds = Array.isArray(config?.images) && config.images.length > 0
    ? config.images.map((item: any) => Number(item?.id)).filter(Boolean)
    : config?.startFrame?.id ? [Number(config.startFrame.id)] : []
  return imageIds.length > 0 ? `shots:${imageIds.join('-')}` : ''
}

function getClipName(shot: Shot) {
  return `场${shot.segmentId || 0} / Clip ${shot.clipOrder}`
}

function getClipSummary(shot: Shot) {
  const frameCount = shot.sourceShots.length
  return `${buildClipLabel(shot.sourceShots)} / ${frameCount} 张分镜 / ${shot.config.duration}s`
}

function inferEpisodeVoiceStyle(clipShots: Shot[]) {
  const text = clipShots
    .map(shot => `${shot.prompt || ''}\n${shot.videoPrompt || ''}\n${shot.config.prompt || ''}`)
    .join('\n')

  if (/鎬抾鍚紎鍠妡璐ㄩ棶|婵€鐑坾鍧氬畾|鍙嶅嚮|鍐茬獊/.test(text)) return 'firm'
  if (/绱у紶|鎯妡瀹虫€晐杩絴閫億鍗遍櫓|鎮枒|鍘嬭揩/.test(text)) return 'tense'
  if (/鍝瓅鎮瞸浼ゅ績|澶辫惤|閬楁喚|绂诲埆/.test(text)) return 'sad'
  if (/娓╂煍|瀹夋叞|寰瑧|鏆東鎷ユ姳|杞诲０/.test(text)) return 'warm'
  return 'calm'
}

function getEpisodeVoiceStyle(scriptId: number) {
  const key = String(scriptId)
  if (!episodeVoiceStyleMap.value[key]) {
    episodeVoiceStyleMap.value[key] = inferEpisodeVoiceStyle(shots.value)
  }
  return episodeVoiceStyleMap.value[key] || 'calm'
}

function buildVoiceCharacterBible(shot: Shot) {
  const promptText = [shot.prompt || '', shot.videoPrompt || '', shot.config.prompt || ''].join('\n')
  const names = extractCharacterNames(promptText).slice(0, 4)

  const profileHints = names.map((name, index) => {
    if (index === 0) return `${name}: 主视角，语气克制自然，句尾收住`
    if (index === 1) return `${name}: 对手角色，回应明确，停顿稍短`
    return `${name}: 口吻稳定，避免播音腔`
  })

  if (!profileHints.length) {
    return '旁白人设：同一集保持统一声线与说话节奏，避免播音腔和夸张情绪。'
  }

  return [
    ...profileHints,
    '同一集所有 clip 保持稳定声线与说话速度，不要无故变成另一种嗓音。',
  ].join('\n')
}

function extractCharacterNames(text: string) {
  return Array.from(new Set(text.match(/[\u4e00-\u9fa5]{2,4}/g) || []))
    .filter(name => !/镜头|分镜|画面|当前|场景|动作|情绪|角色|道具|过渡|结尾|首帧|提示词|连续性|参考|关键/.test(name))
}

function getPrimarySpeakerHint(shot: Shot) {
  const names = extractCharacterNames([shot.prompt || '', shot.videoPrompt || '', shot.config.prompt || ''].join('\n'))
  if (!names.length) return '旁白或画外音主导'
  return `${names[0]} 为当前 clip 的主说话者，优先保持其声线稳定`
}

function getNeighborSpeakerHint(orderedShots: Shot[], index: number, direction: 'previous' | 'next') {
  const start = direction === 'previous' ? index - 1 : index + 1
  const endCheck = (cursor: number) => direction === 'previous' ? cursor >= 0 : cursor < orderedShots.length
  const step = direction === 'previous' ? -1 : 1

  for (let cursor = start; endCheck(cursor); cursor += step) {
    const candidate = orderedShots[cursor]
    if (!candidate) continue
    const primary = getPrimarySpeakerHint(candidate)
    if (primary) return primary
  }

  return ''
}

function getNeighborVoiceText(orderedShots: Shot[], index: number, direction: 'previous' | 'next') {
  const start = direction === 'previous' ? index - 1 : index + 1
  const endCheck = (cursor: number) => direction === 'previous' ? cursor >= 0 : cursor < orderedShots.length
  const step = direction === 'previous' ? -1 : 1

  for (let cursor = start; endCheck(cursor); cursor += step) {
    const candidate = orderedShots[cursor]
    if (!candidate) continue
    const text = cleanVideoPromptForModel(candidate.config.prompt || candidate.videoPrompt || '')
    if (text) return text
  }

  return ''
}

function buildContinuityHint(shot: Shot) {
  const nextFrame = shot.nextClipFirstFrame
  if (!nextFrame?.imageUrl || shot.config.mode !== 'multi') return ''

  const nextPrompt = cleanVideoPromptForModel(nextFrame.videoPrompt || nextFrame.prompt || '')
  return [
    `The next clip begins with storyboard #${nextFrame.shotIndex || nextFrame.id}.`,
    'The final supplied reference image is the mandatory landing frame for the current clip ending.',
    'Reserve the final 0.6-1.0 seconds to settle cleanly onto that landing frame, even if the earlier montage beats need slight compression.',
    nextPrompt ? `Match this target frame closely at the ending: ${nextPrompt}` : '',
    'The ending should align with that next-clip first frame in composition, subject direction, posture, prop state, and camera momentum.',
    'Do not fully enter the next clip early, do not duplicate the next clip action, and do not create a hard stop before the cut.',
  ].filter(Boolean).join(' ')
}

function buildClipPrompt(sourceShots: ClipSourceShot[]) {
  return sourceShots
    .map(item => cleanVideoPromptForModel(item.videoPrompt || item.prompt || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function chunkSceneStoryboards(storyboards: ClipSourceShot[]) {
  const TARGET_CLIP_DURATION = 12
  const MAX_CLIP_SOURCE_DURATION = 13
  const MAX_CLIP_FRAMES = 4
  const MIN_LAST_CLIP_DURATION = 4
  const result: ClipSourceShot[][] = []

  let current: ClipSourceShot[] = []
  let currentDuration = 0

  for (let index = 0; index < storyboards.length; index++) {
    const storyboard = storyboards[index]
    const shotDuration = getShotDuration(storyboard)
    const nextDuration = currentDuration + shotDuration
    const isLastStoryboard = index === storyboards.length - 1
    const canAppend = current.length === 0
      || (
        current.length < MAX_CLIP_FRAMES
        && (
          nextDuration <= TARGET_CLIP_DURATION
          || (isLastStoryboard && nextDuration <= MAX_CLIP_SOURCE_DURATION)
        )
      )

    if (canAppend) {
      current.push(storyboard)
      currentDuration = nextDuration
      continue
    }

    result.push(current)
    current = [storyboard]
    currentDuration = shotDuration
  }

  if (current.length > 0) {
    result.push(current)
  }

  if (result.length >= 2) {
    const last = result[result.length - 1]
    const previous = result[result.length - 2]
    const lastDuration = getSourceShotsDuration(last)

    if (
      last.length > 0
      && previous.length > 1
      && lastDuration < MIN_LAST_CLIP_DURATION
    ) {
      const moved = previous[previous.length - 1]
      const previousAfterMove = previous.slice(0, -1)
      const lastAfterMove = [moved, ...last]
      const previousAfterDuration = getSourceShotsDuration(previousAfterMove)
      const lastAfterDuration = getSourceShotsDuration(lastAfterMove)

        if (
          previousAfterMove.length > 0
          && lastAfterMove.length <= MAX_CLIP_FRAMES
          && previousAfterDuration <= MAX_CLIP_SOURCE_DURATION
          && lastAfterDuration <= MAX_CLIP_SOURCE_DURATION
          && previousAfterDuration >= MIN_LAST_CLIP_DURATION
        ) {
          result[result.length - 2] = previousAfterMove
        result[result.length - 1] = lastAfterMove
      }
    }
  }

  return result
}

function buildClipShots(storyboards: any[], configs: any[], videos: any[]) {
  const orderedStoryboards: ClipSourceShot[] = [...storyboards]
    .map((item: any) => ({
      id: item.id,
      segmentId: Number(item.segmentId) || 0,
      shotIndex: Number(item.shotIndex) || 0,
      imageUrl: item.filePath || '',
      prompt: item.prompt || '',
      videoPrompt: item.videoPrompt || '',
      duration: Number(item.duration) || 0,
    }))
    .sort((a, b) =>
      (a.segmentId ?? 0) - (b.segmentId ?? 0)
      || (a.shotIndex ?? 0) - (b.shotIndex ?? 0)
      || a.id - b.id,
    )

  const sceneMap = new Map<number, ClipSourceShot[]>()
  for (const item of orderedStoryboards) {
    const key = item.segmentId || 0
    const list = sceneMap.get(key) || []
    list.push(item)
    sceneMap.set(key, list)
  }

  const configByClipKey = new Map<string, any>()
  for (const config of configs) {
    const imageIds = Array.isArray(config?.images) && config.images.length > 0
      ? config.images.map((item: any) => Number(item?.id)).filter(Boolean)
      : config?.startFrame?.id ? [Number(config.startFrame.id)] : []
    if (imageIds.length === 0) continue
    const key = getConfigClipKey({ images: config.images, startFrame: config.startFrame })
    if (!configByClipKey.has(key)) configByClipKey.set(key, config)
  }

  const configById = new Map(configs.map((item: any) => [item.id, item]))
  const videoByClipKey = new Map<string, any>()
  for (const video of [...videos].sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))) {
    const config = configById.get(video.configId)
    if (!config) continue
    const imageIds = Array.isArray(config?.images) && config.images.length > 0
      ? config.images.map((item: any) => Number(item?.id)).filter(Boolean)
      : config?.startFrame?.id ? [Number(config.startFrame.id)] : []
    if (imageIds.length === 0) continue
    const key = getConfigClipKey({ images: config.images, startFrame: config.startFrame })
    if (!videoByClipKey.has(key)) videoByClipKey.set(key, video)
  }

  const clipShots: Shot[] = []
  for (const [, sceneShots] of [...sceneMap.entries()].sort((a, b) => a[0] - b[0])) {
    let clipOrder = 1
    for (const sourceShots of chunkSceneStoryboards(sceneShots)) {
      const first = sourceShots[0]
      if (!first) continue
      const clipKey = buildClipKey(sourceShots)
      const config = configByClipKey.get(clipKey)
      const video = videoByClipKey.get(clipKey)
      const videoState = video?.state
      const videoUrl = videoState === 1 ? (video?.filePath || '') : ''
      const mode = resolveInitialClipMode(sourceShots, config?.mode)
      const primaryImage = sourceShots.find(item => item.imageUrl)?.imageUrl || ''
      const basePrompt = buildClipPrompt(sourceShots)
      const autoPrompt = buildClipModeAwarePrompt(basePrompt, mode)
      const savedPrompt = config?.prompt?.trim() ? config.prompt : ''
      const stage5Duration = getStage5ClipDuration(sourceShots)
      const useConfigDuration = Number(config?.duration) > 0
        && String(config?.durationSource || '').trim() !== 'stage5'

      clipShots.push({
        id: first.id,
        clipKey,
        clipOrder,
        segmentId: first.segmentId,
        shotIndex: first.shotIndex,
        imageUrl: primaryImage,
        prompt: `${buildClipLabel(sourceShots)}\n${sourceShots.map(item => item.prompt || '').filter(Boolean).join('\n')}`.trim(),
        sourceShots,
        videoPrompt: basePrompt,
        lastAutoPrompt: autoPrompt,
        videoUrl,
        videoLastFrame: video?.lastFrame || '',
        videoStatus: videoState === 1 ? 'done' : videoState === 0 ? 'generating' : 'pending',
        promptStatus: 'idle',
        config: {
          mode,
          audioMode: 'auto',
          duration: useConfigDuration ? Number(config.duration) : stage5Duration,
          durationSource: useConfigDuration ? (config?.durationSource || 'manual') : 'stage5',
          prompt: appendForbiddenPrompt(savedPrompt || autoPrompt),
          resolution: config?.resolution || '720p',
          configId: config?.id,
          manufacturer: String(config?.manufacturer || ''),
        },
      })
      clipOrder += 1
    }
  }

  for (let index = 0; index < clipShots.length; index++) {
    const current = clipShots[index]
    const next = clipShots[index + 1]
    if (!current || !next) continue
    if ((current.segmentId || 0) !== (next.segmentId || 0)) continue
    current.nextClipFirstFrame = next.sourceShots.find(item => item.imageUrl)
  }

  for (const shot of clipShots) {
    const nextAutoPrompt = buildClipModeAwarePrompt(buildClipPrompt(shot.sourceShots), resolvePromptMode(shot, clipShots))
    const currentPrompt = cleanVideoPromptForModel(shot.config.prompt || '')
    const previousAutoPrompt = cleanVideoPromptForModel(shot.lastAutoPrompt || '')
    shot.lastAutoPrompt = nextAutoPrompt
    if (!currentPrompt || currentPrompt === previousAutoPrompt) {
      shot.config.prompt = appendForbiddenPrompt(nextAutoPrompt)
    }
  }

  return clipShots
}

async function loadEpisodes() {
  try {
    const [scriptsRes, outlinesRes] = await Promise.all([
      getScript(projectId.value) as Promise<any>,
      getOutline(projectId.value) as Promise<any>,
    ])

    const outlines = outlinesRes.data || []
    const outlineMap = new Map(outlines.map((item: any) => [item.id, item]))
    episodes.value = (scriptsRes.data || [])
      .map((item: any) => ({
        episode: (outlineMap.get(item.outlineId) as any)?.episode || 0,
        scriptId: item.id,
      }))
      .sort((a: Episode, b: Episode) => a.episode - b.episode)

    if (episodes.value.length > 0) {
      activeEpisode.value = String(episodes.value[0].scriptId)
      await loadEpisodeData()
    }
  } catch {
    // ignore
  }
}

async function loadEpisodeData() {
  const scriptId = parseInt(activeEpisode.value)
  if (!scriptId) return
  loading.value = true
  try {
    const [storyboardRes, videoRes, configsRes, projectRes] = await Promise.all([
      getStoryboard({ projectId: projectId.value, scriptId }) as Promise<any>,
      getVideo(scriptId) as Promise<any>,
      getVideoConfigs(scriptId) as Promise<any>,
      getSingleProject(projectId.value) as Promise<any>,
    ])

    const storyboards: any[] = storyboardRes.data || []
    const videos: any[] = videoRes.data || []
    const configs: any[] = configsRes.data || []
    const rawProjectData = projectRes.data?.data || projectRes.data || {}
    const projectData = Array.isArray(rawProjectData) ? (rawProjectData[0] || {}) : rawProjectData
    projectArtStyle.value = [projectData.type, projectData.artStyle].filter(Boolean).join('，')

    shots.value = buildClipShots(storyboards, configs, videos)
    if (!episodeVoiceStyleMap.value[String(scriptId)]) {
      episodeVoiceStyleMap.value[String(scriptId)] = inferEpisodeVoiceStyle(shots.value)
    }

    void ensureVideoPrompts(scriptId)

    for (const shot of shots.value) {
      if (shot.videoStatus === 'generating') {
        startPolling(shot, scriptId)
      }
    }
  } finally {
    loading.value = false
  }
}

function toFrameRef(sourceShot: ClipSourceShot): VideoFrameRef | null {
  return sourceShot.imageUrl
    ? { id: sourceShot.id, filePath: sourceShot.imageUrl, prompt: sourceShot.prompt || '' }
    : null
}

function shouldUseClipLandingFrame(shot: Shot) {
  return shot.config.mode === 'multi' && Boolean(shot.nextClipFirstFrame?.imageUrl)
}

function getVideoFrameRefs(shot: Shot, ordered = orderedVideoShots()): VideoFrameRef[] {
  if (shot.config.mode === 'startEnd') {
    const refs = shot.sourceShots.map(toFrameRef).filter((item): item is VideoFrameRef => Boolean(item))
    if (refs.length >= 2) return [refs[0], refs[refs.length - 1]]
    return refs
  }

  if (shot.config.mode === 'multi') {
    return shot.sourceShots
      .map(toFrameRef)
      .filter((item): item is VideoFrameRef => Boolean(item))
  }

  return shot.sourceShots.length > 0
    ? shot.sourceShots
      .slice(0, 1)
      .map(toFrameRef)
      .filter((item): item is VideoFrameRef => Boolean(item))
    : []
}

function getGenerationFrameRefs(shot: Shot, ordered = orderedVideoShots()): VideoFrameRef[] {
  const refs = getVideoFrameRefs(shot, ordered)
  if (!shouldUseClipLandingFrame(shot)) return refs
  const nextFrame = shot.nextClipFirstFrame
  if (!nextFrame?.imageUrl) return refs
  if (refs.some(item => item.id === nextFrame.id || item.filePath === nextFrame.imageUrl)) return refs

  return [
    ...refs,
    {
      id: nextFrame.id,
      filePath: nextFrame.imageUrl,
      prompt: nextFrame.prompt || '',
      role: 'continuity_landing_frame',
    },
  ]
}

function buildOptimizationRefPrompts(refs: VideoFrameRef[]) {
  return refs.map((item, index) => {
    const prompt = cleanVideoPromptForModel(item.prompt || '')
    if (item.role === 'continuity_landing_frame') {
      return [
        `参考分镜${index + 1}【下一 clip 首帧 / 当前 clip 结尾落点】`,
        prompt,
        '用途：这是当前 clip 最后一段的视觉落点，只用于自然过渡到下一 clip 的首帧。',
      ].filter(Boolean).join('\n')
    }
    return [
      `参考分镜${index + 1}【当前 clip 主体分镜】`,
      prompt,
    ].filter(Boolean).join('\n')
  })
}

function buildPromptContinuityLandingText(shot: Shot, refs: VideoFrameRef[]) {
  const landingIndex = refs.findIndex(item => item.role === 'continuity_landing_frame')
  if (landingIndex < 0) return ''

  const currentRefs = refs.filter(item => item.role !== 'continuity_landing_frame')
  const lastCurrent = currentRefs[currentRefs.length - 1]
  const landing = refs[landingIndex]
  const lastPrompt = cleanVideoPromptForModel(lastCurrent?.prompt || '')
  const landingPrompt = cleanVideoPromptForModel(landing?.prompt || '')

  return [
    `当前 clip 的优化提示词必须按 ${refs.length} 张参考分镜组织：前 ${currentRefs.length} 张是当前 clip 的主体分镜，第 ${landingIndex + 1} 张是下一 clip 的首帧。`,
    lastPrompt ? `褰撳墠 clip 鏈€鍚庝竴涓富浣撳垎闀滐細${lastPrompt}` : '',
    landingPrompt ? `下一 clip 首帧 / 当前 clip 结尾落点：${landingPrompt}` : '',
    `请在生成的 videoPrompt 末尾明确写出：从第 ${currentRefs.length} 张当前 clip 分镜，自然过渡到第 ${landingIndex + 1} 张下一 clip 首帧。`,
    '这段过渡只描述构图、人物姿态、视线方向、道具位置、镜头运动和情绪节奏如何靠近下一 clip 首帧。',
    '不要提前执行下一 clip 的核心剧情动作，不要把下一 clip 的问候、成交、离开等后续事件写成当前 clip 的主体剧情。',
  ].filter(Boolean).join('\n')
}

function buildHardLandingPromptText(refs: VideoFrameRef[]) {
  const landingIndex = refs.findIndex(item => item.role === 'continuity_landing_frame')
  if (landingIndex < 0) return ''

  const currentRefs = refs.filter(item => item.role !== 'continuity_landing_frame')
  const lastCurrent = currentRefs[currentRefs.length - 1]
  const landing = refs[landingIndex]
  const lastPrompt = cleanVideoPromptForModel(lastCurrent?.prompt || '')
  const landingPrompt = cleanVideoPromptForModel(landing?.prompt || '')

  return [
    `Current clip prompt must use ${refs.length} ordered reference frames: ${currentRefs.length} current-clip beats plus landing frame #${landingIndex + 1}.`,
    lastPrompt ? `Last current-clip beat: ${lastPrompt}` : '',
    landingPrompt ? `Mandatory landing frame target: ${landingPrompt}` : '',
    `The generated prompt must explicitly say the clip transitions from beat ${currentRefs.length} into landing frame ${landingIndex + 1}.`,
    'This landing frame is a hard ending target for the current clip, not a soft suggestion.',
    'Use the final 0.5-1.0 seconds to match the landing frame as closely as possible in composition, pose, gaze direction, prop state, and camera momentum.',
    'Do not play out the next clip early. Do not perform the next clip main action, dialogue, trade, exit, or later event inside the current clip.',
  ].filter(Boolean).join('\n')
}

function getContinuityLandingDuration(frameCount: number) {
  if (frameCount <= 2) return 0.5
  if (frameCount === 3) return 0.8
  return 1
}

function getSafeGenerationDuration(shot: Shot, contentRefs: VideoFrameRef[], generationRefs: VideoFrameRef[]) {
  const bounds = getClipDurationBounds()
  const contentDuration = Math.min(bounds.max, Math.max(bounds.min, shot.config.duration || getStage5ClipDuration(shot.sourceShots)))
  const hasLandingFrame = generationRefs.some(item => item.role === 'continuity_landing_frame')
  if (!hasLandingFrame) return contentDuration
  return Math.min(12, Number((contentDuration + getContinuityLandingDuration(contentRefs.length)).toFixed(1)))
}

function validateVideoModeRefs(shot: Shot, refs: VideoFrameRef[]) {
  if (shot.config.mode === 'startEnd' && refs.length < 2) {
    ElMessage.warning('A->B 过渡需要当前分镜和下一张已生成分镜图')
    return false
  }
  if (shot.config.mode === 'multi' && refs.length < 2) {
    ElMessage.warning('多图混剪至少需要当前分镜起连续 2 张已生成分镜图')
    return false
  }
  return true
}

function getEffectivePromptMode(shot: Shot, refs: VideoFrameRef[]) {
  if (shouldUseClipLandingFrame(shot) && refs.some(item => item.role === 'continuity_landing_frame')) return 'multiTransition'
  if (shot.config.mode === 'startEnd' && refs.length < 2) return 'single'
  if (shot.config.mode === 'multi' && refs.length < 2) return 'single'
  return shot.config.mode
}

function resolvePromptMode(shot: Shot, ordered = orderedVideoShots()) {
  return getEffectivePromptMode(shot, getGenerationFrameRefs(shot, ordered))
}

function getModeLabel(mode: string) {
  if (mode === 'startEnd') return 'A->B 过渡'
  if (mode === 'multi') return '多图混剪'
  return '静态转动态'
}

function getModeHint(shot: Shot) {
  const refs = getVideoFrameRefs(shot)
  if (shot.config.mode === 'startEnd') {
    return refs.length >= 2
      ? `将使用当前分镜和下一张分镜，共 ${refs.length} 张图生成平滑过渡`
      : '需要下一张已生成分镜图，才能生成 A->B 过渡'
  }
  if (shot.config.mode === 'multi') {
    if (shouldUseClipLandingFrame(shot)) {
      return refs.length >= 2
        ? `将使用当前分镜连续 ${refs.length} 张图混剪，并在结尾强制过渡到下一 clip 首帧`
        : '至少需要连续 2 张已生成分镜图，才能生成多图混剪'
    }
    return refs.length >= 2
      ? `将使用当前分镜连续 ${refs.length} 张图生成混剪节奏`
      : '至少需要连续 2 张已生成分镜图，才能生成多图混剪'
  }
  return '将使用当前分镜图生成单镜头动态效果'
}

function getFrameRefLabel(shot: Shot, index: number, total: number) {
  if (shot.config.mode === 'startEnd') {
    return index === 0 ? '起始帧' : '结束帧'
  }
  if (shot.config.mode === 'multi') {
    return `混剪 ${index + 1}/${total}`
  }
  return '当前帧'
}

function orderedVideoShots() {
  return [...shots.value].sort((a, b) =>
    (a.segmentId ?? 0) - (b.segmentId ?? 0)
    || (a.shotIndex ?? 0) - (b.shotIndex ?? 0)
    || a.id - b.id,
  )
}

function getPreviousVideoPrompt(shot: Shot) {
  const ordered = orderedVideoShots()
  const currentIndex = ordered.findIndex(item => item.id === shot.id)
  if (currentIndex <= 0) return ''
  const previousShot = ordered[currentIndex - 1]
  return previousShot?.config.prompt || previousShot?.videoPrompt || previousShot?.prompt || ''
}

async function ensureVideoPrompts(scriptId: number) {
  const orderedShots = orderedVideoShots()
  const pendingShots = orderedShots.filter(item => item.sourceShots.some(source => source.imageUrl) && !cleanVideoPromptForModel(item.config.prompt || item.videoPrompt || '').trim())
  for (const shot of pendingShots) {
    const currentIndex = orderedShots.findIndex(item => item.id === shot.id)
    const previousShot = currentIndex > 0 ? orderedShots[currentIndex - 1] : undefined
    const nextShot = currentIndex >= 0 ? orderedShots.slice(currentIndex + 1).find(item => item.sourceShots.some(source => source.imageUrl)) : undefined
    const refs = getVideoFrameRefs(shot, orderedShots)
    const nextSet = new Set(promptGeneratingIds.value)
    nextSet.add(shot.id)
    promptGeneratingIds.value = nextSet
    shot.promptStatus = 'generating'
    try {
      const generationRefs = getGenerationFrameRefs(shot, orderedShots)
      const promptRefs = generationRefs.length > refs.length ? generationRefs : refs
      const effectiveMode = getEffectivePromptMode(shot, promptRefs)
      const res = await generateVideoPrompt({
        projectId: projectId.value,
        scriptId,
        id: String(shot.id),
        src: shot.imageUrl!,
        prompt: shot.sourceShots.map(item => item.prompt || '').filter(Boolean).join('\n'),
        mode: effectiveMode,
        currentVideoPrompt: cleanVideoPromptForModel(shot.videoPrompt || shot.config.prompt || ''),
        previousPrompt: cleanVideoPromptForModel(previousShot?.videoPrompt || previousShot?.config.prompt || getPreviousVideoPrompt(shot)),
        nextPrompt: buildClipPrompt(nextShot?.sourceShots || []),
        refPrompts: buildOptimizationRefPrompts(promptRefs),
        continuityLandingPrompt: shouldUseClipLandingFrame(shot) ? buildHardLandingPromptText(promptRefs) : buildPromptContinuityLandingText(shot, promptRefs),
      }) as any

      const generatedPrompt = res.data?.videoPrompt || res.data?.data?.videoPrompt || ''
      const generatedName = res.data?.name || res.data?.data?.name || ''

      if (generatedPrompt) {
        shot.videoPrompt = generatedPrompt
        const nextAutoPrompt = buildClipModeAwarePrompt(generatedPrompt, effectiveMode)
        const currentPrompt = cleanVideoPromptForModel(shot.config.prompt || '')
        const previousAutoPrompt = cleanVideoPromptForModel(shot.lastAutoPrompt || '')
        if (!currentPrompt || currentPrompt === previousAutoPrompt) {
          shot.config.prompt = appendForbiddenPrompt(nextAutoPrompt)
        }
        shot.lastAutoPrompt = appendForbiddenPrompt(nextAutoPrompt)
        const generatedDuration = Number(res.data?.duration || res.data?.data?.duration || 0)
        if (allowAiDurationAdjust.value && generatedDuration > 0) {
          shot.config.duration = generatedDuration
          shot.config.durationSource = 'manual'
        }

        void generatedName
      }
    } catch {
      // ignore single-shot prompt generation failures
    } finally {
      shot.promptStatus = 'idle'
      const next = new Set(promptGeneratingIds.value)
      next.delete(shot.id)
      promptGeneratingIds.value = next
    }
  }
}

async function batchOptimizePrompts() {
  const scriptId = parseInt(activeEpisode.value)
  if (!scriptId || shots.value.length === 0) return

  batchOptimizing.value = true
  try {
    ElMessage.info('正在获取视频模型专属提示词技巧...')
    const tipsRes = await getVideoPromptTips() as any
    const modelPromptTips = tipsRes.data?.tips || tipsRes.data?.data?.tips || ''
    const videoModelName = tipsRes.data?.model || tipsRes.data?.data?.model || ''
    if (videoModelName) {
      ElMessage.success(`已获取 ${videoModelName} 的提示词优化技巧`)
    }

    const orderedShots = orderedVideoShots()
    for (let index = 0; index < orderedShots.length; index++) {
      const shot = orderedShots[index]
      if (!shot.sourceShots.some(source => source.imageUrl)) continue

      const contentRefs = getVideoFrameRefs(shot, orderedShots)
      const generationRefs = getGenerationFrameRefs(shot, orderedShots)
      const effectiveMode = getEffectivePromptMode(shot, generationRefs)
      const previousShot = orderedShots[index - 1]
      const nextShot = orderedShots.slice(index + 1).find(item => item.sourceShots.some(source => source.imageUrl))

      shot.promptStatus = 'optimizing'
      const res = await generateVideoPrompt({
        projectId: projectId.value,
        scriptId,
        id: String(shot.id),
        src: shot.imageUrl,
        prompt: shot.sourceShots.map(item => item.prompt || '').filter(Boolean).join('\n'),
        mode: effectiveMode,
        currentVideoPrompt: '',
        previousPrompt: cleanVideoPromptForModel(previousShot?.videoPrompt || previousShot?.config.prompt || ''),
        nextPrompt: buildClipPrompt(nextShot?.sourceShots || []),
        refPrompts: buildOptimizationRefPrompts(generationRefs),
          continuityLandingPrompt: shouldUseClipLandingFrame(shot) ? buildHardLandingPromptText(generationRefs) : buildPromptContinuityLandingText(shot, generationRefs),
        modelPromptTips,
      }) as any

      const optimizedPrompt = res.data?.videoPrompt || res.data?.data?.videoPrompt || ''
      const optimizedName = res.data?.name || res.data?.data?.name || ''

      if (optimizedPrompt) {
        const finalPrompt = buildClipModeAwarePrompt(optimizedPrompt, effectiveMode)
        shot.videoPrompt = optimizedPrompt
        shot.lastAutoPrompt = finalPrompt
        shot.config.prompt = finalPrompt
        const optimizedDuration = Number(res.data?.duration || res.data?.data?.duration || 0)
        if (allowAiDurationAdjust.value && optimizedDuration > 0) {
          shot.config.duration = optimizedDuration
          shot.config.durationSource = 'manual'
        }

        void optimizedName

        if (shot.config.configId && contentRefs.length > 0) {
          await updateVideoConfig({
            id: shot.config.configId,
            duration: shot.config.duration,
            durationSource: shot.config.durationSource || 'stage5',
            prompt: shot.config.prompt,
            mode: shot.config.mode,
            resolution: shot.config.resolution,
            startFrame: contentRefs[0],
            endFrame: shot.config.mode === 'startEnd' ? contentRefs[1] : null,
            images: contentRefs,
          })
        }
      }

      shot.promptStatus = 'idle'
    }
    ElMessage.success('批量优化提示词完成')
  } catch (e: any) {
    ElMessage.error(e?.message || '批量优化提示词失败')
  } finally {
    for (const shot of shots.value) {
      if (shot.promptStatus === 'optimizing') shot.promptStatus = 'idle'
    }
    batchOptimizing.value = false
  }
}

function startPolling(shot: Shot, scriptId: number) {
  let attempts = 0
  const poll = setInterval(async () => {
    attempts++
    if (attempts > 120) {
      clearInterval(poll)
      shot.videoStatus = 'pending'
      ElMessage.error('视频生成超时')
      return
    }

    try {
      const [videoRes, configsRes] = await Promise.all([
        getVideo(scriptId) as Promise<any>,
        getVideoConfigs(scriptId) as Promise<any>,
      ])
      const videos: any[] = videoRes.data || []
      const configs: any[] = configsRes.data || []
      const configById = new Map(configs.map((item: any) => [item.id, item]))
      const video = videos.find((item: any) => getConfigClipKey(configById.get(item.configId)) === shot.clipKey)
      if (attempts === 1 || attempts % 6 === 0) {
        console.info('[Stage6][poll]', {
          clipKey: shot.clipKey,
          clipName: getClipName(shot),
          attempts,
          matchedVideoId: video?.id || null,
          matchedConfigId: video?.configId || null,
          state: video?.state ?? null,
        })
      }

      if (video?.state === 1 && video.filePath) {
        shot.videoUrl = video.filePath
        shot.videoLastFrame = video.lastFrame || ''
        shot.videoStatus = 'done'
        clearInterval(poll)
        ElMessage.success('视频生成完成')
      } else if (video?.state === -1) {
        clearInterval(poll)
        shot.videoStatus = 'pending'
        ElMessage.error('视频生成失败')
      }
    } catch {
      // keep polling
    }
  }, 5000)
}

async function handleDurationChange(shot: Shot) {
  shot.config.durationSource = 'manual'
  if (!shot.config.configId) return

  try {
    await updateVideoConfig({
      id: shot.config.configId,
      duration: shot.config.duration,
      durationSource: 'manual',
    })
  } catch {
    // keep the local manual value; it will be saved again when generating video
  }
}

async function generateVideo(shot: Shot, batchId?: string) {
  if (!shot.sourceShots.some(item => item.imageUrl)) {
    ElMessage.warning('该分镜暂时没有图片，无法生成视频')
    return false
  }

  shot.videoStatus = 'generating'
  shot.videoUrl = ''
  shot.config.prompt = appendForbiddenPrompt(shot.config.prompt)
  const scriptId = parseInt(activeEpisode.value)
  const resolution = shot.config.resolution || '720p'

  try {
    const orderedShots = orderedVideoShots()
    const currentIndex = orderedShots.findIndex(item => item.id === shot.id)
    const frameRefs = getVideoFrameRefs(shot, orderedShots)
    if (!validateVideoModeRefs(shot, frameRefs)) {
      shot.videoStatus = 'pending'
      return false
    }
    const generationFrameRefs = getGenerationFrameRefs(shot, orderedShots)
    const voiceCharacterBible = buildVoiceCharacterBible(shot)
    const previousVoiceText = getNeighborVoiceText(orderedShots, currentIndex, 'previous')
    const nextVoiceText = getNeighborVoiceText(orderedShots, currentIndex, 'next')
    const primarySpeakerHint = getPrimarySpeakerHint(shot)
    const previousSpeakerHint = getNeighborSpeakerHint(orderedShots, currentIndex, 'previous')
    const nextSpeakerHint = getNeighborSpeakerHint(orderedShots, currentIndex, 'next')

    const startFrame = frameRefs[0]
    const endFrame = shot.config.mode === 'startEnd' ? frameRefs[1] : null
    let configId = shot.config.configId
    console.info('[Stage6][submit]', {
      clipKey: shot.clipKey,
      clipName: getClipName(shot),
      frameRefIds: frameRefs.map(item => item.id),
      generationFrameRefIds: generationFrameRefs.map(item => item.id),
      duration: shot.config.duration,
      mode: shot.config.mode,
      audioMode: shot.config.audioMode || 'auto',
    })

    if (!configId) {
        const res = await addVideoConfig({
          projectId: projectId.value,
          scriptId,
          manufacturer: shot.config.manufacturer,
          duration: shot.config.duration,
          durationSource: shot.config.durationSource || 'stage5',
          prompt: shot.config.prompt,
        mode: shot.config.mode,
        resolution: shot.config.resolution,
        startFrame,
        endFrame,
        images: frameRefs,
      }) as any
      configId = res.data?.data?.id
      shot.config.configId = configId
      console.info('[Stage6][config-created]', {
        clipKey: shot.clipKey,
        configId,
        frameRefIds: frameRefs.map(item => item.id),
      })
    } else {
      await updateVideoConfig({
        id: configId,
        manufacturer: shot.config.manufacturer,
        duration: shot.config.duration,
        durationSource: shot.config.durationSource || 'stage5',
        prompt: shot.config.prompt,
        mode: shot.config.mode,
        resolution: shot.config.resolution,
        startFrame,
        endFrame,
        images: frameRefs,
      })
      console.info('[Stage6][config-updated]', {
        clipKey: shot.clipKey,
        configId,
        frameRefIds: frameRefs.map(item => item.id),
      })
    }

    const safeDuration = getSafeGenerationDuration(shot, frameRefs, generationFrameRefs)
    await apiGenerateVideo({
      projectId: projectId.value,
      scriptId,
      configId,
      shotId: shot.id,
      batchId,
      filePath: generationFrameRefs.map(item => ({
        path: item.filePath,
        role: item.role || undefined,
      })),
      duration: safeDuration,
      prompt: shot.config.prompt,
      continuityHint: buildContinuityHint(shot),
      preferredVoiceStyle: getEpisodeVoiceStyle(scriptId),
      audioMode: shot.config.audioMode || 'auto',
      voiceCharacterBible,
      previousVoiceText,
      nextVoiceText,
      primarySpeakerHint,
      previousSpeakerHint,
      nextSpeakerHint,
      resolution,
      mode: shot.config.mode,
      type: shot.config.manufacturer,
    })
    console.info('[Stage6][generation-requested]', {
      clipKey: shot.clipKey,
      configId,
      safeDuration,
      frameRefIds: frameRefs.map(item => item.id),
      generationFrameRefIds: generationFrameRefs.map(item => item.id),
    })

    startPolling(shot, scriptId)
    return true
  } catch (e: any) {
    shot.videoStatus = 'pending'
    ElMessage.error(e?.message || '视频生成失败')
    return false
  }
}

async function batchGenerateVideos() {
  const scriptId = parseInt(activeEpisode.value)
  if (!scriptId) return

  const toGenerate = shots.value
    .filter(shot => shot.sourceShots.some(item => item.imageUrl) && shot.videoStatus !== 'generating')
    .sort((a, b) =>
      (a.segmentId ?? 0) - (b.segmentId ?? 0)
      || (a.shotIndex ?? 0) - (b.shotIndex ?? 0)
      || a.id - b.id,
    )

  if (toGenerate.length === 0) {
    ElMessage.info('暂无可生成的视频分镜')
    return
  }

  batchVideoGenerating.value = true
  batchVideoProgress.value = 0
  batchVideoTotal.value = toGenerate.length
  const batchId = `stage6_${scriptId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  try {
    for (const shot of toGenerate) {
      const submitted = await generateVideo(shot, batchId)
      if (!submitted) continue
      const finished = await waitForShotGeneration(shot)
      if (!finished) {
        ElMessage.warning('当前分镜视频未成功生成，已停止后续批量提交')
        break
      }
      batchVideoProgress.value++
    }
    ElMessage.success('已按分镜顺序提交批量视频生成')
  } finally {
    batchVideoGenerating.value = false
  }
}

async function waitForShotGeneration(shot: Shot, timeoutMs = 300000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (shot.videoStatus === 'done') return true
    if (shot.videoStatus === 'pending') return false
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

async function previewAll() {
  previewUrls.value = shots.value
    .filter(item => item.videoStatus === 'done' && item.videoUrl)
    .map(item => item.videoUrl!)
  if (previewUrls.value.length === 0) {
    ElMessage.warning('暂无已生成的视频')
    return
  }
  currentPreviewIdx.value = 0
  previewDialogVisible.value = true
}

function playNext() {
  if (currentPreviewIdx.value < previewUrls.value.length - 1) {
    currentPreviewIdx.value++
  }
}

async function mergeEpisode() {
  const scriptId = parseInt(activeEpisode.value)
  if (!scriptId) return
  const doneCount = shots.value.filter(item => item.videoStatus === 'done').length
  if (doneCount === 0) {
    ElMessage.warning('当前集没有已完成的视频')
    return
  }

  merging.value = true
  mergedVideoUrl.value = ''
  try {
    const res = await mergeVideos({ scriptId, projectId: projectId.value }) as any
    mergedVideoUrl.value = res.data?.url || ''
    ElMessage.success(`合并完成，共 ${res.data?.count} 个片段`)
  } catch (e: any) {
    ElMessage.error(e?.message || '合并失败')
  } finally {
    merging.value = false
  }
}

onMounted(loadEpisodes)
</script>

<style scoped>
.stage-page {
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stage-toolbar {
  background: white;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.stage-title {
  font-size: 18px;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.stage-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.episode-tabs {
  margin-bottom: 16px;
}

.shots-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-hint {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shot-row {
  background: white;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.shot-thumb {
  width: 220px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f5f5;
}

.shot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clip-thumb {
  padding: 10px;
  overflow: visible;
}

.clip-thumb__header {
  margin-bottom: 10px;
}

.clip-thumb__title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.clip-thumb__summary {
  margin-top: 4px;
  font-size: 12px;
  color: #667085;
  line-height: 1.4;
}

.clip-thumb__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.clip-thumb__item {
  position: relative;
  height: 68px;
  border-radius: 6px;
  overflow: hidden;
  background: #e5e7eb;
}

.clip-thumb__tag {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.75);
  color: #fff;
  font-size: 11px;
}

.no-thumb {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 24px;
}

.shot-config {
  flex: 1;
}

.config-row {
  margin-bottom: 8px;
}

.duration-text {
  margin-left: 8px;
}

.prompt-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #667085;
}

.mode-summary {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f7f9fc;
  border: 1px solid #e4e9f2;
}

.mode-summary__title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.mode-summary__hint {
  margin-top: 4px;
  font-size: 12px;
  color: #667085;
  line-height: 1.5;
}

.continuity-ref {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}

.continuity-ref__image {
  width: 52px;
  height: 34px;
  object-fit: cover;
  border-radius: 5px;
  flex-shrink: 0;
}

.continuity-ref__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #075985;
  line-height: 1.35;
}

.continuity-ref__text strong {
  color: #0c4a6e;
}

.mode-refs {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-ref {
  width: 88px;
}

.mode-ref__image {
  width: 88px;
  height: 58px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  background: #e5e7eb;
}

.mode-ref__meta {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-ref__tag {
  font-size: 11px;
  color: #111827;
  font-weight: 500;
}

.mode-ref__id {
  font-size: 11px;
  color: #6b7280;
}

.shot-actions {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.video-preview {
  width: 100%;
  border-radius: 6px;
  max-height: 120px;
}

.preview-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.preview-video {
  width: 100%;
  max-height: 500px;
}

.merged-result {
  margin: 16px 0;
  background: white;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merged-title {
  font-weight: 600;
  font-size: 14px;
}

.merged-video {
  width: 100%;
  max-height: 400px;
  border-radius: 6px;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
