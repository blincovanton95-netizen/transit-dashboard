import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRealtimeStore } from './realtimeStore'

/** Географические регионы Москвы (границы lat/lon) */
export const MOSCOW_REGIONS = {
  northwest: {
    name: 'Северо-Запад',
    bounds: { south: 55.76, north: 55.82, west: 37.45, east: 37.58 },
    center: [55.79, 37.515],
    zoom: 13
  },
  northeast: {
    name: 'Северо-Восток',
    bounds: { south: 55.76, north: 55.82, west: 37.58, east: 37.72 },
    center: [55.79, 37.65],
    zoom: 13
  },
  southwest: {
    name: 'Юго-Запад',
    bounds: { south: 55.68, north: 55.76, west: 37.45, east: 37.58 },
    center: [55.72, 37.515],
    zoom: 13
  },
  southeast: {
    name: 'Юго-Восток',
    bounds: { south: 55.68, north: 55.76, west: 37.58, east: 37.72 },
    center: [55.72, 37.65],
    zoom: 13
  },
  center: {
    name: 'Центр',
    bounds: { south: 55.73, north: 55.77, west: 37.58, east: 37.65 },
    center: [55.7558, 37.6173],
    zoom: 14
  }
}

export const useUiStore = defineStore('ui', () => {
  const map = ref({
    center: [55.7558, 37.6173],
    zoom: 12,
    layers: {
      vehicles: true,
      routes: false,
      stops: false,
      heatmap: false,
      incidents: true
    },
    filters: {
      vehicleTypes: ['bus', 'trolleybus', 'tram'],
      routes: [],
      statuses: ['moving', 'stopped', 'at_stop'],
      region: null
    },
    fitBounds: null
  })

  const dashboard = ref({
    activeCharts: [],
    layout: 'full',
    chartsVisible: true,
    kpiVisible: true
  })

  const selectedVehicleId = ref(null)
  const selectedRouteId = ref(null)
  const selectedStopId = ref(null)
  const notifications = ref([])

  const filteredVehicleCount = computed(() => {
    const realtimeStore = useRealtimeStore()
    let count = 0
    realtimeStore.vehicles.forEach(v => {
      if (matchesFilters(v)) count++
    })
    return count
  })

  function matchesFilters(vehicle) {
    const f = map.value.filters
    if (!f.vehicleTypes.includes(vehicle.type)) return false
    if (f.routes.length > 0 && !f.routes.includes(vehicle.routeId)) return false
    if (!f.statuses.includes(vehicle.status)) return false
    if (f.region && MOSCOW_REGIONS[f.region]) {
      const b = MOSCOW_REGIONS[f.region].bounds
      const { lat, lon } = vehicle.coordinates
      if (lat < b.south || lat > b.north || lon < b.west || lon > b.east) return false
    }
    return true
  }

  function setMapCenter(coords) {
    map.value.center = coords
  }

  function setMapZoom(zoom) {
    map.value.zoom = zoom
  }

  function toggleLayer(layerName) {
    if (map.value.layers[layerName] !== undefined) {
      map.value.layers[layerName] = !map.value.layers[layerName]
    }
  }

  function setFilter(filterType, value) {
    if (filterType === 'vehicleTypes') {
      map.value.filters.vehicleTypes = value
    } else if (filterType === 'routes') {
      map.value.filters.routes = value
    } else if (filterType === 'statuses') {
      map.value.filters.statuses = value
    } else if (filterType === 'region') {
      map.value.filters.region = value
    }
  }

  function setRegionFilter(regionKey) {
    map.value.filters.region = regionKey
    if (regionKey && MOSCOW_REGIONS[regionKey]) {
      const region = MOSCOW_REGIONS[regionKey]
      map.value.center = region.center
      map.value.zoom = region.zoom
      map.value.fitBounds = { ...region.bounds, _ts: Date.now() }
    } else {
      map.value.fitBounds = null
    }
  }

  function clearRegionFilter() {
    map.value.filters.region = null
    map.value.fitBounds = null
  }

  function selectVehicle(id) {
    selectedVehicleId.value = id
  }

  function setLayout(layout) {
    dashboard.value.layout = layout
    if (layout === 'map-only') {
      dashboard.value.chartsVisible = false
    }
  }

  function toggleChartsPanel(visible) {
    dashboard.value.chartsVisible = visible ?? !dashboard.value.chartsVisible
  }

  function addChart(config) {
    const chart = normalizeChartConfig(config)
    dashboard.value.activeCharts.push(chart)
    dashboard.value.chartsVisible = true
  }

  function removeChart(chartId) {
    dashboard.value.activeCharts = dashboard.value.activeCharts.filter(c => c.id !== chartId)
  }

  function normalizeChartConfig(config) {
    const id = config.id || `chart_${Date.now()}`
    if (config.labels && config.datasets) {
      return { id, type: config.type || 'line', title: config.title || 'График', labels: config.labels, datasets: config.datasets }
    }
    if (config.data?.data) {
      const points = config.data.data
      return {
        id,
        type: config.type || 'line',
        title: config.title || 'График',
        labels: points.map(p => p.date),
        datasets: [{
          label: config.data.metric || 'Значение',
          data: points.map(p => p.value),
          color: '#3b82f6'
        }]
      }
    }
    return { id, type: 'line', title: config.title || 'График', labels: [], datasets: [] }
  }

  function addNotification(notification) {
    const id = `notif_${Date.now()}`
    notifications.value.push({ id, ...notification, timestamp: Date.now() })
    setTimeout(() => removeNotification(id), notification.duration || 4000)
  }

  function removeNotification(id) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  return {
    map,
    dashboard,
    selectedVehicleId,
    selectedRouteId,
    selectedStopId,
    notifications,
    filteredVehicleCount,
    setMapCenter,
    setMapZoom,
    toggleLayer,
    setFilter,
    setRegionFilter,
    clearRegionFilter,
    selectVehicle,
    setLayout,
    toggleChartsPanel,
    addChart,
    removeChart,
    addNotification,
    removeNotification,
    matchesFilters
  }
})
