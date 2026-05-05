<template>
  <div class="stage-page">
    <!-- Toolbar -->
    <div class="stage-toolbar">
      <h2 class="stage-title">剧集大纲</h2>
      <div class="toolbar-actions">
        <el-button icon="Plus" @click="handleManualAdd">手动添加</el-button>
        <el-button :disabled="outlines.length === 0" type="primary" @click="completeStage">
          完成，进入剧本阶段
        </el-button>
      </div>
    </div>

    <!-- Three-column body -->
    <div class="stage-body">

      <!-- ① Left: AI Generation Form -->
      <div class="side-panel left-panel" :class="{ collapsed: leftCollapsed }">
        <div class="panel-toggle" @click="leftCollapsed = !leftCollapsed" :title="leftCollapsed ? '展开' : '收起'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline v-if="!leftCollapsed" points="15 18 9 12 15 6"/>
            <polyline v-else points="9 18 15 12 9 6"/>
          </svg>
        </div>

        <div class="panel-content">
          <div class="panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            AI 生成大纲
          </div>

          <!-- 故事素材区 -->
          <div class="source-material">
            <div class="source-header">
              <span class="source-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                故事素材
              </span>
              <span class="source-count">来自故事灵感 · {{ novelChapters.length }} 章</span>
            </div>
            <div v-if="novelChapters.length === 0" class="source-empty">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              暂无故事章节，建议先完成故事灵感阶段
            </div>
            <div v-else class="source-list">
              <div v-for="(ch, i) in novelChapters" :key="ch.id" class="source-item">
                <span class="source-reel">{{ i + 1 }}</span>
                <span class="source-title">{{ ch.chapter }}</span>
                <span class="source-words">{{ ch.chapterData?.length || 0 }}字</span>
              </div>
            </div>
          </div>

          <!-- Generation form -->
          <div class="ai-form">
            <div class="form-field">
              <label>目标集数</label>
              <div class="slider-row">
                <el-slider v-model="aiForm.episodeCount" :min="1" :max="100" :show-tooltip="false" style="flex:1" />
                <span class="slider-val">{{ aiForm.episodeCount }} 集</span>
              </div>
            </div>
            <div class="form-field">
              <label>创作备注 <span class="optional">可选</span></label>
              <el-input v-model="aiForm.notes" type="textarea" :rows="3"
                placeholder="如：第一集必须有强反转、重点保留第三章的核心冲突、每集结尾留悬念..." />
            </div>
            <el-button type="primary" :loading="generating" class="gen-btn" @click="handleGenerate">
              <template #icon>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </template>
              {{ generating ? `已生成 ${generateProgress}/${aiForm.episodeCount} 集...` : '根据故事内容生成大纲' }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- ② Middle: Outline Cards -->
      <div class="outlines-area" v-loading="loading">
        <div v-if="outlines.length === 0" class="empty-hint">
          <div class="empty-icon-box">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--tf-primary)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="3"/></svg>
          </div>
          <p class="empty-t">暂无大纲</p>
          <p class="empty-s">使用左侧 AI 生成，或手动创建剧集大纲</p>
        </div>
        <div v-else class="outlines-grid">
          <EpisodeCard
            v-for="outline in outlines"
            :key="outline.id"
            :outline="outline"
            :regenerating="regeneratingId === outline.id"
            @click="openEdit(outline)"
            @edit="openEdit(outline)"
            @regenerate="handleRegenerate(outline)"
            @delete="handleDelete(outline)"
          />
        </div>
      </div>

      <!-- ③ Right: AI Chat -->
      <div class="side-panel right-panel" :class="{ collapsed: rightCollapsed }">
        <div class="panel-toggle" @click="rightCollapsed = !rightCollapsed" :title="rightCollapsed ? '展开' : '收起'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline v-if="!rightCollapsed" points="9 18 15 12 9 6"/>
            <polyline v-else points="15 18 9 12 15 6"/>
          </svg>
        </div>

        <div class="panel-content chat-panel-content">
          <div class="panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            大纲助手
          </div>

          <div class="chat-messages" ref="messagesEl">
            <div v-if="chatMessages.length === 0" class="chat-welcome">
              <div class="welcome-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="3"/></svg>
              </div>
              <p class="welcome-title">大纲结构助手</p>
              <p class="welcome-desc">我可以帮你设计集数结构、优化悬念钩子、规划情绪曲线，随时开聊</p>
              <div class="quick-prompts">
                <button v-for="q in quickPrompts" :key="q" class="quick-btn" @click="sendQuick(q)">{{ q }}</button>
              </div>
            </div>

            <template v-else>
              <div v-for="(msg, i) in chatMessages" :key="i" class="msg-row" :class="msg.role">
                <div v-if="msg.role === 'assistant'" class="msg-avatar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="3"/></svg>
                </div>
                <div class="msg-bubble">
                  <span class="msg-text" v-html="renderText(msg.content)"></span>
                  <span v-if="msg.streaming" class="typing-cursor">▍</span>
                </div>
              </div>
            </template>
          </div>

          <div class="chat-input-area">
            <textarea
              ref="inputEl"
              v-model="chatInput"
              class="chat-input"
              placeholder="问问大纲助手..."
              rows="1"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
            />
            <button
              class="send-btn"
              :class="{ active: chatInput.trim() && !isStreaming }"
              :disabled="!chatInput.trim() || isStreaming"
              @click="sendMessage"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Edit Drawer -->
    <el-drawer v-model="editDrawerVisible" title="编辑剧集大纲" size="520px" direction="rtl">
      <el-form v-if="editForm" label-width="80px" class="edit-form">
        <el-form-item label="集数">
          <el-input-number v-model="editForm.episode" :min="1" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item label="核心冲突">
          <el-input v-model="editForm.coreConflict" placeholder="A想要X vs B阻碍X" />
        </el-form-item>
        <el-form-item label="剧情主干">
          <el-input v-model="editForm.outline" type="textarea" :autosize="{ minRows: 4 }" />
        </el-form-item>
        <el-form-item label="开场镜头">
          <el-input v-model="editForm.openingHook" type="textarea" :autosize="{ minRows: 2 }" />
        </el-form-item>
        <el-form-item label="关键事件">
          <div class="key-events-editor">
            <div v-for="(label, i) in ['起', '承', '转', '合']" :key="i" class="ke-row">
              <span class="ke-label">{{ label }}</span>
              <el-input v-model="editForm.keyEvents[i]" type="textarea" :autosize="{ minRows: 2 }" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="情绪曲线">
          <el-input v-model="editForm.emotionalCurve" placeholder="如：2(压抑)→5(反抗)→9(爆发)→3(余波)" />
        </el-form-item>
        <el-form-item label="结尾悬念">
          <el-input v-model="editForm.endingHook" type="textarea" :autosize="{ minRows: 2 }" />
        </el-form-item>
        <el-form-item label="角色">
          <div class="asset-list">
            <div v-for="(c, i) in editForm.characters" :key="i" class="asset-item">
              <el-input v-model="c.name" placeholder="角色名" style="width:90px;flex-shrink:0" />
              <el-input v-model="c.description" type="textarea" :autosize="{ minRows: 1 }" placeholder="人物描述" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="场景">
          <div class="asset-list">
            <div v-for="(s, i) in editForm.scenes" :key="i" class="asset-item">
              <el-input v-model="s.name" placeholder="场景名" style="width:90px;flex-shrink:0" />
              <el-input v-model="s.description" type="textarea" :autosize="{ minRows: 1 }" placeholder="场景描述" />
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDrawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveOutline">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getOutline, addOutline, updateOutline, delOutline, generateOutlineStream, chatOutlineStream } from '@/api/outline'
import { getNovel } from '@/api/novel'
import type { NovelChapter } from '@/api/novel'
import EpisodeCard from '@/components/EpisodeCard.vue'

