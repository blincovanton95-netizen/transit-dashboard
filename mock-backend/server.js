/**
 * Mock Backend Server для Transit Dashboard
 *
 * Генерирует реалистичные данные о движении транспорта:
 * - 250+ ТС (настраивается через VEHICLE_COUNT)
 * - SSE поток обновлений координат каждые 5 секунд
 * - REST API для исторических данных
 *
 * Запуск: npm run mock
 */

import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001
const TARGET_VEHICLES = parseInt(process.env.VEHICLE_COUNT || '250', 10)

app.use(cors())
app.use(express.json())

// ============================================
// МОК-ДАННЫЕ
// ============================================

const MOCK_ROUTES = [
  { id: '555', name: 'Маршрут №555', type: 'bus', color: '#3b82f6',
    waypoints: [
      { lat: 55.7558, lon: 37.6173 },
      { lat: 55.7600, lon: 37.6200 },
      { lat: 55.7650, lon: 37.6250 },
      { lat: 55.7700, lon: 37.6300 },
      { lat: 55.7750, lon: 37.6350 }
    ]
  },
  { id: 'м1', name: 'Маршрут М1', type: 'bus', color: '#22c55e',
    waypoints: [
      { lat: 55.7500, lon: 37.6100 },
      { lat: 55.7520, lon: 37.6150 },
      { lat: 55.7540, lon: 37.6200 },
      { lat: 55.7560, lon: 37.6250 }
    ]
  },
  { id: '35', name: 'Троллейбус №35', type: 'trolleybus', color: '#f59e0b',
    waypoints: [
      { lat: 55.7450, lon: 37.6000 },
      { lat: 55.7480, lon: 37.6050 },
      { lat: 55.7510, lon: 37.6100 }
    ]
  },
  // Трамвайные маршруты — северо-запад Москвы
  { id: 'T16', name: 'Трамвай №16', type: 'tram', color: '#8b5cf6', region: 'northwest',
    waypoints: [
      { lat: 55.7950, lon: 37.4800 },
      { lat: 55.7980, lon: 37.4950 },
      { lat: 55.8010, lon: 37.5100 },
      { lat: 55.8040, lon: 37.5250 },
      { lat: 55.8070, lon: 37.5400 }
    ]
  },
  { id: 'T31', name: 'Трамвай №31', type: 'tram', color: '#a855f7', region: 'northwest',
    waypoints: [
      { lat: 55.7900, lon: 37.4700 },
      { lat: 55.7930, lon: 37.4850 },
      { lat: 55.7960, lon: 37.5000 },
      { lat: 55.7990, lon: 37.5150 }
    ]
  },
  { id: 'T23', name: 'Трамвай №23', type: 'tram', color: '#7c3aed', region: 'northwest',
    waypoints: [
      { lat: 55.7850, lon: 37.4900 },
      { lat: 55.7880, lon: 37.5050 },
      { lat: 55.7910, lon: 37.5200 },
      { lat: 55.7940, lon: 37.5350 }
    ]
  }
]

const REGION_BOUNDS = {
  northwest: { south: 55.76, north: 55.82, west: 37.45, east: 37.58 },
  northeast: { south: 55.76, north: 55.82, west: 37.58, east: 37.72 },
  southwest: { south: 55.68, north: 55.76, west: 37.45, east: 37.58 },
  southeast: { south: 55.68, north: 55.76, west: 37.58, east: 37.72 },
  center: { south: 55.73, north: 55.77, west: 37.58, east: 37.65 }
}

const vehicles = new Map()
let vehicleCounter = 1

function randomInBounds(bounds) {
  return {
    lat: bounds.south + Math.random() * (bounds.north - bounds.south),
    lon: bounds.west + Math.random() * (bounds.east - bounds.west)
  }
}

