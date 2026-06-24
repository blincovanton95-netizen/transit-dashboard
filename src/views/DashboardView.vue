<template>
  <div class="dashboard-container" :class="uiStore.dashboard.layout">
    <!-- Карта (основной элемент) -->
    <div class="map-section">
      <TransportMap />
    </div>

    <!-- Панель графиков (скрываемая) -->
    <Transition name="slide">
      <div v-if="uiStore.dashboard.chartsVisible" class="charts-section">
        <div class="charts-grid">
          <RouteChart
            v-for="chart in uiStore.dashboard.activeCharts"
            :key="chart.id"
            v-bind="chart"
            @close="uiStore.removeChart(chart.id)"
            @export="handleChartExport"
          />
          <div v-if="uiStore.dashboard.activeCharts.length === 0" class="empty-charts">
            <p>Попросите ассистента построить график</p>
            <div class="quick-charts">
              <button @click="quickChart('line', 'passengers', '7d')">
                📈 Загрузка за неделю
              </button>
              <button @click="quickChart('bar', 'top_stops', '7d')">
                📊 Топ остановок
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- KPI-панель -->
    <div class="kpi-section" v-if="uiStore.dashboard.kpiVisible">
      <KPICard
        v-for="kpi in kpiList"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :icon="kpi.icon"
        :trend="kpi.trend"
      />
    </div>

    <!-- Чат-ассистент -->
    <ChatWidget
      :context="chatContext"
      @action="handleChatAction"
    />

    <!-- Уведомления -->
    <NotificationToast />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import TransportMap from '@/components/TransportMap.vue'
import RouteChart from '@/components/RouteChart.vue'
import KPICard from '@/components/KPICard.vue'
import ChatWidget from '@/components/chat/ChatWidget.vue'
import NotificationToast from '@/components/NotificationToast.vue'
import { useUiStore } from '@/stores/uiStore'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useChatStore } from '@/stores/chatStore'
import { useAnalyticsStore } from '@/stores/analyticsStore'

const uiStore = useUiStore()
const realtimeStore = useRealtimeStore()
const chatStore = useChatStore()
const analyticsStore = useAnalyticsStore()

// Контекст для чат-бота
const chatContext = computed(() => ({
  userRole: 'dispatcher',
  currentView: 'map',
  selectedRouteId: uiStore.selectedRouteId,
  selectedStopId: uiStore.selectedStopId,
  activeFilters: uiStore.map.filters
}))

// KPI-метрики
const kpiList = computed(() => [
  {
    label: 'ТС на линии',
    value: realtimeStore.kpi.vehiclesOnLine,
    icon: '🚌',
    trend: 'up'
  },
  {
    label: 'Средняя скорость',
    value: `${realtimeStore.kpi.averageSpeed} км/ч`,
    icon: '⚡',
    trend: 'stable'
  },
  {
    label: 'Пунктуальность',
    value: `${realtimeStore.kpi.punctuality}%`,
    icon: '✅',
    trend: realtimeStore.kpi.punctuality > 90 ? 'up' : 'down'
  },
  {
    label: 'Инциденты',
    value: realtimeStore.kpi.activeIncidents,
    icon: '',
    trend: realtimeStore.kpi.activeIncidents > 0 ? 'down' : 'stable'
  }
])

// Обработка действий от чат-бота
function handleChatAction(action) {
  console.log('[Dashboard] Action from chat:', action)
  // Действия уже выполнены агентом через stores
  // Здесь можно добавить дополнительные эффекты (аналитика, звуки)
}

// Быстрое построение графика
async function quickChart(type, metric, period) {
  const chartData = await analyticsStore.fetchRouteAnalytics(null, period)
  uiStore.addChart(analyticsStore.toChartConfig(
    chartData,
    type,
    metric === 'passengers' ? 'Загрузка за неделю' : 'Топ остановок'
  ))
}

function handleChartExport(format) {
  console.log(`Exporting chart as ${format}`)
  // Реализация экспорта
}
</script>

<style scoped>
.dashboard-container {
  display: grid;
  grid-template-columns: 1fr 400px;
  grid-template-rows: 1fr auto;
  gap: 1rem;
  height: 100vh;
  padding: 1rem;
  background: #f8fafc;
}

.dashboard-container.map-only {
  grid-template-columns: 1fr;
}

.map-section {
  grid-row: 1 / 3;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.charts-section {
  overflow-y: auto;
  max-height: 60vh;
}

.charts-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.empty-charts {
  text-align: center;
  padding: 2rem;
  color: #64748b;
  background: white;
  border-radius: 12px;
}

.quick-charts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.quick-charts button {
  padding: 0.75rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.kpi-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>