const emit = defineEmits<{ stageComplete: [stage: number] }>()
const route = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(route.params.id as string))

// ── Panel collapse ──
const leftCollapsed = ref(false)
const rightCollapsed = ref(false)

// ── Novel chapters (Stage1 material) ──
const novelChapters = ref<NovelChapter[]>([])

// ── Outlines ──
const outlines = ref<any[]>([])
const loading = ref(false)
const rawMap = ref<Map<number, any>>(new Map())
const regeneratingId = ref<number | null>(null)

// ── Edit drawer ──
const editDrawerVisible = ref(false)
const editForm = ref<any>(null)
const saving = ref(false)

// ── AI Generation ──
const aiForm = reactive({ episodeCount: 12, notes: '' })
const generating = ref(false)
const generateProgress = ref(0)

// ── Chat ──
interface ChatMsg { role: 'user' | 'assistant'; content: string; streaming?: boolean }
const chatMessages = ref<ChatMsg[]>([])
const chatInput = ref('')
const isStreaming = ref(false)
const messagesEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()

const quickPrompts = [
  '如何设计强冲突的集数结构',
  '每集结尾悬念怎么写才抓人',
  '怎样让各集情节之间更紧密',
  '短剧的情绪曲线如何规划',
  '如何塑造让观众上头的反派',
]

