<template>
  <div class="stage-page">
    <!-- Toolbar -->
    <div class="stage-toolbar">
      <h2 class="stage-title">故事灵感</h2>
      <div class="toolbar-actions">
        <el-button @click="showPasteDialog = true">粘贴全文</el-button>
        <el-button icon="Plus" @click="addChapter">添加章节</el-button>
        <el-button type="primary" :disabled="chapters.length === 0" @click="completeStage">
          完成，进入大纲阶段
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
            AI 生成故事
          </div>

          <div class="ai-form">
            <div class="form-field">
              <label>故事灵感 <span class="req">*</span></label>
              <el-input v-model="aiForm.inspiration" type="textarea" :rows="3"
                placeholder="描述你的故事创意，比如：一个普通女孩穿越古代与冷酷王爷展开虐恋..." />
            </div>
            <div class="form-field">
              <label>主题 <span class="req">*</span></label>
              <el-input v-model="aiForm.theme" placeholder="如：逆袭、甜宠、复仇、穿越" />
            </div>
            <div class="form-field">
              <label>题目 <span class="req">*</span></label>
              <el-input v-model="aiForm.title" placeholder="如：《折腰》《穿越之我成了皇后》" />
            </div>
            <div class="form-field">
              <label>章节数</label>
              <div class="slider-row">
                <el-slider v-model="aiForm.chapterCount" :min="1" :max="30" :show-tooltip="false" style="flex:1" />
                <span class="slider-val">{{ aiForm.chapterCount }} 章</span>
              </div>
            </div>
            <div class="form-field">
              <label>每章字数</label>
              <div class="slider-row">
                <el-slider v-model="aiForm.wordsPerChapter" :min="100" :max="800" :step="50" :show-tooltip="false" style="flex:1" />
                <span class="slider-val">{{ aiForm.wordsPerChapter }} 字</span>
              </div>
            </div>
            <el-button type="primary" :loading="generating" :disabled="!canGenerate" class="gen-btn" @click="handleGenerate">
              <template #icon>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </template>
              {{ generating ? `已生成 ${generateProgress}/${aiForm.chapterCount} 章...` : 'AI 一键生成' }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- ② Middle: Chapter List -->
      <div class="chapters-area" v-loading="loading">
        <div v-if="chapters.length === 0" class="empty-hint">
          <div class="empty-icon-box">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--tf-primary)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <p class="empty-t">暂无章节</p>
          <p class="empty-s">使用左侧 AI 生成，或手动添加章节</p>
        </div>

        <div v-else class="chapters-list">
          <div v-for="ch in chapters" :key="ch.id" class="chapter-card" :class="{ expanded: expandedId === ch.id }">
            <div class="card-header" @click="toggleChapter(ch.id)">
              <div class="card-hl">
                <span class="reel-badge">{{ ch.reel || `第${ch.index}集` }}</span>
                <span class="ch-title">{{ ch.chapter || '未命名章节' }}</span>
                <span class="ch-words" v-if="ch.chapterData">{{ ch.chapterData.length }} 字</span>
              </div>
              <div class="card-hr">
                <button class="del-btn" @click.stop="deleteChapter(ch)" aria-label="删除">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
                <span class="chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
              </div>
            </div>
            <div class="card-body" v-show="expandedId === ch.id">
              <div class="edit-meta">
                <el-input v-model="ch.reel" placeholder="分集" style="width:120px" />
                <el-input v-model="ch.chapter" placeholder="章节标题" style="flex:1" />
              </div>
              <el-input v-model="ch.chapterData" type="textarea" placeholder="在此输入章节内容..." :rows="11" class="edit-textarea" />
              <div class="edit-footer">
                <span class="wc">{{ ch.chapterData?.length || 0 }} 字</span>
                <div style="display:flex;gap:8px">
                  <el-button size="small" @click="toggleChapter(ch.id)">收起</el-button>
                  <el-button size="small" type="primary" :loading="savingId === ch.id" @click="saveChapter(ch)">保存</el-button>
                </div>
              </div>
            </div>
          </div>
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
            剧本助手
          </div>

          <!-- Messages -->
          <div class="chat-messages" ref="messagesEl">
            <!-- Welcome -->
            <div v-if="chatMessages.length === 0" class="chat-welcome">
              <div class="welcome-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <p class="welcome-title">剧本创作助手</p>
              <p class="welcome-desc">我可以帮你构思故事、设计角色、规划情节、打磨细节，随时开聊吧</p>
              <div class="quick-prompts">
                <button v-for="q in quickPrompts" :key="q" class="quick-btn" @click="sendQuick(q)">{{ q }}</button>
              </div>
            </div>

            <!-- Message list -->
            <template v-else>
              <div v-for="(msg, i) in chatMessages" :key="i" class="msg-row" :class="msg.role">
                <div v-if="msg.role === 'assistant'" class="msg-avatar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div class="msg-bubble">
                  <span class="msg-text" v-html="renderText(msg.content)"></span>
                  <span v-if="msg.streaming" class="typing-cursor">▍</span>
                </div>
              </div>
            </template>
          </div>

          <!-- Input area -->
          <div class="chat-input-area">
            <textarea
              ref="inputEl"
              v-model="chatInput"
              class="chat-input"
              placeholder="问问剧本助手..."
              rows="1"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
            />
            <button
              class="send-btn"
              :class="{ active: chatInput.trim() && !isStreaming }"
              :disabled="!chatInput.trim() || isStreaming"
              @click="sendMessage"
              aria-label="发送"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

    </div><!-- end stage-body -->

    <!-- Paste dialog -->
    <el-dialog v-model="showPasteDialog" title="粘贴全文" width="700px">
      <p style="color:var(--tf-text-3);margin-bottom:12px;font-size:13px">将原文粘贴到下方，系统将自动按章节切割</p>
      <el-input v-model="pasteText" type="textarea" :rows="16" placeholder="在此粘贴小说原文..." />
      <template #footer>
        <el-button @click="showPasteDialog = false">取消</el-button>
        <el-button type="primary" :loading="splitting" @click="splitChapters">自动切割章节</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onMounted } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getNovel, addNovel, updateNovel, delNovel, generateNovelStream, chatNovelStream } from '@/api/novel'
