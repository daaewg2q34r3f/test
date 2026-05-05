<template>
  <div class="stage-page">
    <div class="stage-toolbar">
      <h2 class="stage-title">剧本生成</h2>
      <div class="toolbar-actions">
        <el-button :loading="generatingAll" @click="generateAllScripts">
          {{ generatingAll ? `生成中 ${doneCount}/${scriptList.length}` : '一键生成所有' }}
        </el-button>
        <el-button type="primary" :disabled="!hasCompletedScript" @click="completeStage">
          完成，进入角色资产
        </el-button>
      </div>
    </div>

    <div class="stage-body" v-loading="loading">

      <!-- ① Left: Episode list (collapsible) -->
      <div class="side-panel left-panel" :class="{ collapsed: leftCollapsed }">
        <div class="panel-toggle" @click="leftCollapsed = !leftCollapsed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline v-if="!leftCollapsed" points="15 18 9 12 15 6"/>
            <polyline v-else points="9 18 15 12 9 6"/>
          </svg>
        </div>
        <div class="panel-content ep-list-content">
          <div class="panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            集数列表
          </div>
          <div class="ep-list">
            <div
              v-for="item in scriptList" :key="item.outlineId"
              class="ep-row" :class="{ active: selectedOutlineId === item.outlineId }"
              @click="selectedOutlineId = item.outlineId"
            >
              <div class="ep-row-main">
                <span class="ep-badge">第{{ item.episode }}集</span>
                <span class="ep-title">{{ item.title || '未命名' }}</span>
              </div>
              <div class="ep-status">
                <span v-if="item.status === 'done'" class="status-dot done" title="已完成"></span>
                <span v-else-if="item.status === 'generating'" class="status-dot generating" title="生成中"></span>
                <span v-else class="status-dot pending" title="待生成"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ② Middle: Script editor -->
      <div class="script-area">
        <template v-if="selectedScript">
          <!-- Outline source bar -->
          <div class="outline-bar">
            <div class="outline-bar-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="3"/></svg>
              来源大纲 · 第{{ selectedScript.episode }}集
            </div>
            <div class="outline-bar-body">
              <div v-if="selectedScript.coreConflict" class="outline-meta-item">
                <span class="meta-label">核心冲突</span>
                <span class="meta-val">{{ selectedScript.coreConflict }}</span>
              </div>
              <div v-if="selectedScript.keyEvents?.length" class="outline-meta-item">
                <span class="meta-label">起承转合</span>
                <span class="meta-val">{{ selectedScript.keyEvents.filter(Boolean).join(' → ') }}</span>
              </div>
              <div v-if="selectedScript.endingHook" class="outline-meta-item">
                <span class="meta-label">结尾悬念</span>
                <span class="meta-val">{{ selectedScript.endingHook }}</span>
              </div>
            </div>
          </div>

          <!-- Script content -->
          <div class="script-card">
            <div class="script-card-header">
              <span class="script-card-title">第{{ selectedScript.episode }}集：{{ selectedScript.title }}</span>
              <div class="script-card-actions">
                <span v-if="selectedScript.content" class="word-count">{{ selectedScript.content.length }} 字</span>
                <el-button size="small" :loading="selectedScript.status === 'generating'" @click="generateSingle(selectedScript)">
                  {{ selectedScript.content ? '重新生成' : '生成剧本' }}
                </el-button>
                <el-button size="small" type="primary" v-if="selectedScript.content" :loading="saving" @click="handleSave(selectedScript)">
                  保存
                </el-button>
              </div>
            </div>

            <!-- Streaming overlay -->
            <div v-if="selectedScript.status === 'generating'" class="script-streaming">
              <div class="streaming-text">{{ selectedScript.content }}<span class="typing-cursor">▍</span></div>
            </div>

            <!-- Always-visible editable textarea -->
            <el-input
              v-else
              v-model="selectedScript.content"
              type="textarea"
              class="script-textarea"
              placeholder="在此输入或粘贴剧本内容，也可点击右上角一键生成..."
            />
          </div>
        </template>

        <div v-else class="select-hint">
          <div class="empty-icon-box">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--tf-primary)" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </div>
          <p class="empty-t">从左侧选择集数</p>
          <p class="empty-s">点击任意集数开始编辑或生成剧本</p>
        </div>
      </div>

      <!-- ③ Right: Chat (collapsible) -->
      <div class="side-panel right-panel" :class="{ collapsed: rightCollapsed }">
        <div class="panel-toggle" @click="rightCollapsed = !rightCollapsed">
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

          <div class="chat-messages" ref="messagesEl">
            <div v-if="chatMessages.length === 0" class="chat-welcome">
              <div class="welcome-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <p class="welcome-title">剧本写作助手</p>
              <p class="welcome-desc">我可以帮你优化对白、设计场景、调整节奏，随时开聊</p>
              <div class="quick-prompts">
                <button v-for="q in quickPrompts" :key="q" class="quick-btn" @click="sendQuick(q)">{{ q }}</button>
              </div>
            </div>
            <template v-else>
              <div v-for="(msg, i) in chatMessages" :key="i" class="msg-row" :class="msg.role">
                <div v-if="msg.role === 'assistant'" class="msg-avatar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="msg-bubble">
                  <span class="msg-text" v-html="renderText(msg.content)"></span>
                  <span v-if="msg.streaming" class="typing-cursor">▍</span>
                </div>
              </div>
            </template>
          </div>

          <div class="chat-input-area">
            <textarea ref="inputEl" v-model="chatInput" class="chat-input"
              placeholder="问问剧本助手..." rows="1"
              @keydown.enter.exact.prevent="sendMessage" @input="autoResize" />
            <button class="send-btn" :class="{ active: chatInput.trim() && !isStreaming }"
              :disabled="!chatInput.trim() || isStreaming" @click="sendMessage">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { renderMarkdown } from '@/utils/renderMarkdown'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getScript, saveScript, generateScriptStream, chatScriptStream } from '@/api/script'