// ── Helpers ──
function toNames(arr: any[]): string {
  if (!Array.isArray(arr)) return String(arr || '')
  return arr.map((x: any) => (typeof x === 'object' ? x.name : x)).join('、')
}

function parseOutlineRow(o: any) {
  let parsed: any = {}
  try { parsed = typeof o.data === 'string' ? JSON.parse(o.data) : (o.data || {}) } catch { /**/ }
  rawMap.value.set(o.id, parsed)
  return {
    id: o.id,
    episode: o.episode,
    projectId: o.projectId,
    title: parsed.title || '',
    keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents.join('\n') : (parsed.keyEvents || ''),
    characters: toNames(parsed.characters || []),
    scenes: toNames(parsed.scenes || []),
    content: parsed.outline || '',
  }
}

// ── Load data ──
async function loadNovelChapters() {
  try {
    const res = await getNovel(projectId.value) as any
    novelChapters.value = (res.data || []).sort((a: any, b: any) => a.index - b.index)
  } catch { /**/ }
}

async function loadOutlines() {
  loading.value = true
  try {
    const res = await getOutline(projectId.value) as any
    const rows: any[] = res.data || []
    rawMap.value.clear()
    outlines.value = rows.map(parseOutlineRow).sort((a, b) => a.episode - b.episode)
  } finally {
    loading.value = false
  }
}

// ── Generate ──
async function handleGenerate() {
  generating.value = true
  generateProgress.value = 0

  try {
    const response = await generateOutlineStream({
      projectId: projectId.value,
      episodeCount: aiForm.episodeCount,
      notes: aiForm.notes,
    })
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const dataStr = line.slice(6).trim()
        if (!dataStr) continue
        try {
          const data = JSON.parse(dataStr)
          if (data.type === 'outline') {
            outlines.value.push(parseOutlineRow(data.outline))
            generateProgress.value++
          } else if (data.type === 'done') {
            ElMessage.success(`AI 已生成 ${data.count} 集大纲`)
          } else if (data.type === 'error') {
            ElMessage.error(data.text || 'AI 生成失败')
          }
        } catch { /**/ }
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || 'AI 生成失败，请重试')
  } finally {
    generating.value = false
    generateProgress.value = 0
  }
}

// ── Manual Add ──
function handleManualAdd() {
  const nextEpisode = outlines.value.length > 0
    ? Math.max(...outlines.value.map(o => o.episode)) + 1
    : 1
  editForm.value = {
    id: null,
    episode: nextEpisode,
    projectId: projectId.value,
    title: '',
    coreConflict: '',
    outline: '',
    openingHook: '',
    keyEvents: ['', '', '', ''],
    emotionalCurve: '',
    endingHook: '',
    characters: [{ name: '', description: '' }],
    scenes: [{ name: '', description: '' }],
    props: [],
  }
  editDrawerVisible.value = true
}