import type { NovelChapter } from '@/api/novel'

const emit = defineEmits<{ stageComplete: [stage: number] }>()
const route = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(route.params.id as string))

// ── Panel collapse state ──
const leftCollapsed  = ref(false)
const rightCollapsed = ref(false)

// ── Chapters ──
const chapters  = ref<NovelChapter[]>([])
const expandedId = ref<number | null>(null)
const loading   = ref(false)
const savingId  = ref<number | null>(null)

// ── AI Generation form ──
const aiForm = reactive({ inspiration: '', theme: '', title: '', chapterCount: 6, wordsPerChapter: 300 })
const generating = ref(false)
const generateProgress = ref(0)
const canGenerate = computed(() => aiForm.inspiration.trim() && aiForm.theme.trim() && aiForm.title.trim())

// ── Paste dialog ──
const showPasteDialog = ref(false)
const pasteText  = ref('')
const splitting  = ref(false)

// ── Chat ──
interface ChatMsg { role: 'user' | 'assistant'; content: string; streaming?: boolean }
const chatMessages = ref<ChatMsg[]>([])
const chatInput  = ref('')
const isStreaming = ref(false)
const messagesEl = ref<HTMLElement>()
const inputEl    = ref<HTMLTextAreaElement>()

const quickPrompts = [
  '帮我想一个爆款短剧选题',
  '如何设计让观众上头的主角',
  '第一章怎么写才能抓住眼球',
  '推荐几种常见的爽文结构',
]

