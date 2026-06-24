/**
 * Realtime Service — подписка на Server-Sent Events (SSE)
 * 
 * 🔹 Почему SSE, а не WebSocket?
 * - Проще в реализации (обычный HTTP)
 * - Автоматический реконнект при обрыве
 * - Достаточно для однонаправленного потока (сервер → клиент)
 * - Работает через HTTP/2 мультиплексирование
 */

class RealtimeService {
  constructor() {
    this.eventSource = null
    this.callbacks = {
      onVehicleUpdate: null,
      onVehicleRemoved: null,
      onIncident: null,
      onStatusChange: null
    }
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
  }
  
  /**
   * Подключиться к SSE потоку
   */
  connect(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks }
    
    const base = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '')
    const url = `${base}/api/realtime/stream`
    
    try {
      this.eventSource = new EventSource(url)
      
      // Подключение установлено
      this.eventSource.onopen = () => {
        console.log('[RealtimeService] Connected to stream')
        this.reconnectAttempts = 0
        this.callbacks.onStatusChange?.('connected')
      }
      
      // Обработка обновлений ТС
      this.eventSource.addEventListener('vehicle_update', (event) => {
        try {
          const vehicle = JSON.parse(event.data)
          this.callbacks.onVehicleUpdate?.(vehicle)
        } catch (err) {
          console.error('[RealtimeService] Parse error:', err)
        }
      })
      
      // Обработка удаления ТС
      this.eventSource.addEventListener('vehicle_removed', (event) => {
        try {
          const { vehicleId } = JSON.parse(event.data)
          this.callbacks.onVehicleRemoved?.(vehicleId)
        } catch (err) {
          console.error('[RealtimeService] Parse error:', err)
        }
      })
      
      // Обработка инцидентов
      this.eventSource.addEventListener('incident', (event) => {
        try {
          const incident = JSON.parse(event.data)
          this.callbacks.onIncident?.(incident)
        } catch (err) {
          console.error('[RealtimeService] Parse error:', err)
        }
      })
      
      // Обработка ошибок
      this.eventSource.onerror = (error) => {
        console.error('[RealtimeService] Connection error:', error)
        this.callbacks.onStatusChange?.('disconnected')
        
        // EventSource автоматически пытается переподключиться
        this.reconnectAttempts++
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[RealtimeService] Max reconnect attempts reached')
          this.disconnect()
        }
      }
      
    } catch (err) {
      console.error('[RealtimeService] Failed to connect:', err)
      this.callbacks.onStatusChange?.('disconnected')
    }
  }
  
  /**
   * Отключиться от потока
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      this.callbacks.onStatusChange?.('disconnected')
      console.log('[RealtimeService] Disconnected')
    }
  }
  
  /**
   * Проверить статус подключения
   */
  isConnected() {
    return this.eventSource && this.eventSource.readyState === EventSource.OPEN
  }
}

// Singleton instance
export const realtimeService = new RealtimeService()