// ── Edit / Save / Delete ──
function openEdit(outline: any) {
  const raw = rawMap.value.get(outline.id) || {}
  editForm.value = {
    id: outline.id,
    episode: outline.episode,
    projectId: outline.projectId,
    title: raw.title || outline.title || '',
    coreConflict: raw.coreConflict || '',
    outline: raw.outline || outline.content || '',
    openingHook: raw.openingHook || '',
    keyEvents: Array.isArray(raw.keyEvents) ? [...raw.keyEvents] : ['', '', '', ''],
    emotionalCurve: raw.emotionalCurve || '',
    endingHook: raw.endingHook || '',
    characters: Array.isArray(raw.characters)
      ? raw.characters.map((c: any) => ({ name: c.name || c, description: c.description || '' }))
      : [],
    scenes: Array.isArray(raw.scenes)
      ? raw.scenes.map((s: any) => ({ name: s.name || s, description: s.description || '' }))
      : [],
    props: raw.props || [],
  }
  editDrawerVisible.value = true
}

async function saveOutline() {
  if (!editForm.value) return
  saving.value = true
  try {
    const { id, episode, projectId: pid, ...rest } = editForm.value
    const data = { ...rest, episodeIndex: episode }

    if (!id) {
      // 新建
      const res = await addOutline({ projectId: projectId.value, episode, data: JSON.stringify(data) }) as any
      const newId = res.data?.id
      rawMap.value.set(newId, data)
      outlines.value.push({
        id: newId, episode, projectId: projectId.value,
        title: rest.title,
        keyEvents: Array.isArray(rest.keyEvents) ? rest.keyEvents.join('\n') : rest.keyEvents,
        characters: toNames(rest.characters || []),
        scenes: toNames(rest.scenes || []),
        content: rest.outline,
      })
      outlines.value.sort((a, b) => a.episode - b.episode)
    } else {
      // 更新
      await updateOutline({ id, data })
      rawMap.value.set(id, data)
      const idx = outlines.value.findIndex(o => o.id === id)
      if (idx !== -1) {
        outlines.value[idx] = {
          ...outlines.value[idx],
          episode,
          title: rest.title,
          keyEvents: Array.isArray(rest.keyEvents) ? rest.keyEvents.join('\n') : rest.keyEvents,
          characters: toNames(rest.characters || []),
          scenes: toNames(rest.scenes || []),
          content: rest.outline,
        }
      }
    }
    editDrawerVisible.value = false
    ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

async function handleDelete(outline: any) {
  await ElMessageBox.confirm(`确认删除第 ${outline.episode} 集大纲？`, '删除确认', { type: 'warning' })
  await delOutline(outline.id, outline.projectId)
  outlines.value = outlines.value.filter(o => o.id !== outline.id)
  rawMap.value.delete(outline.id)
  ElMessage.success('已删除')
}

async function handleRegenerate(outline: any) {
  regeneratingId.value = outline.id
  setTimeout(() => { regeneratingId.value = null }, 2000)
  ElMessage.info('可在右侧助手中描述修改需求')
}

function completeStage() {
  emit('stageComplete', 2)
  router.push(`/project/${projectId.value}/creation/stage3`)
}

const renderText = renderMarkdown

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

async function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || isStreaming.value) return

  chatMessages.value.push({ role: 'user', content: text })
  chatInput.value = ''
  if (inputEl.value) inputEl.value.style.height = 'auto'
  await scrollToBottom()

  chatMessages.value.push({ role: 'assistant', content: '', streaming: true })
  isStreaming.value = true
  await scrollToBottom()

  try {
    const history = chatMessages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    const response = await chatOutlineStream(history)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const dataStr = line.slice(6).trim()
        if (!dataStr) continue
        try {
          const data = JSON.parse(dataStr)
          if (data.type === 'chunk') {
            chatMessages.value[chatMessages.value.length - 1].content += data.text
            await scrollToBottom()
          } else if (data.type === 'done') {
            chatMessages.value[chatMessages.value.length - 1].streaming = false
          } else if (data.type === 'error') {
            chatMessages.value[chatMessages.value.length - 1].content = '⚠️ ' + data.text
            chatMessages.value[chatMessages.value.length - 1].streaming = false
          }
        } catch { /**/ }
      }
    }
  } catch (e: any) {
    chatMessages.value[chatMessages.value.length - 1].content = '⚠️ 请求失败：' + (e?.message || '未知错误')
  } finally {
    chatMessages.value[chatMessages.value.length - 1].streaming = false
    isStreaming.value = false
    await scrollToBottom()
  }
}