// ── Chapter methods ──
async function loadChapters() {
  loading.value = true
  try {
    const res = await getNovel(projectId.value) as any
    chapters.value = res.data || []
  } finally { loading.value = false }
}

function toggleChapter(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}

async function addChapter() {
  const idx = chapters.value.length + 1
  await addNovel(projectId.value, [{ index: idx, reel: `第${idx}集`, chapter: `第${idx}章`, chapterData: '' }])
  await loadChapters()
  if (chapters.value.length > 0) expandedId.value = chapters.value[chapters.value.length - 1].id
}

async function saveChapter(ch: NovelChapter) {
  savingId.value = ch.id
  try {
    await updateNovel({ id: ch.id, index: ch.index, reel: ch.reel, chapter: ch.chapter, chapterData: ch.chapterData })
    ElMessage.success('保存成功')
    expandedId.value = null
  } finally { savingId.value = null }
}

async function deleteChapter(ch: NovelChapter) {
  await ElMessageBox.confirm(`确认删除"${ch.chapter}"？`, '删除确认', { type: 'warning' })
  await delNovel(ch.id)
  chapters.value = chapters.value.filter(c => c.id !== ch.id)
  if (expandedId.value === ch.id) expandedId.value = null
  ElMessage.success('已删除')
}

// ── AI Generate ──
async function handleGenerate() {
  if (!canGenerate.value) return
  generating.value = true
  generateProgress.value = 0

  try {
    const response = await generateNovelStream({ projectId: projectId.value, ...aiForm })
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
          if (data.type === 'chapter') {
            chapters.value.push(data.chapter)
            generateProgress.value++
          } else if (data.type === 'done') {
            ElMessage.success(`AI 已生成 ${data.count} 个章节`)
          } else if (data.type === 'error') {
            ElMessage.error(data.text || 'AI 生成失败')
          }
        } catch { /* ignore */ }
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.message || 'AI 生成失败，请重试')
  } finally {
    generating.value = false
    generateProgress.value = 0
  }
}

// ── Paste & split ──
async function splitChapters() {
  if (!pasteText.value.trim()) return
  splitting.value = true
  try {
    const lines = pasteText.value.split('\n')
    const re = /^(第[一二三四五六七八九十百千\d]+[章节回集]|Chapter\s*\d+)/i
    const groups: Array<{ chapter: string; content: string }> = []
    let cur: { chapter: string; content: string } | null = null
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      if (re.test(t)) { if (cur) groups.push(cur); cur = { chapter: t, content: '' } }
      else { if (!cur) cur = { chapter: '序章', content: '' }; cur.content += line + '\n' }
    }
    if (cur && (cur.content.trim() || cur.chapter !== '序章')) groups.push(cur)
    if (groups.length === 0) groups.push({ chapter: '全文', content: pasteText.value })
    const si = chapters.value.length + 1
    await addNovel(projectId.value, groups.map((g, i) => ({ index: si + i, reel: `第${si + i}集`, chapter: g.chapter, chapterData: g.content.trim() })))
    await loadChapters()
    showPasteDialog.value = false; pasteText.value = ''
    ElMessage.success(`已创建 ${groups.length} 个章节`)
  } finally { splitting.value = false }
}

function completeStage() {
  emit('stageComplete', 1)
  router.push(`/project/${projectId.value}/creation/stage2`)
}

