import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { transportAnalystAgent } from '@/services/transportAnalystAgent'
import { useUiStore } from './uiStore'

export const useChatStore = defineStore('chat', () => {
  const conversationId = ref(`conv_${Date.now()}`)
  const messages = ref([])
  const isStreaming = ref(false)
  const isProcessing = ref(false)
  const error = ref(null)
  const context = ref({
    userRole: 'dispatcher',
    currentView: 'map',
    selectedRouteId: null,
    selectedStopId: null
  })

  const historyForApi = computed(() => {
    return messages.value
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isStreaming))
      .map(m => ({ role: m.role, content: m.content }))
      .slice(-20)
  })

  async function sendMessage(text) {
    if (!text.trim() || isProcessing.value) return

    messages.value.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      metadata: {}
    })

    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      metadata: {
        isStreaming: true,
        intent: null,
        commands: []
      }
    }
    messages.value.push(assistantMessage)

    isStreaming.value = true
    isProcessing.value = true
    error.value = null

    try {
      const result = await transportAnalystAgent.processRequest(text, context.value)

      assistantMessage.metadata.intent = result.intent
      assistantMessage.metadata.commands = result.commands
      assistantMessage.metadata.confidence = result.confidence

      await streamResponse(result.response, assistantMessage)

      if (result.intent === 'FILTER_MAP' && result.results?.[0]?.count !== undefined) {
        const uiStore = useUiStore()
        uiStore.addNotification({
          type: 'success',
          message: result.response.replace(/^✅\s*/, ''),
          duration: 5000
        })
      }
    } catch (err) {
      console.error('Chat error:', err)
      error.value = err.message
      assistantMessage.content = `Ошибка: ${err.message}`
      assistantMessage.metadata.isStreaming = false
    } finally {
      isStreaming.value = false
      isProcessing.value = false
    }
  }

  async function streamResponse(fullText, message) {
    const tokens = fullText.split(/(\s+)/)

    for (const token of tokens) {
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50))
      message.content += token
    }

    message.metadata.isStreaming = false
  }

  function clearHistory() {
    messages.value = []
    error.value = null
    conversationId.value = `conv_${Date.now()}`
  }

  function updateContext(newContext) {
    context.value = { ...context.value, ...newContext }
  }

  return {
    conversationId,
    messages,
    isStreaming,
    isProcessing,
    error,
    context,
    historyForApi,
    sendMessage,
    clearHistory,
    updateContext
  }
})