function sendQuick(q: string) {
  chatInput.value = q
  sendMessage()
}

onMounted(() => {
  loadNovelChapters()
  loadOutlines()
})
</script>

<style scoped>
.stage-page {
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--tf-bg);
}

.stage-toolbar {
  background: #fff;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--tf-border);
  flex-shrink: 0;
}
.stage-title { font-size: 16px; font-weight: 700; color: var(--tf-text); letter-spacing: -0.01em; }
.toolbar-actions { display: flex; gap: 8px; }

.stage-body { flex: 1; display: flex; overflow: hidden; }

/* ── Side panels ── */
.side-panel {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  transition: width 0.28s cubic-bezier(0.4,0,0.2,1);
  overflow: hidden;
}
.left-panel { width: 290px; border-right: 1px solid var(--tf-border); }
.left-panel.collapsed { width: 68px; }
.right-panel { width: 320px; border-left: 1px solid var(--tf-border); }
.right-panel.collapsed { width: 68px; }

.panel-toggle {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 20px; height: 48px;
  background: var(--tf-surface-3); border: 1px solid var(--tf-border); border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--tf-text-3);
  transition: background 0.15s, color 0.15s; z-index: 10; flex-shrink: 0;
}
.left-panel .panel-toggle  { right: -10px; }
.right-panel .panel-toggle { left: -10px; }
.panel-toggle:hover { background: var(--tf-primary-dim); color: var(--tf-primary); }

.panel-content {
  flex: 1; overflow: hidden; display: flex; flex-direction: column;
  min-width: 0; opacity: 1; transition: opacity 0.18s;
}
.side-panel.collapsed .panel-content {
  opacity: 1;
  pointer-events: auto;
  align-items: center;
}

.side-panel.collapsed .panel-content > :not(.panel-header) {
  display: none !important;
}

.side-panel.collapsed .panel-header {
  flex: 1;
  width: 100%;
  justify-content: center;
  gap: 10px;
  padding: 20px 0;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 0.08em;
}

.side-panel.collapsed .panel-header svg {
  width: 16px;
  height: 16px;
}

.panel-header {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 700; color: var(--tf-primary);
  padding: 16px 16px 12px; letter-spacing: 0.02em; flex-shrink: 0;
}