const renderText = renderMarkdown

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
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
  if (inputEl.value) { inputEl.value.style.height = 'auto' }
  await scrollToBottom()

  // Add empty assistant message that will be streamed into
  chatMessages.value.push({ role: 'assistant', content: '', streaming: true })
  isStreaming.value = true
  await scrollToBottom()

  // Always access via reactive array to trigger Vue updates
  const lastIdx = () => chatMessages.value.length - 1

  try {
    const history = chatMessages.value
      .slice(0, -1)  // exclude the empty assistant placeholder
      .map(m => ({ role: m.role, content: m.content }))

    const response = await chatNovelStream(history)
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
            chatMessages.value[lastIdx()].content += data.text
            await scrollToBottom()
          } else if (data.type === 'done') {
            chatMessages.value[lastIdx()].streaming = false
          } else if (data.type === 'error') {
            chatMessages.value[lastIdx()].content = '⚠️ ' + data.text
            chatMessages.value[lastIdx()].streaming = false
          }
        } catch { /* ignore parse errors */ }
      }
    }
  } catch (e: any) {
    chatMessages.value[lastIdx()].content = '⚠️ 请求失败：' + (e?.message || '未知错误')
  } finally {
    chatMessages.value[lastIdx()].streaming = false
    isStreaming.value = false
    await scrollToBottom()
  }
}

function sendQuick(q: string) {
  chatInput.value = q
  sendMessage()
}

onMounted(loadChapters)
</script>

<style scoped>
.stage-page {
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--tf-bg);
}

/* ── Toolbar ── */
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

/* ── Body ── */
.stage-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Side panels ── */
.side-panel {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  transition: width 0.28s cubic-bezier(0.4,0,0.2,1);
  overflow: hidden;
}

.left-panel {
  width: 290px;
  border-right: 1px solid var(--tf-border);
}
.left-panel.collapsed { width: 68px; }

.right-panel {
  width: 320px;
  border-left: 1px solid var(--tf-border);
}
.right-panel.collapsed { width: 68px; }

/* Toggle button */
.panel-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 48px;
  background: var(--tf-surface-3);
  border: 1px solid var(--tf-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--tf-text-3);
  transition: background 0.15s, color 0.15s;
  z-index: 10;
  flex-shrink: 0;
}
.left-panel .panel-toggle  { right: -10px; }
.right-panel .panel-toggle { left: -10px; }
.panel-toggle:hover { background: var(--tf-primary-dim); color: var(--tf-primary); }

/* Panel inner content */
.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  opacity: 1;
  transition: opacity 0.18s;
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
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  color: var(--tf-primary);
  padding: 16px 16px 12px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

/* ── Left: AI form ── */
.left-panel .panel-content {
  background: #fff;
  overflow-y: auto;
  padding-bottom: 16px;
}

.ai-form { display: flex; flex-direction: column; gap: 14px; padding: 0 16px; }

.form-field { display: flex; flex-direction: column; gap: 5px; }
.form-field label { font-size: 12px; font-weight: 600; color: var(--tf-text-2); }
.req { color: var(--tf-error); }

.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; font-weight: 600; color: var(--tf-primary); white-space: nowrap; min-width: 32px; text-align: right; }

.gen-btn { width: 100%; height: 38px !important; font-weight: 600 !important; margin-top: 4px; }

/* ── Middle: chapters ── */
.chapters-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
  min-width: 0;
}

