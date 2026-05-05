<template>
  <div class="ws-chat" :class="{ collapsed: isCollapsed }">
    <div class="chat-header" @click="isCollapsed = !isCollapsed">
      <span class="chat-title">🤖 AI 助手</span>
      <div class="header-actions" @click.stop>
        <span class="status-dot" :class="wsStatus" />
        <span class="status-label">{{ statusText }}</span>
        <el-button
          v-if="wsStatus === 'disconnected'"
          text size="small" style="color:white;font-size:11px;padding:0 4px"
          @click="connect"
        >重连</el-button>
        <el-icon style="color:white;cursor:pointer;margin-left:4px" @click.stop="isCollapsed = !isCollapsed">
          <ArrowDown v-if="!isCollapsed" /><ArrowUp v-else />
        </el-icon>
      </div>
    </div>

    <div v-show="!isCollapsed" class="chat-body">
      <!-- 未连接提示条 -->
      <div v-if="wsStatus !== 'connected'" class="offline-bar">
        <span>{{ wsStatus === 'connecting' ? '正在连接...' : '未连接，请确认语言模型已配置' }}</span>
        <el-button v-if="wsStatus === 'disconnected'" size="small" type="primary" plain @click="connect">
          重新连接
        </el-button>
      </div>

      <!-- 消息列表 -->
      <div ref="messagesRef" class="chat-messages">
        <div v-if="messages.length === 0" class="empty-hint">
          <p>连接后可向 AI 发出指令</p>
          <p style="color:#ccc">例：帮我生成 12 集大纲</p>
        </div>
        <div v-for="(msg, idx) in messages" :key="idx" class="message" :class="msg.role">
          <div class="message-content" v-html="renderContent(msg.content)" />
          <div v-if="msg.toolCall" class="tool-call">
            <el-tag size="small" type="warning">工具: {{ msg.toolCall }}</el-tag>
          </div>
        </div>
        <div v-if="thinking && !streaming" class="message assistant">
          <div class="message-content thinking">
            <span class="dot" /><span class="dot" /><span class="dot" />
          </div>
        </div>
        <div v-if="streaming" class="message assistant">
          <div v-if="isThinking(streamingText)" class="message-content thinking">
            <span class="dot" /><span class="dot" /><span class="dot" />
            <span style="font-size:11px;color:#aaa;margin-left:4px">思考中...</span>
          </div>
          <div v-else class="message-content streaming" v-html="renderMarkdown(streamingText) || ''" />
        </div>
      </div>

      <!-- 输入区 — 始终可编辑 -->
      <div class="chat-input">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="3"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          resize="none"
          @keydown.enter.exact.prevent="handleSend"
        />
        <div class="input-actions">
          <el-button size="small" @click="clearMessages">清空</el-button>
          <el-button
            type="primary" size="small"
            :disabled="!inputText.trim()"
            @click="handleSend"
          >发送</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { renderMarkdown, stripThink, isThinking } from '@/utils/renderMarkdown'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCall?: string
}

const props = defineProps<{
  wsUrl: string
  autoConnect?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  message: [data: unknown]
}>()

const isCollapsed = ref(false)
const messages = ref<Message[]>([])
const inputText = ref('')
const messagesRef = ref<HTMLElement>()
const wsStatus = ref<'connecting' | 'connected' | 'disconnected'>('disconnected')
const streaming = ref(false)
const streamingText = ref('')
const thinking = ref(false)

let ws: WebSocket | null = null

const statusText = computed(() => {
  if (wsStatus.value === 'connected') return '已连接'
  if (wsStatus.value === 'connecting') return '连接中'
  return '未连接'
})

function connect() {
  if (!props.wsUrl) return
  if (ws) { try { ws.close() } catch { /**/ } ws = null }
  wsStatus.value = 'connecting'

  try {
    ws = new WebSocket(props.wsUrl)
  } catch {
    wsStatus.value = 'disconnected'
    pushSystem('❌ WebSocket 地址无效')
    return
  }

  ws.onopen = () => {
    wsStatus.value = 'connected'
    scrollToBottom()
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      handleWsMessage(data)
      emit('message', data)
    } catch { /* ignore */ }
  }

  ws.onclose = (e) => {
    wsStatus.value = 'disconnected'
    if (e.reason) pushSystem(`连接关闭：${e.reason}`)
  }

  ws.onerror = () => {
    wsStatus.value = 'disconnected'
  }
}