function generateInitialVehicles() {
  vehicles.clear()
  vehicleCounter = 1

  // Ровно 12 трамваев на северо-западе (демо-сценарий чат-бота)
  const tramRoutes = MOCK_ROUTES.filter(r => r.type === 'tram')
  tramRoutes.forEach(route => {
    for (let i = 0; i < 4; i++) {
      addVehicle(route, route.waypoints[i % route.waypoints.length], true)
    }
  })

  // Автобусы и троллейбусы — базовое наполнение
  MOCK_ROUTES.filter(r => r.type !== 'tram').forEach(route => {
    const numVehicles = 15 + Math.floor(Math.random() * 10)
    for (let i = 0; i < numVehicles; i++) {
      const wp = route.waypoints[Math.floor(Math.random() * route.waypoints.length)]
      addVehicle(route, wp, false)
    }
  })

  // Добираем до TARGET_VEHICLES только автобусами/троллейбусами
  const nonTramRoutes = MOCK_ROUTES.filter(r => r.type !== 'tram')
  while (vehicles.size < TARGET_VEHICLES) {
    const route = nonTramRoutes[Math.floor(Math.random() * nonTramRoutes.length)]
    const wp = route.waypoints[Math.floor(Math.random() * route.waypoints.length)]
    addVehicle(route, wp, false)
  }
}

function addVehicle(route, waypoint, forceNorthwestTram = false) {
  const id = `vehicle_${vehicleCounter++}`
  const coords = (route.type === 'tram' || forceNorthwestTram)
    ? randomInBounds(REGION_BOUNDS.northwest)
    : {
        lat: waypoint.lat + (Math.random() - 0.5) * 0.015,
        lon: waypoint.lon + (Math.random() - 0.5) * 0.015
      }

  vehicles.set(id, {
    id,
    type: route.type,
    routeId: route.id,
    stateNumber: generateStateNumber(),
    coordinates: {
      lat: coords.lat,
      lon: coords.lon,
      bearing: Math.random() * 360,
      speed: 10 + Math.random() * 30,
      timestamp: Date.now()
    },
    status: Math.random() > 0.15 ? 'moving' : 'at_stop',
    occupancy: Math.floor(Math.random() * 100),
    nextStopId: `stop_${Math.floor(Math.random() * 100)}`,
    delay: Math.random() > 0.75 ? Math.floor(Math.random() * 600) : 0,
    currentWaypointIndex: Math.floor(Math.random() * route.waypoints.length),
    lastUpdated: new Date()
  })
}

function generateStateNumber() {
  const letters = 'АВЕКМНОРСТУХ'
  const letter1 = letters[Math.floor(Math.random() * letters.length)]
  const numbers = Math.floor(100 + Math.random() * 900)
  const letter2 = letters[Math.floor(Math.random() * letters.length)]
  const letter3 = letters[Math.floor(Math.random() * letters.length)]
  return `${letter1}${numbers}${letter2}${letter3}77`
}

// ============================================
// ОБНОВЛЕНИЕ ПОЗИЦИЙ
// ============================================

function updateVehiclePositions() {
  vehicles.forEach((vehicle) => {
    const route = MOCK_ROUTES.find(r => r.id === vehicle.routeId)
    if (!route) return

    const currentWP = route.waypoints[vehicle.currentWaypointIndex]
    const nextWP = route.waypoints[(vehicle.currentWaypointIndex + 1) % route.waypoints.length]

    const progress = 0.08 + Math.random() * 0.12
    const newLat = currentWP.lat + (nextWP.lat - currentWP.lat) * progress
    const newLon = currentWP.lon + (nextWP.lon - currentWP.lon) * progress

    vehicle.coordinates = {
      lat: newLat,
      lon: newLon,
      bearing: calculateBearing(currentWP, { lat: newLat, lon: newLon }),
      speed: 10 + Math.random() * 30,
      timestamp: Date.now()
    }

    if (distanceBetween({ lat: newLat, lon: newLon }, nextWP) < 0.001) {
      vehicle.currentWaypointIndex = (vehicle.currentWaypointIndex + 1) % route.waypoints.length
    }

    if (Math.random() < 0.04) {
      vehicle.status = vehicle.status === 'moving' ? 'at_stop' : 'moving'
    }

    vehicle.occupancy = Math.max(0, Math.min(100, vehicle.occupancy + (Math.random() - 0.5) * 10))

    if (Math.random() < 0.02) {
      vehicle.delay = Math.max(0, vehicle.delay + (Math.random() - 0.3) * 120)
    }

    vehicle.lastUpdated = new Date()
  })
}

