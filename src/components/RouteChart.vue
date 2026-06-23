<template>
  <div class="chart-container">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div v-if="showActions" class="chart-actions">
        <button class="action-btn" @click="$emit('export', 'png')" title="Экспорт PNG">📷</button>
        <button class="action-btn" @click="$emit('export', 'csv')" title="Экспорт CSV">📄</button>
        <button class="action-btn" @click="$emit('close')" title="Закрыть">✕</button>
      </div>
    </div>
    <div class="chart-wrapper">
      <Line v-if="type === 'line'" :data="chartData" :options="chartOptions" />
      <Bar v-else-if="type === 'bar'" :data="chartData" :options="chartOptions" />
      <Doughnut v-else-if="type === 'doughnut'" :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line, Bar, Doughnut } from 'vue-chartjs'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps({
  type: {
    type: String,
    default: 'line',
    validator: v => ['line', 'bar', 'doughnut'].includes(v)
  },
  title: { type: String, default: 'График' },
  labels: { type: Array, required: true },
  datasets: { type: Array, required: true },
  showActions: { type: Boolean, default: true },
  yLabel: { type: String, default: '' },
  xLabel: { type: String, default: '' }
})

const emit = defineEmits(['export', 'close'])

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map(ds => ({
    ...ds,
    borderColor: ds.color || '#3b82f6',
    backgroundColor: ds.color 
      ? `${ds.color}33` 
      : 'rgba(59, 130, 246, 0.2)',
    tension: 0.3,
    fill: props.type === 'line'
  }))
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      display: props.datasets.length > 1,
      position: 'top'
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      padding: 12,
      titleFont: { size: 13 },
      bodyFont: { size: 12 }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      title: {
        display: !!props.yLabel,
        text: props.yLabel
      },
      grid: { color: 'rgba(0,0,0,0.05)' }
    },
    x: {
      title: {
        display: !!props.xLabel,
        text: props.xLabel
      },
      grid: { display: false }
    }
  }
}))
</script>

<style scoped>
.chart-container {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.chart-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.chart-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  background: #f1f5f9;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #e2e8f0;
}

.chart-wrapper {
  position: relative;
  height: 250px;
}
</style>