// 后端消息格式：{ type, data }  data 字段承载实际内容
function handleWsMessage(msg: any) {
  const type: string = msg.type || msg.event || ''
  const payload = msg.data  // 后端统一用 data 字段

  switch (type) {
    case 'init':
      pushSystem('✅ 已连接，可以开始对话')
      break

    case 'stream':
      thinking.value = false
      if (!streaming.value) { streaming.value = true; streamingText.value = '' }
      streamingText.value += (typeof payload === 'string' ? payload : '')
      break

    case 'response_end':
      thinking.value = false
      if (streaming.value) {
        const finalContent = stripThink(streamingText.value)
        if (finalContent) messages.value.push({ role: 'assistant', content: finalContent })
        streaming.value = false
        streamingText.value = ''
      }
      if (typeof payload === 'string' && payload && !streaming.value) {
        const finalContent = stripThink(payload)
        if (finalContent) messages.value.push({ role: 'assistant', content: finalContent })
      }
      break

    case 'toolCall': {
      const name = typeof payload === 'object'
        ? (payload?.name || payload?.toolName || JSON.stringify(payload))
        : String(payload || '处理中')
      messages.value.push({ role: 'assistant', content: '', toolCall: name })
      break
    }

    case 'subAgentStream':
    case 'subAgentEnd':
    case 'transfer':
      // 可忽略或做简单展示
      break

    case 'notice':
      pushSystem(typeof payload === 'string' ? payload : JSON.stringify(payload))
      break

    case 'refresh':
      emit('refresh')
      pushSystem('🔄 数据已更新')
      break

    case 'shotsUpdated':
      emit('refresh')
      break

    case 'shotImageGenerateComplete':
      emit('refresh')
      pushSystem('🖼️ 分镜图已生成')
      break

    case 'shotImageGenerateStart':
      pushSystem('⏳ 开始生成分镜图...')
      break

    case 'shotImageGenerateProgress':
      break

    case 'shotImageGenerateError':
      pushSystem(`❌ 分镜图生成失败：${typeof payload === 'object' ? payload?.error : payload}`)
      break

    case 'error': {
      const errMsg = typeof payload === 'string' ? payload : JSON.stringify(payload)
      pushSystem(`❌ ${errMsg}`)
      thinking.value = false
      streaming.value = false
      break
    }
  }
  scrollToBottom()
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  if (wsStatus.value !== 'connected' || !ws) {
    ElMessage.warning('AI 助手未连接，请点击"重新连接"')
    return
  }
  messages.value.push({ role: 'user', content: text })
  thinking.value = true
  // 后端期望格式：{ type: "msg", data: { type: "user", data: "消息内容" } }
  ws.send(JSON.stringify({ type: 'msg', data: { type: 'user', data: text } }))
  inputText.value = ''
  scrollToBottom()
}

function pushSystem(content: string) {
  messages.value.push({ role: 'system', content })
}

function clearMessages() {
  messages.value = []
  streamingText.value = ''
  streaming.value = false
  thinking.value = false
}

function renderContent(content: string) {
  return renderMarkdown(content)
}

async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

watch(() => props.wsUrl, (url) => {
  if (url && props.autoConnect !== false) connect()
})

onMounted(() => {
  if (props.autoConnect !== false && props.wsUrl) connect()
})

onUnmounted(() => {
  if (ws) try { ws.close() } catch { /**/ }
})

defineExpose({ connect })
</script>

<style scoped>
.ws-chat {
  width: 320px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 10px 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.chat-title { font-weight: 600; font-size: 14px; }

.header-actions { display: flex; align-items: center; gap: 4px; }

.status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #ccc;
  flex-shrink: 0;
}
.status-dot.connected    { background: #67c23a; }
.status-dot.connecting   { background: #e6a23c; animation: pulse 1s infinite; }
.status-dot.disconnected { background: #f56c6c; }

.status-label { font-size: 11px; color: rgba(255,255,255,0.85); }

@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

.chat-body {
  display: flex;
  flex-direction: column;
  height: 480px;
}

.offline-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fef0f0;
  padding: 6px 12px;
  font-size: 12px;
  color: #f56c6c;
  flex-shrink: 0;
  gap: 8px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.empty-hint {
  color: #bbb;
  font-size: 12px;
  text-align: center;
  margin-top: 40px;
  line-height: 2;
}

.message { max-width: 92%; }
.message.user      { align-self: flex-end; }
.message.assistant,
.message.system    { align-self: flex-start; }

.message-content {
  padding: 7px 11px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
}
.message.user .message-content      { background: #409eff; color: white; }
.message.assistant .message-content { background: #f4f4f5; color: #333; }
.message.system .message-content    { background: #f0f9eb; color: #529b2e; font-size: 12px; }
.message-content.streaming          { background: #f4f4f5; }

.cursor { animation: blink 1s step-end infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

.message-content.thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #aaa;
  animation: bounce 1.2s infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }

.tool-call { margin-top: 4px; }

/* Markdown rendered content */
.message-content :deep(p) { margin: 0 0 6px; }
.message-content :deep(p:last-child) { margin-bottom: 0; }
.message-content :deep(h1),.message-content :deep(h2),.message-content :deep(h3) {
  font-size: 13px; font-weight: 700; margin: 8px 0 4px;
}
.message-content :deep(ul),.message-content :deep(ol) { padding-left: 16px; margin: 4px 0; }
.message-content :deep(li) { margin: 2px 0; }
.message-content :deep(table) {
  border-collapse: collapse; font-size: 12px; margin: 6px 0; width: 100%;
}
.message-content :deep(th),.message-content :deep(td) {
  border: 1px solid #ddd; padding: 4px 8px; text-align: left;
}
.message-content :deep(th) { background: #f0f0f0; font-weight: 600; }
.message-content :deep(code) {
  background: rgba(0,0,0,0.07); padding: 1px 4px; border-radius: 3px; font-size: 11px;
}
.message-content :deep(pre) {
  background: rgba(0,0,0,0.07); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 6px 0;
}
.message-content :deep(pre code) { background: none; padding: 0; }
.message-content :deep(blockquote) {
  border-left: 3px solid #d0d0d0; margin: 4px 0; padding-left: 10px; color: #666;
}
.message-content :deep(hr) { border: none; border-top: 1px solid #ddd; margin: 8px 0; }

.chat-input {
  padding: 8px 10px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
