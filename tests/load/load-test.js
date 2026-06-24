/**
 * Нагрузочное тестирование mock-backend
 * Запуск: npm run load-test
 * Требует запущенный mock-сервер (npm run mock)
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001'
const CONCURRENT_SSE = parseInt(process.env.SSE_CLIENTS || '20', 10)
const REST_REQUESTS = parseInt(process.env.REST_REQUESTS || '100', 10)

async function testHealth() {
  const start = performance.now()
  const res = await fetch(`${BASE_URL}/health`)
  const data = await res.json()
  const elapsed = performance.now() - start
  return { elapsed, data }
}

async function testRestEndpoint(path) {
  const start = performance.now()
  const res = await fetch(`${BASE_URL}${path}`)
  const data = await res.json()
  const elapsed = performance.now() - start
  const size = Array.isArray(data) ? data.length : (data.vehicles ?? 1)
  return { path, elapsed, size, ok: res.ok }
}

function testSseClient(clientId, durationMs = 15000) {
  return new Promise(async (resolve) => {
    const start = performance.now()
    let eventCount = 0
    let firstEventMs = null

    try {
      const res = await fetch(`${BASE_URL}/api/realtime/stream`, {
        headers: { Accept: 'text/event-stream' }
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const timeout = setTimeout(() => {
        reader.cancel().catch(() => {})
        resolve({ clientId, eventCount, firstEventMs, error: false, durationMs: performance.now() - start })
      }, durationMs)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (part.includes('vehicle_update')) {
            eventCount++
            if (firstEventMs === null) firstEventMs = performance.now() - start
          }
        }
      }

      clearTimeout(timeout)
      resolve({ clientId, eventCount, firstEventMs, error: false, durationMs: performance.now() - start })
    } catch {
      resolve({ clientId, eventCount, firstEventMs, error: true, durationMs: performance.now() - start })
    }
  })
}

async function runMarkerSimulation(count = 250) {
  const start = performance.now()
  const markers = new Map()

  for (let i = 0; i < count; i++) {
    markers.set(`v_${i}`, { lat: 55.75 + Math.random() * 0.05, lon: 37.6 + Math.random() * 0.05 })
  }

  for (let tick = 0; tick < 100; tick++) {
    markers.forEach((m, id) => {
      m.lat += (Math.random() - 0.5) * 0.0001
      m.lon += (Math.random() - 0.5) * 0.0001
    })
  }

  return { markerCount: count, ticks: 100, elapsedMs: performance.now() - start }
}

async function main() {
  console.log('=== Transit Dashboard Load Test ===\n')
  console.log(`Target: ${BASE_URL}\n`)

  try {
    const health = await testHealth()
    console.log('Health check:', health.data)
    console.log(`  Response time: ${health.elapsed.toFixed(1)} ms\n`)
  } catch (err) {
    console.error('❌ Сервер недоступен. Запустите: npm run mock')
    process.exit(1)
  }

  console.log(`REST load (${REST_REQUESTS} requests)...`)
  const restResults = []
  for (let i = 0; i < REST_REQUESTS; i++) {
    restResults.push(await testRestEndpoint('/api/realtime/vehicles'))
  }
  const restAvg = restResults.reduce((s, r) => s + r.elapsed, 0) / restResults.length
  const restP95 = restResults.map(r => r.elapsed).sort((a, b) => a - b)[Math.floor(REST_REQUESTS * 0.95)]
  console.log(`  Vehicles per response: ${restResults[0].size}`)
  console.log(`  Avg latency: ${restAvg.toFixed(1)} ms`)
  console.log(`  P95 latency: ${restP95.toFixed(1)} ms\n`)

  console.log(`SSE stress (${CONCURRENT_SSE} concurrent clients, 15s)...`)
  const sseResults = await Promise.all(
    Array.from({ length: CONCURRENT_SSE }, (_, i) => testSseClient(i + 1))
  )
  const totalEvents = sseResults.reduce((s, r) => s + r.eventCount, 0)
  const avgFirstEvent = sseResults.filter(r => r.firstEventMs).reduce((s, r) => s + r.firstEventMs, 0) / CONCURRENT_SSE
  console.log(`  Total events received: ${totalEvents}`)
  console.log(`  Avg events/client: ${(totalEvents / CONCURRENT_SSE).toFixed(0)}`)
  console.log(`  Avg time to first event: ${avgFirstEvent.toFixed(1)} ms\n`)

  console.log('Marker update simulation (250 markers × 100 ticks)...')
  const markerSim = await runMarkerSimulation(250)
  console.log(`  Elapsed: ${markerSim.elapsedMs.toFixed(1)} ms`)
  console.log(`  Avg per tick: ${(markerSim.elapsedMs / markerSim.ticks).toFixed(2)} ms\n`)

  console.log('=== Summary ===')
  console.log(`✅ REST P95 < 200ms: ${restP95 < 200 ? 'PASS' : 'WARN'} (${restP95.toFixed(1)} ms)`)
  console.log(`✅ SSE first event < 3000ms: ${avgFirstEvent < 3000 ? 'PASS' : 'WARN'} (${avgFirstEvent.toFixed(1)} ms)`)
  console.log(`✅ Marker sim < 50ms/tick: ${markerSim.elapsedMs / markerSim.ticks < 50 ? 'PASS' : 'WARN'}`)
}

main().catch(console.error)