/* ── Left: AI form ── */
.left-panel .panel-content { background: #fff; overflow-y: auto; padding-bottom: 16px; }

/* Story material section */
.source-material {
  margin: 0 16px 14px;
  border: 1px solid var(--tf-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--tf-surface-2);
}
.source-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  background: var(--tf-primary-dim);
  border-bottom: 1px solid #C7D2FE;
}
.source-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; color: var(--tf-primary);
}
.source-count { font-size: 11px; color: var(--tf-primary); opacity: 0.7; }
.source-empty {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 12px; font-size: 11px; color: #D97706;
  background: #FFFBEB;
}
.source-list { max-height: 140px; overflow-y: auto; }
.source-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-bottom: 1px solid var(--tf-border); font-size: 12px;
}
.source-item:last-child { border-bottom: none; }
.source-reel {
  font-size: 10px; font-weight: 600; color: var(--tf-primary);
  background: var(--tf-primary-dim); border-radius: 4px; padding: 1px 5px;
  white-space: nowrap; flex-shrink: 0;
}
.source-title { flex: 1; color: var(--tf-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.source-words { font-size: 10px; color: var(--tf-text-3); white-space: nowrap; flex-shrink: 0; }

.ai-form { display: flex; flex-direction: column; gap: 14px; padding: 0 16px; }
.form-field { display: flex; flex-direction: column; gap: 5px; }
.form-field label { font-size: 12px; font-weight: 600; color: var(--tf-text-2); }
.optional { font-size: 11px; font-weight: 400; color: var(--tf-text-3); margin-left: 4px; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; font-weight: 600; color: var(--tf-primary); white-space: nowrap; min-width: 32px; text-align: right; }
.gen-btn { width: 100%; height: 38px !important; font-weight: 600 !important; margin-top: 4px; }

/* ── Middle ── */
.outlines-area { flex: 1; overflow-y: auto; padding: 20px 22px; min-width: 0; }
.empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 320px; }
.empty-icon-box { width: 60px; height: 60px; background: var(--tf-surface-3); border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
.empty-t { font-size: 15px; font-weight: 600; color: var(--tf-text); }
.empty-s { font-size: 13px; color: var(--tf-text-3); }
.outlines-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }

/* ── Right: Chat (same as Stage1) ── */
.chat-panel-content { background: var(--tf-surface-2); }
.chat-messages {
  flex: 1; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth;
}
.chat-welcome { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 8px; gap: 8px; }
.welcome-avatar {
  width: 48px; height: 48px;
  background: linear-gradient(135deg, var(--tf-primary) 0%, var(--tf-primary-b) 100%);
  border-radius: 14px; display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px; box-shadow: 0 4px 14px rgba(99,102,241,0.30);
}
.welcome-title { font-size: 14px; font-weight: 700; color: var(--tf-text); }
.welcome-desc  { font-size: 12px; color: var(--tf-text-3); line-height: 1.6; max-width: 220px; }
.quick-prompts { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 8px; }
.quick-btn {
  background: #fff; border: 1px solid var(--tf-border); border-radius: 8px;
  padding: 7px 12px; font-size: 12px; color: var(--tf-text-2); cursor: pointer;
  text-align: left; transition: border-color 0.15s, color 0.15s, background 0.15s; font-family: inherit;
}
.quick-btn:hover { border-color: var(--tf-primary-b); color: var(--tf-primary); background: var(--tf-primary-dim); }
.msg-row { display: flex; gap: 8px; align-items: flex-end; }
.msg-row.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 28px; height: 28px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--tf-primary) 0%, var(--tf-primary-b) 100%);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
}
.msg-bubble { max-width: 82%; padding: 10px 13px; border-radius: 12px; font-size: 13px; line-height: 1.65; word-break: break-word; }
.msg-row.user .msg-bubble { background: var(--tf-primary); color: #fff; border-bottom-right-radius: 4px; }
.msg-row.assistant .msg-bubble { background: #fff; color: var(--tf-text); border: 1px solid var(--tf-border); border-bottom-left-radius: 4px; box-shadow: var(--tf-shadow-sm); }
.msg-text { white-space: pre-wrap; }
.typing-cursor { display: inline-block; color: var(--tf-primary); animation: blink 0.9s step-end infinite; font-size: 14px; line-height: 1; margin-left: 1px; }
@keyframes blink { 50% { opacity: 0; } }
.chat-input-area {
  flex-shrink: 0; display: flex; align-items: flex-end; gap: 8px;
  padding: 10px 14px 14px; background: #fff; border-top: 1px solid var(--tf-border);
}
.chat-input {
  flex: 1; resize: none; border: 1px solid var(--tf-border); border-radius: 10px;
  padding: 9px 12px; font-size: 13px; font-family: inherit; color: var(--tf-text);
  background: var(--tf-surface-2); outline: none; line-height: 1.5;
  transition: border-color 0.18s, box-shadow 0.18s; max-height: 120px; overflow-y: auto;
}
.chat-input:focus { border-color: var(--tf-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); background: #fff; }
.chat-input::placeholder { color: var(--tf-text-3); }
.send-btn {
  width: 36px; height: 36px; flex-shrink: 0; border: none; border-radius: 10px;
  background: var(--tf-surface-3); color: var(--tf-text-3); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.18s ease;
}
.send-btn.active { background: var(--tf-primary); color: #fff; box-shadow: 0 3px 10px rgba(99,102,241,0.30); }
.send-btn.active:hover { background: var(--tf-primary-deep); transform: translateY(-1px); }
.send-btn:disabled { cursor: not-allowed; }

/* ── Edit drawer ── */
.edit-form { padding-bottom: 20px; }
.key-events-editor { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.ke-row { display: flex; align-items: flex-start; gap: 8px; }
.ke-label { width: 20px; height: 32px; line-height: 32px; text-align: center; font-weight: 700; color: var(--tf-primary); flex-shrink: 0; }
.asset-list { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.asset-item { display: flex; gap: 6px; }
</style>