.empty-hint { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 320px; }
.empty-icon-box { width: 60px; height: 60px; background: var(--tf-surface-3); border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
.empty-t { font-size: 15px; font-weight: 600; color: var(--tf-text); }
.empty-s { font-size: 13px; color: var(--tf-text-3); }

.chapters-list { display: flex; flex-direction: column; gap: 10px; }

.chapter-card {
  background: #fff; border: 1px solid var(--tf-border); border-radius: 12px;
  overflow: hidden; transition: border-color 0.18s, box-shadow 0.18s;
  box-shadow: var(--tf-shadow-sm);
}
.chapter-card:hover { border-color: var(--tf-border-a); }
.chapter-card.expanded { border-color: var(--tf-primary-b); box-shadow: 0 0 0 3px rgba(99,102,241,0.10), var(--tf-shadow-md); }

.card-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; cursor: pointer; user-select: none; gap: 10px; }
.card-hl { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; }
.reel-badge { font-size: 11px; font-weight: 600; color: var(--tf-primary); background: var(--tf-primary-dim); border: 1px solid #C7D2FE; border-radius: 5px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0; }
.ch-title { font-size: 14px; font-weight: 600; color: var(--tf-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ch-words { font-size: 11px; color: var(--tf-text-3); white-space: nowrap; flex-shrink: 0; }
.card-hr { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.del-btn { width: 26px; height: 26px; border: none; background: none; color: var(--tf-text-3); cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; opacity: 0; }
.chapter-card:hover .del-btn { opacity: 1; }
.del-btn:hover { background: #FEE2E2; color: #EF4444; }
.chevron { display: flex; align-items: center; color: var(--tf-text-3); transition: transform 0.22s; }
.chapter-card.expanded .chevron { transform: rotate(180deg); }

.card-body { border-top: 1px solid var(--tf-border); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: var(--tf-surface-2); }
.edit-meta { display: flex; gap: 8px; }
.edit-textarea :deep(.el-textarea__inner) { font-size: 14px; line-height: 1.8; resize: none; min-height: 200px; }
.edit-footer { display: flex; align-items: center; justify-content: space-between; }
.wc { font-size: 12px; color: var(--tf-text-3); }

/* ── Right: Chat ── */
.chat-panel-content {
  background: var(--tf-surface-2);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;
}

/* Welcome screen */
.chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 8px;
  gap: 8px;
}
.welcome-avatar {
  width: 48px; height: 48px;
  background: linear-gradient(135deg, var(--tf-primary) 0%, var(--tf-primary-b) 100%);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
  box-shadow: 0 4px 14px rgba(99,102,241,0.30);
}
.welcome-title { font-size: 14px; font-weight: 700; color: var(--tf-text); }
.welcome-desc  { font-size: 12px; color: var(--tf-text-3); line-height: 1.6; max-width: 220px; }

.quick-prompts { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 8px; }
.quick-btn {
  background: #fff;
  border: 1px solid var(--tf-border);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--tf-text-2);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  font-family: inherit;
}
.quick-btn:hover { border-color: var(--tf-primary-b); color: var(--tf-primary); background: var(--tf-primary-dim); }

/* Message rows */
.msg-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.msg-row.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 28px; height: 28px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--tf-primary) 0%, var(--tf-primary-b) 100%);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}

.msg-bubble {
  max-width: 82%;
  padding: 10px 13px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}

.msg-row.user .msg-bubble {
  background: var(--tf-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg-row.assistant .msg-bubble {
  background: #fff;
  color: var(--tf-text);
  border: 1px solid var(--tf-border);
  border-bottom-left-radius: 4px;
  box-shadow: var(--tf-shadow-sm);
}

.msg-text { white-space: pre-wrap; }

/* Typing cursor */
.typing-cursor {
  display: inline-block;
  color: var(--tf-primary);
  animation: blink 0.9s step-end infinite;
  font-size: 14px;
  line-height: 1;
  margin-left: 1px;
}
@keyframes blink { 50% { opacity: 0; } }

/* Input area */
.chat-input-area {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 14px 14px;
  background: #fff;
  border-top: 1px solid var(--tf-border);
}

.chat-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--tf-border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--tf-text);
  background: var(--tf-surface-2);
  outline: none;
  line-height: 1.5;
  transition: border-color 0.18s, box-shadow 0.18s;
  max-height: 120px;
  overflow-y: auto;
}
.chat-input:focus {
  border-color: var(--tf-primary);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
  background: #fff;
}
.chat-input::placeholder { color: var(--tf-text-3); }

.send-btn {
  width: 36px; height: 36px; flex-shrink: 0;
  border: none; border-radius: 10px;
  background: var(--tf-surface-3);
  color: var(--tf-text-3);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s ease;
}
.send-btn.active {
  background: var(--tf-primary);
  color: #fff;
  box-shadow: 0 3px 10px rgba(99,102,241,0.30);
}
.send-btn.active:hover {
  background: var(--tf-primary-deep);
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(99,102,241,0.35);
}
.send-btn:disabled { cursor: not-allowed; }
</style>