const emit = defineEmits<{ stageComplete: [stage: number] }>()
const route = useRoute()
const router = useRouter()
const projectId = computed(() => parseInt(route.params.id as string))

// ── Panel collapse ──
const leftCollapsed = ref(false)
const rightCollapsed = ref(false)

// ── Script list ──
interface ScriptItem {
  outlineId: number
  episode: number
  title: string
  content: string
  status: 'pending' | 'generating' | 'done'
  scriptId: number
  coreConflict: string
  keyEvents: string[]
  endingHook: string
}

const scriptList = ref<ScriptItem[]>([])
const loading = ref(false)
const saving = ref(false)
const generatingAll = ref(false)
const selectedOutlineId = ref<number | null>(null)

const selectedScript = computed(() =>
  scriptList.value.find(s => s.outlineId === selectedOutlineId.value) ?? null
)
const hasCompletedScript = computed(() => scriptList.value.some(s => s.status === 'done'))
const doneCount = computed(() => scriptList.value.filter(s => s.status === 'done').length)

// ── Chat ──
interface ChatMsg { role: 'user' | 'assistant'; content: string; streaming?: boolean }
const chatMessages = ref<ChatMsg[]>([])
const chatInput = ref('')
const isStreaming = ref(false)
const messagesEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()

const quickPrompts = [
  '如何写出有冲击力的对白',
  '场景描述怎么写才有画面感',
  '怎么让情节节奏更紧张',
  '开场白怎么写才能抓住观众',
]

// ── Load ──
async function loadData() {
  loading.value = true
  try {
    const res = await getScript(projectId.value) as any
    const rows: any[] = res.data || []
    scriptList.value = rows
      .map((r: any) => {
        const parsed = (() => { try { return JSON.parse(r.data || '{}') } catch { return {} } })()
        return {
          outlineId: r.outlineId ?? r._outlineId,
          episode: parsed.episodeIndex || 0,
          title: parsed.title || '',
          content: r.content || '',
          status: r.content ? 'done' : 'pending',
          scriptId: r.id,
          coreConflict: parsed.coreConflict || '',
          keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents : [],
          endingHook: parsed.endingHook || '',
        } as ScriptItem
      })
      .sort((a, b) => a.episode - b.episode)

    if (scriptList.value.length > 0 && !selectedOutlineId.value) {
      selectedOutlineId.value = scriptList.value[0].outlineId
    }
  } finally {
    loading.value = false
  }
}

// ── Generate single ──
async function generateSingle(item: ScriptItem) {
  if (item.status === 'generating') return
  const idx = scriptList.value.findIndex(s => s.outlineId === item.outlineId)
  if (idx === -1) return

  scriptList.value[idx].status = 'generating'
  scriptList.value[idx].content = ''

  try {
    const response = await generateScriptStream({ scriptId: item.scriptId, outlineId: item.outlineId })
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
            scriptList.value[idx].content += data.text
          } else if (data.type === 'done') {
            scriptList.value[idx].status = 'done'
            ElMessage.success(`第${item.episode}集剧本已生成`)
          } else if (data.type === 'error') {
            scriptList.value[idx].status = 'pending'
            ElMessage.error(data.text || '生成失败')
          }
        } catch { /**/ }
      }
    }
  } catch (e: any) {
    scriptList.value[idx].status = 'pending'
    ElMessage.error(e?.message || '生成失败，请重试')
  } finally {
    if (scriptList.value[idx].status === 'generating') {
      scriptList.value[idx].status = scriptList.value[idx].content ? 'done' : 'pending'
    }
  }
}

// ── Generate all ──
async function generateAllScripts() {
  generatingAll.value = true
  const pending = scriptList.value.filter(s => s.status !== 'done')
  for (const item of pending) {
    await generateSingle(item)
  }
  generatingAll.value = false
}

