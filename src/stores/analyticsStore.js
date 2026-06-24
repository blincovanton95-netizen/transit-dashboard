import { defineStore } from 'pinia'
import { ref } from 'vue'

const CACHE_TTL = 5 * 60 * 1000

export const useAnalyticsStore = defineStore('analytics', () => {
  const routeAnalytics = ref(new Map())
  const cache = ref(new Map())
  const isLoading = ref(false)
  const error = ref(null)

  function getApiBase() {
    return import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '')
  }

  async function fetchRouteAnalytics(routeId = '555', period = '7d') {
    const cacheKey = `${routeId || 'all'}_${period}`
    const cached = cache.value.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }

    isLoading.value = true
    error.value = null

    try {
      const id = routeId || '555'
      const url = `${getApiBase()}/api/analytics/route/${id}?period=${period}&metric=passengers`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      routeAnalytics.value.set(id, data)
      cache.value.set(cacheKey, { data, timestamp: Date.now() })
      return data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchTopStops(limit = 10) {
    const url = `${getApiBase()}/api/analytics/stops/top?limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  function toChartConfig(analyticsData, type = 'line', title = 'График') {
    const points = analyticsData.data || []
    return {
      type,
      title,
      labels: points.map(p => p.date),
      datasets: [{
        label: analyticsData.metric || 'Пассажиропоток',
        data: points.map(p => p.value),
        color: '#3b82f6'
      }]
    }
  }

  function clearCache() {
    cache.value.clear()
  }

  return {
    routeAnalytics,
    isLoading,
    error,
    fetchRouteAnalytics,
    fetchTopStops,
    toChartConfig,
    clearCache
  }
})
