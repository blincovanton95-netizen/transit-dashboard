<template>
  <TransitionGroup name="toast" tag="div" class="toast-container">
    <div
      v-for="notif in uiStore.notifications"
      :key="notif.id"
      class="toast"
      :class="notif.type || 'info'"
      @click="uiStore.removeNotification(notif.id)"
    >
      <span class="toast-icon">{{ icons[notif.type] || icons.info }}</span>
      <span class="toast-message">{{ notif.message }}</span>
    </div>
  </TransitionGroup>
</template>

<script setup>
import { useUiStore } from '@/stores/uiStore'

const uiStore = useUiStore()

const icons = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  font-size: 0.875rem;
  pointer-events: auto;
  cursor: pointer;
  max-width: 360px;
  border-left: 4px solid #3b82f6;
}

.toast.success { border-left-color: #22c55e; }
.toast.warning { border-left-color: #f59e0b; }
.toast.error { border-left-color: #ef4444; }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