function calculateBearing(from, to) {
  const dLon = to.lon - from.lon
  const dLat = to.lat - from.lat
  return (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360
}

function distanceBetween(a, b) {
  return Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lon - b.lon, 2))
}

function countTramsInNorthwest() {
  const b = REGION_BOUNDS.northwest
  let count = 0
  vehicles.forEach(v => {
    if (v.type !== 'tram') return
    const { lat, lon } = v.coordinates
    if (lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east) count++
  })
  return count
}

// ============================================
// SSE ENDPOINT
// ============================================

const sseClients = new Set()

app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  vehicles.forEach(vehicle => {
    res.write(`event: vehicle_update\ndata: ${JSON.stringify(vehicle)}\n\n`)
  })

  sseClients.add(res)
  console.log(`[SSE] Client connected. Total: ${sseClients.size}`)

  req.on('close', () => {
    sseClients.delete(res)
    console.log(`[SSE] Client disconnected. Total: ${sseClients.size}`)
  })
})

function broadcastUpdates() {
  setInterval(() => {
    updateVehiclePositions()

    vehicles.forEach(vehicle => {
      const data = `event: vehicle_update\ndata: ${JSON.stringify(vehicle)}\n\n`
      sseClients.forEach(client => {
        try {
          client.write(data)
        } catch (err) {
          sseClients.delete(client)
        }
      })
    })
  }, 5000)
}

// ============================================
// REST API ENDPOINTS
// ============================================

app.get('/api/realtime/vehicles', (req, res) => {
  res.json(Array.from(vehicles.values()))
})

app.get('/api/realtime/vehicles/:id', (req, res) => {
  const vehicle = vehicles.get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })
  res.json(vehicle)
})

app.get('/api/reference/routes', (req, res) => {
  res.json(MOCK_ROUTES)
})

app.get('/api/analytics/route/:routeId', (req, res) => {
  const { routeId } = req.params
  const { period = '7d', metric = 'passengers' } = req.query

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const data = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.floor(500 + Math.random() * 1500),
      routeId
    })
  }

  res.json({ routeId, period, metric, data })
})

app.get('/api/analytics/stops/top', (req, res) => {
  const stops = Array.from({ length: 20 }, (_, i) => ({
    id: `stop_${i}`,
    name: `Остановка ${i + 1}`,
    passengerFlow: Math.floor(100 + Math.random() * 2000),
    coordinates: {
      lat: 55.75 + (Math.random() - 0.5) * 0.05,
      lon: 37.62 + (Math.random() - 0.5) * 0.05
    }
  }))

  stops.sort((a, b) => b.passengerFlow - a.passengerFlow)
  res.json(stops.slice(0, 10))
})

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    vehicles: vehicles.size,
    tramsNorthwest: countTramsInNorthwest(),
    sseClients: sseClients.size,
    uptime: process.uptime()
  })
})

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================

generateInitialVehicles()
console.log(`[MockBackend] Generated ${vehicles.size} vehicles (${countTramsInNorthwest()} trams in NW)`)

app.listen(PORT, () => {
  console.log(`\n🚌 Transit Dashboard Mock Backend`)
  console.log(`📡 SSE Stream: http://localhost:${PORT}/api/realtime/stream`)
  console.log(`📊 REST API:    http://localhost:${PORT}/api/realtime/vehicles`)
  console.log(`🏥 Health:      http://localhost:${PORT}/health\n`)

  broadcastUpdates()
})
