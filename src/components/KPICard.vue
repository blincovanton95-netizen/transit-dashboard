<template>
  <div class="kpi-card" :class="trend">
    <div class="kpi-icon">{{ icon }}</div>
    <div class="kpi-content">
      <span class="kpi-value">{{ value }}</span>
      <span class="kpi-label">{{ label }}</span>
    </div>
    <span v-if="trend !== 'stable'" class="trend-indicator">
      {{ trend === 'up' ? '↑' : '↓' }}
    </span>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  icon: { type: String, default: '📊' },
  trend: { type: String, default: 'stable', validator: v => ['up', 'down', 'stable'].includes(v) }
})
</script>

<style scoped>
.kpi-card {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  position: relative;
}

.kpi-icon {
  font-size: 1.5rem;
}

.kpi-content {
  display: flex;
  flex-direction: column;
}

.kpi-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}

.kpi-label {
  font-size: 0.75rem;
  color: #64748b;
}

.trend-indicator {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.75rem;
}

.kpi-card.up .trend-indicator { color: #22c55e; }
.kpi-card.down .trend-indicator { color: #ef4444; }
</style>
