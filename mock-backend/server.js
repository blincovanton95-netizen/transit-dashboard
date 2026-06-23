/**
 * Mock Backend Server для Transit Dashboard
 * 
 * Генерирует реалистичные данные о движении транспорта:
 * - 50-100 ТС, движущихся по маршрутам
 * - SSE поток обновлений координат каждые 5 секунд
 * - REST API для исторических данных
 * 
 * Запуск: node mock-backend/server.js
 */

import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// ============================================
// МОК-ДАННЫЕ
// ============================================

// Маршруты Москвы (упрощённые)
const MOCK_ROUTES = [
  { id: '555', name: 'Маршрут №555', type: 'bus', color: '#3b82f6',
    waypoints: [
      { lat: 55.7558, lon: 37.6173 }, // Тверская
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
  }
]

// Генерация начальных ТС
const vehicles = new Map()
let vehicleCounter = 1

function generateInitialVehicles() {
  MOCK_ROUTES.forEach(route => {
    const numVehicles = 3 + Math.floor(Math.random() * 3) // 3-5 ТС на маршрут
    
    for (let i = 0; i < numVehicles; i++) {
      const id = `vehicle_${vehicleCounter++}`
      const waypointIndex = Math.floor(Math.random() * route.waypoints.length)
      const waypoint = route.waypoints[waypointIndex]
      
      vehicles.set(id, {
        id,
        type: route.type,
        routeId: route.id,
        stateNumber: generateStateNumber(),
        coordinates: {
          lat: waypoint.lat + (Math.random() - 0.5) * 0.002,
          lon: waypoint.lon + (Math.random() - 0.5) * 0.002,
          bearing: Math.random() * 360,
          speed: 10 + Math.random() * 30,
          timestamp: Date.now()
        },
        status: Math.random() > 0.2 ? 'moving' : 'at_stop',
        occupancy: Math.floor(Math.random() * 100),
        nextStopId: `stop_${Math.floor(Math.random() * 100)}`,
        delay: Math.random() > 0.7 ? Math.floor(Math.random() * 600) : 0, // 0-10 мин
        currentWaypointIndex: waypointIndex,
        lastUpdated: new Date()
      })
    }
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
  vehicles.forEach((vehicle, id) => {
    const route = MOCK_ROUTES.find(r => r.id === vehicle.routeId)
    if (!route) return
    
    // Двигаем ТС к следующему waypoint
    const currentWP = route.waypoints[vehicle.currentWaypointIndex]
    const nextWP = route.waypoints[(vehicle.currentWaypointIndex + 1) % route.waypoints.length]
    
    // Интерполяция
    const progress = 0.1 + Math.random() * 0.1 // 10-20% движения за тик
    const newLat = currentWP.lat + (nextWP.lat - currentWP.lat) * progress
    const newLon = currentWP.lon + (nextWP.lon - currentWP.lon) * progress
    
    vehicle.coordinates = {
      lat: newLat,
      lon: newLon,
      bearing: calculateBearing(currentWP, { lat: newLat, lon: newLon }),
      speed: 10 + Math.random() * 30,
      timestamp: Date.now()
    }
    
    // Если достигли следующего waypoint — переходим к следующему
    const distToNext = distanceBetween(
      { lat: newLat, lon: newLon },
      nextWP
    )
    if (distToNext < 0.001) {
      vehicle.currentWaypointIndex = (vehicle.currentWaypointIndex + 1) % route.waypoints.length
    }
    
    // Случайные изменения статуса
    if (Math.random() < 0.05) {
      vehicle.status = vehicle.status === 'moving' ? 'at_stop' : 'moving'
    }
    
    // Случайные изменения загруженности
    vehicle.occupancy = Math.max(0, Math.min(100, 
      vehicle.occupancy + (Math.random() - 0.5) * 10
    ))
    
    // Случайные задержки
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

// ============================================
// SSE ENDPOINT
// ============================================

const sseClients = new Set()

app.get('/api/realtime/stream', (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  
  // Отправляем начальное состояние — все текущие ТС
  vehicles.forEach(vehicle => {
    res.write(`event: vehicle_update\ndata: ${JSON.stringify(vehicle)}\n\n`)
  })
  
  // Добавляем клиента в список
  sseClients.add(res)
  console.log(`[SSE] Client connected. Total: ${sseClients.size}`)
  
  // Обработка отключения
  req.on('close', () => {
    sseClients.delete(res)
    console.log(`[SSE] Client disconnected. Total: ${sseClients.size}`)
  })
})

// Функция рассылки обновлений всем подключённым клиентам
function broadcastUpdates() {
  updateVehiclePositions()
  
  const updateInterval = 5000 // 5 секунд
  setInterval(() => {
    updateVehiclePositions()
    
    // Отправляем обновления всем подключённым клиентам
    vehicles.forEach(vehicle => {
      const data = `event: vehicle_update\ndata: ${JSON.stringify(vehicle)}\n\n`
      sseClients.forEach(client => {
        try {
          client.write(data)
        } catch (err) {
          console.error('[SSE] Write error:', err)
          sseClients.delete(client)
        }
      })
    })
  }, updateInterval)
}

// ============================================
// REST API ENDPOINTS
// ============================================

// Получить все ТС
app.get('/api/realtime/vehicles', (req, res) => {
  res.json(Array.from(vehicles.values()))
})

// Получить ТС по ID
app.get('/api/realtime/vehicles/:id', (req, res) => {
  const vehicle = vehicles.get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })
  res.json(vehicle)
})

// Получить маршруты
app.get('/api/reference/routes', (req, res) => {
  res.json(MOCK_ROUTES)
})

// Исторические данные маршрута (мок)
app.get('/api/analytics/route/:routeId', (req, res) => {
  const { routeId } = req.params
  const { period = '7d', metric = 'passengers' } = req.query
  
  // Генерируем мок-данные
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

// Статистика остановок
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    vehicles: vehicles.size,
    sseClients: sseClients.size,
    uptime: process.uptime()
  })
})

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================

generateInitialVehicles()
console.log(`[MockBackend] Generated ${vehicles.size} vehicles`)

app.listen(PORT, () => {
  console.log(`\n🚌 Transit Dashboard Mock Backend`)
  console.log(`📡 SSE Stream: http://localhost:${PORT}/api/realtime/stream`)
  console.log(`📊 REST API:    http://localhost:${PORT}/api/realtime/vehicles`)
  console.log(`🏥 Health:      http://localhost:${PORT}/health\n`)
  
  // Запускаем рассылку обновлений
  broadcastUpdates()
})