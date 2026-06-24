<template>
  <div class="chat-widget" :class="{ open: isOpen, minimized: isMinimized }">
    <button class="chat-toggle" @click="toggleOpen" :title="isOpen ? 'Свернуть чат' : 'Открыть чат'">
      <span class="toggle-icon">{{ isOpen ? '✕' : '🤖' }}</span>
      <span v-if="!isOpen" class="toggle-label">Ассистент</span>
    </button>

    <div v-if="isOpen" class="chat-panel">
      <header class="chat-header">
        <div>
          <h3>Транспортный аналитик</h3>
          <p class="chat-subtitle">Спросите о карте, графиках или метриках</p>
        </div>
        <button class="header-btn" @click="isMinimized = !isMinimized" title="Свернуть">—</button>
      </header>

      <div v-show="!isMinimized" class="chat-body">
        <div ref="messagesEl" class="messages">
          <div v-if="chatStore.messages.length === 0" class="welcome">
            <p>Привет! Я помогу с мониторингом транспорта.</p>
            <div class="suggestions">
              <button
                v-for="s in suggestions"
                :key="s"
                @click="sendSuggestion(s)"
              >{{ s }}</button>
            </div>
          </div>

          <div
            v-for="msg in chatStore.messages"
            :key="msg.id"
            class="message"
            :class="msg.role"
          >
            <div class="message-bubble">
              <span v-if="msg.metadata?.isStreaming && !msg.content" class="typing">...</span>
              <span v-else class="message-text">{{ msg.content }}</span>
            </div>
            <span v-if="msg.metadata?.intent && msg.role === 'assistant'" class="intent-badge">
              {{ msg.metadata.intent }}
            </span>
          </div>
        </div>

        <form class="chat-input" @submit.prevent="handleSubmit">
          <input
            v-model="inputText"
            type="text"
            placeholder="Например: покажи трамваи на северо-западе"
            :disabled="chatStore.isProcessing"
          />
          <button type="submit" :disabled="!inputText.trim() || chatStore.isProcessing">
            {{ chatStore.isProcessing ? '...' : '→' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useChatStore } from '@/stores/chatStore'

const props = defineProps({
  context: { type: Object, default: () => ({}) }
})

defineEmits(['action'])

const chatStore = useChatStore()
const isOpen = ref(true)
const isMinimized = ref(false)
const inputText = ref('')
const messagesEl = ref(null)

const suggestions = [
  'Покажи трамваи на северо-западе',
  'Где пробки?',
  'Сколько автобусов на линии?',
  'Помощь'
]

watch(() => props.context, (ctx) => {
  chatStore.updateContext(ctx)
}, { deep: true, immediate: true })

watch(() => chatStore.messages.length, async () => {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
})

function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value) isMinimized.value = false
}

function handleSubmit() {
  if (!inputText.value.trim()) return
  chatStore.sendMessage(inputText.value)
  inputText.value = ''
}

function sendSuggestion(text) {
  chatStore.sendMessage(text)
}
</script>

<style scoped>
.chat-widget {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.chat-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 24px;
  padding: 0.75rem 1.25rem;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
  font-size: 0.875rem;
  font-weight: 600;
}

.chat-widget.open .chat-toggle {
  position: absolute;
  top: -3rem;
  right: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  justify-content: center;
}

.chat-panel {
  width: 380px;
  max-height: 520px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1rem 0.75rem;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
}

.chat-header h3 {
  margin: 0;
  font-size: 1rem;
}

.chat-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  opacity: 0.85;
}

.header-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
}

.chat-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.welcome {
  text-align: center;
  color: #64748b;
  font-size: 0.875rem;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.suggestions button {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
  color: #334155;
}

.suggestions button:hover {
  background: #e2e8f0;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-bubble {
  padding: 0.625rem 0.875rem;
  border-radius: 12px;
  font-size: 0.875rem;
  line-height: 1.4;
  white-space: pre-wrap;
}

.message.user .message-bubble {
  background: #3b82f6;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-bubble {
  background: #f1f5f9;
  color: #0f172a;
  border-bottom-left-radius: 4px;
}

.intent-badge {
  font-size: 0.65rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}

.typing {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.chat-input {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1px solid #e2e8f0;
}

.chat-input input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
}

.chat-input input:focus {
  border-color: #3b82f6;
}

.chat-input button {
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  width: 40px;
  cursor: pointer;
  font-size: 1rem;
}

.chat-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
