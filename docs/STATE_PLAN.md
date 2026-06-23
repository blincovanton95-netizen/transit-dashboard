# 🗃️ State Plan: Pinia Stores

## 📊 Обзор

stores/
├── realtimeStore.js ← ТС, координаты, инциденты (live)
├── analyticsStore.js ← Исторические данные, отчёты
├── uiStore.js ← Фильтры, слои карты, настройки UI
├── chatStore.js ← Диалог, контекст, активные команды
└── userStore.js ← Аутентификация, роль


---

## 🚌 `realtimeStore.js`

```javascript
{
  // STATE
  vehicles: Map<vehicleId, Vehicle>,  // Map для O(1) доступа
  incidents: Incident[],
  connections: {
    status: 'connecting' | 'connected' | 'disconnected',
    lastUpdate: Date,
    reconnectAttempts: number
  },
  
  // GETTERS
  vehiclesByType: (type) => [...],
  delayedVehicles: (threshold) => [...],
  vehiclesOnRoute: (routeId) => [...],
  activeIncidents: [...],
  kpi: {
    vehiclesOnLine: number,
    averageSpeed: number,
    punctuality: number,
    activeIncidents: number
  },
  
  // ACTIONS
  connectStream(),           // Подписка на SSE
  disconnectStream(),
  updateVehicle(vehicle),    // Обновление из потока
  interpolatePositions(),    // Плавное движение между точками
  addIncident(incident),
  resolveIncident(id)
}

Особенность: Используем Map вместо массива для O(1) обновления координат. При 500 ТС и обновлении каждые 5с это критично.

` analyticsStore.js `

{
  // STATE
  routeAnalytics: Map<routeId, AnalyticsData>,
  stopAnalytics: Map<stopId, AnalyticsData>,
  activeReports: Report[],
  cache: Map<cacheKey, {data, timestamp}>,  // Кэш запросов
  
  // GETTERS
  getRouteChart: (routeId, period) => chartConfig,
  getTopStops: (metric, limit) => [...],
  getHeatmapData: (timeRange) => [...],
  compareRoutes: (routeIds) => comparisonTable,
  
  // ACTIONS
  fetchRouteAnalytics(routeId, period),
  fetchStopAnalytics(stopId, period),
  generateHeatmap(timeRange),
  generateReport(query),
  exportToPDF(reportId),
  clearCache()
}

` uiStore.js `

{
  // STATE
  map: {
    center: [55.7558, 37.6173],  // Москва
    zoom: 12,
    layers: {
      vehicles: true,
      routes: true,
      stops: false,
      heatmap: false,
      incidents: true
    },
    filters: {
      vehicleTypes: ['bus', 'trolleybus', 'tram'],
      routes: [],                  // Пусто = все
      statuses: ['moving', 'stopped', 'at_stop']
    }
  },
  dashboard: {
    activeCharts: ChartConfig[],   // Графики на дашборде
    layout: 'full' | 'map-only' | 'charts-only',
    kpiCards: string[]             // Какие KPI показывать
  },
  theme: 'light' | 'dark',
  
  // GETTERS
  filteredVehicles: [...],
  visibleLayers: [...],
  
  // ACTIONS
  setMapCenter(coords),
  setMapZoom(zoom),
  toggleLayer(layerName),
  setFilter(filterType, value),
  addChart(chartConfig),
  removeChart(chartId),
  setLayout(layout),
  highlightOnMap(entityType, entityId)  // Для связи с чатом
}

` chatStore.js `

{
  // STATE
  conversationId: string,
  messages: Message[],
  isStreaming: boolean,
  isProcessing: boolean,
  error: string | null,
  context: {
    userRole: 'dispatcher' | 'analyst',
    currentView: 'map' | 'dashboard' | 'analytics',
    selectedRouteId: string | null,
    selectedStopId: string | null,
    activeFilters: Object
  },
  bookmarks: SavedQuery[],
  
  // GETTERS
  historyForApi: [...],
  activeIntents: [...],
  
  // ACTIONS
  sendMessage(text),
  confirmIntent(messageId),
  rejectIntent(messageId),
  undoLastAction(),                // Откат последнего действия бота
  clearHistory(),
  addBookmark(query),
  updateContext(ctx)
}

🔗 Взаимодействие stores

┌─────────────┐
│ chatStore   │
│ (intent)    │
└──────┬──────┘
       │ dispatch actions
       ▼
┌─────────────────────────────────────────────┐
│                                             │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ uiStore      │  │ realtimeStore    │    │
│  │ (layers,     │  │ (vehicles,       │    │
│  │  filters,    │  │  incidents)      │    │
│  │  charts)     │  │                  │    │
│  └──────────────┘  └──────────────────┘    │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ analyticsStore                       │  │
│  │ (historical data, reports)           │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

Ключевые связи:

- chatStore → uiStore.highlightOnMap() — бот подсвечивает объекты
- chatStore → uiStore.addChart() — бот добавляет графики
- chatStore → uiStore.setFilter() — бот применяет фильтры
- chatStore → analyticsStore.fetchRouteAnalytics() — бот запрашивает данные
- realtimeStore → uiStore — реактивное обновление маркеров

