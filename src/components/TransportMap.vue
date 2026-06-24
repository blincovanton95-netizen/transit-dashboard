<template>
  <div class="transport-map" ref="mapContainer">
    <div ref="leafletMap" class="map-canvas"></div>
    
    <!-- Панель управления слоями -->
    <div class="layer-controls">
      <label v-for="layer in availableLayers" :key="layer.id" class="layer-toggle">
        <input 
          type="checkbox" 
          :checked="uiStore.map.layers[layer.id]"
          @change="uiStore.toggleLayer(layer.id)"
        />
        <span :style="{ color: layer.color }">{{ layer.icon }} {{ layer.name }}</span>
      </label>
    </div>

    <!-- Счётчик ТС -->
    <div class="vehicle-counter">
      <div class="counter-item">
        <span class="counter-value">{{ visibleCount }}</span>
        <span class="counter-label">{{ filterLabel }}</span>
      </div>
      <div class="counter-item">
        <span class="counter-value warning">{{ delayedCount }}</span>
        <span class="counter-label">Опаздывает</span>
      </div>
    </div>

    <!-- Статус подключения -->
    <div class="connection-status" :class="connectionStatus">
      <span class="status-dot"></span>
      {{ statusText }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { useRealtimeStore } from '@/stores/realtimeStore'
import { useUiStore, MOSCOW_REGIONS } from '@/stores/uiStore'

const realtimeStore = useRealtimeStore()
const uiStore = useUiStore()

const mapContainer = ref(null)
const leafletMap = ref(null)
let map = null
let markersLayer = null
let animationFrameId = null

// ============================================
// КОНФИГУРАЦИЯ ИКОНОК
// ============================================

const vehicleIcons = {
  bus: L.divIcon({
    className: 'vehicle-icon bus',
    html: '<div class="icon-bubble bus">🚌</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  }),
  trolleybus: L.divIcon({
    className: 'vehicle-icon trolleybus',
    html: '<div class="icon-bubble trolleybus">🚎</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  }),
  tram: L.divIcon({
    className: 'vehicle-icon tram',
    html: '<div class="icon-bubble tram">🚊</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  })
}

const statusColors = {
  moving: '#22c55e',
  stopped: '#ef4444',
  at_stop: '#f59e0b',
  delayed: '#dc2626'
}

const availableLayers = [
  { id: 'vehicles', name: 'Транспорт', icon: '🚌', color: '#3b82f6' },
  { id: 'routes', name: 'Маршруты', icon: '🛣️', color: '#22c55e' },
  { id: 'stops', name: 'Остановки', icon: '', color: '#f59e0b' },
  { id: 'incidents', name: 'Инциденты', icon: '️', color: '#ef4444' }
]

// ============================================
// COMPUTED
// ============================================

const delayedCount = computed(() => {
  let count = 0
  realtimeStore.vehicles.forEach(v => {
    if (v.delay > 300 && uiStore.matchesFilters(v)) count++
  })
  return count
})

const visibleCount = computed(() => uiStore.filteredVehicleCount)

const filterLabel = computed(() => {
  const region = uiStore.map.filters.region
  if (region && MOSCOW_REGIONS[region]) {
    return `ТС (${MOSCOW_REGIONS[region].name})`
  }
  return 'ТС на карте'
})

const connectionStatus = computed(() => realtimeStore.connection.status)

const statusText = computed(() => {
  const map = {
    connecting: 'Подключение...',
    connected: 'Онлайн',
    disconnected: 'Оффлайн'
  }
  return map[connectionStatus.value] || 'Неизвестно'
})

// ============================================
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ============================================

function initMap() {
  map = L.map(leafletMap.value, {
    center: uiStore.map.center,
    zoom: uiStore.map.zoom,
    zoomControl: true,
    attributionControl: false
  })

  // Базовый слой — OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map)

  // 🔹 КРИТИЧНО: Используем кластеризацию для производительности
  markersLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount()
      return L.divIcon({
        html: `<div class="cluster-icon">${count}</div>`,
        className: 'marker-cluster-custom',
        iconSize: [40, 40]
      })
    }
  }).addTo(map)

  // Сохранение позиции карты в UI store
  map.on('moveend', () => {
    const center = map.getCenter()
    uiStore.setMapCenter([center.lat, center.lng])
    uiStore.setMapZoom(map.getZoom())
  })

  // Подписка на подсветку от чат-бота
  realtimeStore.$onAction(({ name, args }) => {
    if (name === 'highlightVehicle') {
      const [vehicleId] = args
      highlightVehicleOnMap(vehicleId)
    }
  })
}

// ============================================
// УПРАВЛЕНИЕ МАРКЕРАМИ
// ============================================

/**
 * 🔹 КРИТИЧНО: Используем Map для O(1) доступа к маркерам
 * Не пересоздаём маркеры при каждом обновлении — только двигаем
 */
const markerCache = new Map() // vehicleId -> L.Marker

function updateMarkers() {
  if (!markersLayer) return

  const currentVehicleIds = new Set()

  // Обновляем или создаём маркеры
  realtimeStore.vehicles.forEach((vehicle, id) => {
    currentVehicleIds.add(id)
    
    // Проверяем фильтры
    if (!shouldShowVehicle(vehicle)) {
      if (markerCache.has(id)) {
        markersLayer.removeLayer(markerCache.get(id))
        markerCache.delete(id)
      }
      return
    }

    if (markerCache.has(id)) {
      // 🔹 ОПТИМИЗАЦИЯ: двигаем существующий маркер, а не пересоздаём
      const marker = markerCache.get(id)
      marker.setLatLng([vehicle.coordinates.lat, vehicle.coordinates.lon])
      marker.setIcon(getIconForVehicle(vehicle))
      updateMarkerPopup(marker, vehicle)
    } else {
      // Создаём новый маркер
      const marker = L.marker(
        [vehicle.coordinates.lat, vehicle.coordinates.lon],
        { icon: getIconForVehicle(vehicle) }
      )
      
      bindMarkerEvents(marker, vehicle)
      updateMarkerPopup(marker, vehicle)
      
      markersLayer.addLayer(marker)
      markerCache.set(id, marker)
    }
  })

  // Удаляем маркеры для исчезнувших ТС
  markerCache.forEach((marker, id) => {
    if (!currentVehicleIds.has(id)) {
      markersLayer.removeLayer(marker)
      markerCache.delete(id)
    }
  })
}

function shouldShowVehicle(vehicle) {
  return uiStore.matchesFilters(vehicle)
}

function getIconForVehicle(vehicle) {
  const baseIcon = vehicleIcons[vehicle.type] || vehicleIcons.bus
  
  // Добавляем индикатор задержки
  const isDelayed = vehicle.delay > 300
  const color = isDelayed ? statusColors.delayed : statusColors[vehicle.status]
  
  return L.divIcon({
    className: 'vehicle-icon',
    html: `
      <div class="icon-bubble ${vehicle.type}" style="border-color: ${color}">
        ${vehicle.type === 'bus' ? '🚌' : vehicle.type === 'trolleybus' ? '🚎' : '🚊'}
        ${isDelayed ? '<span class="delay-badge">!</span>' : ''}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  })
}

function updateMarkerPopup(marker, vehicle) {
  const popupContent = `
    <div class="vehicle-popup">
      <div class="popup-header">
        <strong>${vehicle.type === 'bus' ? 'Автобус' : vehicle.type === 'trolleybus' ? 'Троллейбус' : 'Трамвай'} ${vehicle.routeId}</strong>
        <span class="status-badge" style="background: ${statusColors[vehicle.status]}">
          ${getStatusLabel(vehicle.status)}
        </span>
      </div>
      <div class="popup-body">
        <div class="info-row">
          <span>Гос. номер:</span>
          <strong>${vehicle.stateNumber}</strong>
        </div>
        <div class="info-row">
          <span>Скорость:</span>
          <strong>${vehicle.coordinates.speed.toFixed(1)} км/ч</strong>
        </div>
        <div class="info-row">
          <span>Загруженность:</span>
          <strong>${vehicle.occupancy}%</strong>
        </div>
        <div class="info-row">
          <span>Отставание:</span>
          <strong class="${vehicle.delay > 0 ? 'delayed' : 'on-time'}">
            ${vehicle.delay > 0 ? `+${Math.round(vehicle.delay / 60)} мин` : 'По графику'}
          </strong>
        </div>
      </div>
    </div>
  `
  marker.bindPopup(popupContent, { className: 'vehicle-popup-container' })
}

function bindMarkerEvents(marker, vehicle) {
  marker.on('click', () => {
    uiStore.selectVehicle(vehicle.id)
  })
}

function highlightVehicleOnMap(vehicleId) {
  const marker = markerCache.get(vehicleId)
  if (!marker) return
  
  // Подсветка маркера
  const element = marker.getElement()
  if (element) {
    element.classList.add('highlighted')
    setTimeout(() => element.classList.remove('highlighted'), 3000)
  }
  
  // Центрирование карты на маркере
  map.flyTo(marker.getLatLng(), 15, { duration: 1 })
  marker.openPopup()
}

function getStatusLabel(status) {
  const labels = {
    moving: 'В пути',
    stopped: 'Остановлен',
    at_stop: 'На остановке',
    out_of_service: 'Не на линии'
  }
  return labels[status] || status
}

// ============================================
// АНИМАЦИЯ ПЛАВНОГО ДВИЖЕНИЯ
// ============================================

/**
 *  КРИТИЧНО: Интерполяция координат между обновлениями из потока
 * Без этого маркеры будут "прыгать" каждые 5 секунд
 */
function startAnimation() {
  let lastUpdate = Date.now()
  
  function animate() {
    const now = Date.now()
    const elapsed = now - lastUpdate
    
    // Обновляем позиции каждые 100мс (плавно)
    if (elapsed > 100) {
      updateMarkers()
      lastUpdate = now
    }
    
    animationFrameId = requestAnimationFrame(animate)
  }
  
  animationFrameId = requestAnimationFrame(animate)
}

// ============================================
// LIFECYCLE
// ============================================

onMounted(() => {
  initMap()
  realtimeStore.connectStream()
  startAnimation()
})

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  realtimeStore.disconnectStream()
  if (map) map.remove()
  markerCache.clear()
})

// Реакция на изменение фильтров и региона
watch(() => uiStore.map.filters, () => {
  updateMarkers()
}, { deep: true })

watch(() => uiStore.map.fitBounds, (bounds) => {
  if (!map || !bounds) return
  const leafletBounds = L.latLngBounds(
    [bounds.south, bounds.west],
    [bounds.north, bounds.east]
  )
  map.flyToBounds(leafletBounds, { padding: [40, 40], duration: 1.2 })
}, { deep: true })

// Реакция на изменение слоёв
watch(() => uiStore.map.layers, () => {
  // Обновляем видимость слоёв (routes, stops и т.д.)
  // Реализация зависит от конкретных слоёв
}, { deep: true })
</script>

<style scoped>
.transport-map {
  position: relative;
  width: 100%;
  height: 100%;
  background: #f8fafc;
}

.map-canvas {
  width: 100%;
  height: 100%;
  z-index: 1;
}

/* Панель управления слоями */
.layer-controls {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: white;
  padding: 0.75rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.layer-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}

/* Счётчик ТС */
.vehicle-counter {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  gap: 1rem;
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
}

.counter-item {
  text-align: center;
}

.counter-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #3b82f6;
}

.counter-value.warning {
  color: #ef4444;
}

.counter-label {
  font-size: 0.75rem;
  color: #64748b;
}

/* Статус подключения */
.connection-status {
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  padding: 0.5rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.connection-status.connected .status-dot {
  background: #22c55e;
  animation: pulse 2s infinite;
}

.connection-status.disconnected .status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Иконки транспорта */
:deep(.vehicle-icon) {
  background: transparent !important;
  border: none !important;
}

:deep(.icon-bubble) {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: white;
  border: 3px solid #22c55e;
  display: grid;
  place-items: center;
  font-size: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  transition: transform 0.2s;
  position: relative;
}

:deep(.icon-bubble:hover) {
  transform: scale(1.2);
  z-index: 1000;
}

:deep(.icon-bubble.highlighted) {
  animation: highlight-pulse 1s ease-in-out 3;
}

@keyframes highlight-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  50% { transform: scale(1.3); box-shadow: 0 0 20px rgba(59, 130, 246, 0.8); }
}

:deep(.delay-badge) {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  background: #ef4444;
  color: white;
  border-radius: 50%;
  font-size: 10px;
  font-weight: bold;
  display: grid;
  place-items: center;
}

/* Кластеры */
:deep(.marker-cluster-custom) {
  background: transparent !important;
}

:deep(.cluster-icon) {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.8);
  color: white;
  display: grid;
  place-items: center;
  font-weight: bold;
  font-size: 14px;
  border: 3px solid white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

/* Popup стили */
:deep(.vehicle-popup-container) {
  min-width: 220px;
}

:deep(.vehicle-popup) {
  font-family: system-ui, sans-serif;
}

:deep(.popup-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
}

:deep(.status-badge) {
  padding: 2px 8px;
  border-radius: 12px;
  color: white;
  font-size: 0.7rem;
  font-weight: 500;
}

:deep(.info-row) {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
  font-size: 0.85rem;
}

:deep(.info-row span:first-child) {
  color: #64748b;
}

:deep(.delayed) {
  color: #ef4444;
  font-weight: 600;
}

:deep(.on-time) {
  color: #22c55e;
}
</style>