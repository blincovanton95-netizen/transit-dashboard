import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { realtimeService } from '@/services/realtimeService'

/**
 * 🔹 КРИТИЧНО: Используем Map вместо Array для O(1) обновлений
 * При 500 ТС и обновлениях каждые 5с это даёт 100x прирост скорости
 */
export const useRealtimeStore = defineStore('realtime', () => {
  // ============================================
  // STATE
  // ============================================
  
  const vehicles = ref(new Map())  // Map<vehicleId, Vehicle>
  const incidents = ref([])
  const connection = ref({
    status: 'disconnected',  // 'connecting' | 'connected' | 'disconnected'
    lastUpdate: null,
    reconnectAttempts: 0
  })
  
  // ============================================
  // GETTERS
  // ============================================
  
  const vehiclesByType = computed(() => (type) => {
    const result = []
    vehicles.value.forEach(v => {
      if (v.type === type) result.push(v)
    })
    return result
  })
  
  const delayedVehicles = computed(() => {
    const result = []
    vehicles.value.forEach(v => {
      if (v.delay > 300) result.push(v) // > 5 минут
    })
    return result
  })
  
  const vehiclesOnRoute = computed(() => (routeId) => {
    const result = []
    vehicles.value.forEach(v => {
      if (v.routeId === routeId) result.push(v)
    })
    return result
  })
  
  const activeIncidents = computed(() => 
    incidents.value.filter(i => i.status !== 'resolved')
  )
  
  const kpi = computed(() => {
    let totalSpeed = 0
    let onTimeCount = 0
    let count = 0
    
    vehicles.value.forEach(v => {
      if (v.status === 'moving' || v.status === 'at_stop') {
        totalSpeed += v.coordinates.speed
        if (v.delay <= 180) onTimeCount++ // ±3 минуты
        count++
      }
    })
    
    return {
      vehiclesOnLine: count,
      averageSpeed: count > 0 ? (totalSpeed / count).toFixed(1) : 0,
      punctuality: count > 0 ? Math.round((onTimeCount / count) * 100) : 0,
      activeIncidents: activeIncidents.value.length
    }
  })
  
  // ============================================
  // ACTIONS
  // ============================================
  
  /**
   * 🔹 КРИТИЧНО: Обновляем только изменённые поля, не заменяем весь объект
   * Это позволяет Vue реактивно обновлять только нужные DOM-узлы
   */
  function updateVehicle(vehicleData) {
    const existing = vehicles.value.get(vehicleData.id)
    
    if (existing) {
      // Обновляем только изменившиеся поля (минимизация реактивных триггеров)
      if (existing.coordinates.lat !== vehicleData.coordinates.lat ||
          existing.coordinates.lon !== vehicleData.coordinates.lon) {
        existing.coordinates = { ...vehicleData.coordinates }
      }
      if (existing.status !== vehicleData.status) {
        existing.status = vehicleData.status
      }
      if (existing.delay !== vehicleData.delay) {
        existing.delay = vehicleData.delay
      }
      if (existing.occupancy !== vehicleData.occupancy) {
        existing.occupancy = vehicleData.occupancy
      }
      existing.lastUpdated = new Date()
    } else {
      // Новое ТС — добавляем в Map
      vehicles.value.set(vehicleData.id, {
        ...vehicleData,
        lastUpdated: new Date()
      })
    }
  }
  
  function removeVehicle(vehicleId) {
    vehicles.value.delete(vehicleId)
  }
  
  function addIncident(incident) {
    incidents.value.push(incident)
  }
  
  function resolveIncident(incidentId) {
    const incident = incidents.value.find(i => i.id === incidentId)
    if (incident) {
      incident.status = 'resolved'
      incident.resolvedAt = new Date()
    }
  }
  
  function highlightVehicle(vehicleId) {
    // Это действие будет перехвачено в TransportMap.vue
    console.log(`[realtimeStore] Highlighting vehicle ${vehicleId}`)
  }
  
  // ============================================
  // STREAMING
  // ============================================
  
  function connectStream() {
    connection.value.status = 'connecting'
    
    realtimeService.connect({
      onVehicleUpdate: (vehicle) => {
        updateVehicle(vehicle)
        connection.value.lastUpdate = new Date()
        connection.value.status = 'connected'
      },
      onVehicleRemoved: (vehicleId) => {
        removeVehicle(vehicleId)
      },
      onIncident: (incident) => {
        addIncident(incident)
      },
      onStatusChange: (status) => {
        connection.value.status = status
        if (status === 'disconnected') {
          connection.value.reconnectAttempts++
        }
      }
    })
  }
  
  function disconnectStream() {
    realtimeService.disconnect()
    connection.value.status = 'disconnected'
  }
  
  return {
    // State
    vehicles,
    incidents,
    connection,
    
    // Getters
    vehiclesByType,
    delayedVehicles,
    vehiclesOnRoute,
    activeIncidents,
    kpi,
    
    // Actions
    updateVehicle,
    removeVehicle,
    addIncident,
    resolveIncident,
    highlightVehicle,
    connectStream,
    disconnectStream
  }
})