// ── Save ──
async function handleSave(item: ScriptItem) {
  saving.value = true
  try {
    await saveScript({ outlineId: item.outlineId, scriptId: item.scriptId, content: item.content })
    ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

function completeStage() {
  emit('stageComplete', 3)
  router.push(`/project/${projectId.value}/creation/stage4`)
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
    const response = await chatScriptStream(history)
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
    chatMessages.value[chatMessages.value.length - 1].content = '⚠️ ' + (e?.message || '请求失败')
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

onMounted(loadData)
</script>

<style scoped>
.stage-page {
  height: calc(100vh - 60px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--tf-bg);
}
.stage-toolbar {
  background: #fff; padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--tf-border); flex-shrink: 0;
}
.stage-title { font-size: 16px; font-weight: 700; color: var(--tf-text); letter-spacing: -0.01em; }
.toolbar-actions { display: flex; gap: 8px; }

.stage-body { flex: 1; display: flex; overflow: hidden; }

/* ── Side panels ── */
.side-panel {
  position: relative; display: flex; flex-direction: row; flex-shrink: 0;
  transition: width 0.28s cubic-bezier(0.4,0,0.2,1); overflow: hidden;
}
.left-panel  { width: 220px; border-right: 1px solid var(--tf-border); }
.left-panel.collapsed { width: 68px; }
.right-panel { width: 320px; border-left: 1px solid var(--tf-border); }
.right-panel.collapsed { width: 68px; }

.panel-toggle {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 20px; height: 48px;
  background: var(--tf-surface-3); border: 1px solid var(--tf-border); border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--tf-text-3); transition: background 0.15s, color 0.15s;
  z-index: 10; flex-shrink: 0;
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

/* ── Episode list ── */
.ep-list-content { background: #fff; }
.ep-list { flex: 1; overflow-y: auto; }
.ep-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--tf-surface-3);
  transition: background 0.12s; gap: 8px;
}
.ep-row:hover { background: var(--tf-surface-2); }
.ep-row.active { background: var(--tf-primary-dim); border-left: 3px solid var(--tf-primary); }
.ep-row-main { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.ep-badge { font-size: 10px; font-weight: 700; color: var(--tf-primary); }
.ep-title { font-size: 12px; color: var(--tf-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-status { flex-shrink: 0; }
.status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
}
.status-dot.done      { background: #22C55E; }
.status-dot.generating { background: #F59E0B; animation: pulse 1s infinite; }
.status-dot.pending   { background: #CBD5E1; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* ── Middle ── */
.script-area {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  padding: 16px 20px; gap: 12px; min-width: 0;
}

/* Outline source bar */
.outline-bar {
  background: var(--tf-primary-dim); border: 1px solid #C7D2FE;
  border-radius: 10px; padding: 10px 14px; flex-shrink: 0;
}
.outline-bar-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: var(--tf-primary); margin-bottom: 8px;
}
.outline-bar-body { display: flex; flex-direction: column; gap: 5px; }
.outline-meta-item { display: flex; gap: 8px; font-size: 12px; line-height: 1.5; }
.meta-label {
  font-weight: 700; color: var(--tf-primary); white-space: nowrap;
  flex-shrink: 0; min-width: 48px;
}
.meta-val { color: var(--tf-text-2); }

/* Script card */
.script-card {
  flex: 1; background: #fff; border: 1px solid var(--tf-border);
  border-radius: 12px; display: flex; flex-direction: column;
  overflow: hidden; box-shadow: var(--tf-shadow-sm);
}
.script-card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--tf-border); flex-shrink: 0;
}
.script-card-title { font-size: 14px; font-weight: 700; color: var(--tf-text); }
.script-card-actions { display: flex; align-items: center; gap: 8px; }
.word-count { font-size: 12px; color: var(--tf-text-3); }

.script-streaming {
  flex: 1; overflow-y: auto; padding: 16px;
  background: var(--tf-surface-2);
}
.streaming-text {
  font-size: 14px; line-height: 1.9; color: var(--tf-text);
  white-space: pre-wrap; font-family: inherit;
}

.script-textarea { flex: 1; }
.script-textarea :deep(.el-textarea__inner) {
  height: 100% !important; resize: none;
  font-size: 14px; line-height: 1.9; font-family: inherit;
  border: none !important; border-radius: 0 !important; box-shadow: none !important;
  padding: 16px;
}

.script-empty, .select-hint {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px;
}
.empty-icon-box {
  width: 60px; height: 60px; background: var(--tf-surface-3);
  border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;
}
.empty-t { font-size: 15px; font-weight: 600; color: var(--tf-text); }
.empty-s { font-size: 13px; color: var(--tf-text-3); }

/* typing cursor */
.typing-cursor { display: inline-block; color: var(--tf-primary); animation: blink 0.9s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* ── Right Chat (same pattern as Stage1/2) ── */
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
</style>
