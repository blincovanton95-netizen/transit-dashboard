/**
 * Transport Analyst Agent — интеллектуальный аналитический ассистент
 * 
 * Распознаёт намерения, извлекает параметры, формирует команды для дашборда
 * и генерирует текстовые ответы.
 * 
 * Архитектура: Regex-based NLU + Command Pattern + Tool Calling
 */

import { useRealtimeStore } from '@/stores/realtimeStore'
import { useUiStore, MOSCOW_REGIONS } from '@/stores/uiStore'
import { useAnalyticsStore } from '@/stores/analyticsStore'

// ============================================
// INTENT PATTERNS (Распознавание намерений)
// ============================================

const REGION_MAP = {
  'северо-запад': 'northwest',
  'северо-западе': 'northwest',
  'сз': 'northwest',
  'северо-восток': 'northeast',
  'северо-востоке': 'northeast',
  'св': 'northeast',
  'юго-запад': 'southwest',
  'юго-западе': 'southwest',
  'юз': 'southwest',
  'юго-восток': 'southeast',
  'юго-востоке': 'southeast',
  'юв': 'southeast',
  'центр': 'center',
  'центре': 'center'
}

const INTENT_PATTERNS = {
  // Фильтрация карты по типу и региону
  FILTER_MAP: {
    patterns: [
      /покажи\s+(трамваи|автобусы|троллейбусы|транспорт).*?(северо[-\s]?запад(?:е)?|северо-восток(?:е)?|юго[-\s]?запад(?:е)?|юго[-\s]?восток(?:е)?|центр(?:е)?|сз|св|юз|юв)/i,
      /покажи\s+(только|лишь)\s+(автобусы|троллейбусы|трамваи)/i,
      /добавь\s+на\s+карту\s+(автобусы|троллейбусы|трамваи)/i,
      /убери\s+(автобусы|троллейбусы|трамваи)/i,
      /фильтр\s+по\s+(типу|транспорту)/i,
      /спрячь\s+все\s+графики/i,
      /оставь\s+только\s+карту/i
    ],
    params: {
      vehicleType: /(автобусы|троллейбусы|трамваи|транспорт)/i,
      region: /(северо[-\s]?запад(?:е)?|северо-восток(?:е)?|юго[-\s]?запад(?:е)?|юго[-\s]?восток(?:е)?|центр(?:е)?|сз|св|юз|юв)/i,
      action: /(покажи|добавь|убери|спрячь|оставь)/i
    }
  },

  // Поиск ТС с задержкой
  FIND_DELAYED: {
    patterns: [
      /покажи\s+(все\s+)?(автобусы|троллейбусы|транспорт).*опоздывающ/i,
      /найди\s+(транспорт|автобусы).*опоздывающ.*(\d+)\s*минут/i,
      /какие\s+(автобусы|троллейбусы).*опаздывают/i,
      /где\s+пробки/i,
      /покажи\s+задержки/i
    ],
    params: {
      delayMinutes: /(\d+)\s*минут/i,
      vehicleType: /(автобусы|троллейбусы|транспорт)/i
    }
  },

  // Построение графика
  BUILD_CHART: {
    patterns: [
      /построй\s+график\s+(загрузки|пассажиропотока)/i,
      /покажи\s+график\s+(за\s+неделю|за\s+месяц|за\s+день)/i,
      /построй\s+(столбчатую|линейную|круговую)\s+диаграмму/i,
      /сравни\s+(пассажиропоток|загрузку)\s+на\s+остановках/i,
      /тепловая\s+карта\s+(загруженности|маршрутов)/i
    ],
    params: {
      chartType: /(столбчатую|линейную|круговую|тепловую)/i,
      metric: /(загрузки|пассажиропотока|скорости)/i,
      period: /(за\s+неделю|за\s+месяц|за\s+день|за\s+квартал)/i,
      routeId: /маршрут[ау]?\s*№?(\d+|[мМ]\d+)/i,
      stops: /остановк[аи]х\s+['"](\w+)['"]\s+и\s+['"](\w+)['"]/i
    }
  },

  // Получение метрик
  GET_METRIC: {
    patterns: [
      /сколько\s+(автобусов|троллейбусов|транспорт).*на\s+линии/i,
      /какая\s+(средняя\s+скорость|загрузка|пунктуальность)/i,
      /сколько\s+(опозданий|задержек)/i,
      /статистика\s+(за\s+день|за\s+неделю)/i,
      /сводка\s+по\s+маршруту/i
    ],
    params: {
      metric: /(скорость|загрузка|пунктуальность|опоздания|статистика)/i,
      period: /(за\s+день|за\s+неделю|за\s+месяц)/i,
      routeId: /маршрут[ау]?\s*№?(\d+|[мМ]\d+)/i
    }
  },

  // Информация о маршруте
  ROUTE_INFO: {
    patterns: [
      /что\s+происходит\s+на\s+маршруте/i,
      /покажи\s+маршрут\s*№?(\d+|[мМ]\d+)/i,
      /информация\s+о\s+маршруте/i,
      /сколько\s+(автобусов|троллейбусов)\s+на\s+маршруте/i
    ],
    params: {
      routeId: /маршрут[ау]?\s*№?(\d+|[мМ]\d+)/i
    }
  },

  // Управление отображением
  TOGGLE_VIEW: {
    patterns: [
      /спрячь\s+(графики|панель|метрики)/i,
      /покажи\s+(графики|панель|метрики)/i,
      /полноэкранный\s+режим/i,
      /верни\s+как\s+было/i
    ],
    params: {
      element: /(графики|панель|метрики|карта)/i,
      action: /(спрячь|покажи|верни)/i
    }
  },

  // Помощь
  HELP: {
    patterns: [
      /помощь/i,
      /что\s+ты\s+умеешь/i,
      /как\s+пользоваться/i,
      /примеры\s+запросов/i
    ],
    params: {}
  }
}

// ============================================
// RESPONSE TEMPLATES (Шаблоны ответов)
// ============================================

const RESPONSE_TEMPLATES = {
  FILTER_MAP: (params, result) => {
    const count = result?.count || 0
    const type = params.vehicleType || 'транспорт'
    const typeLabel = getVehicleTypeLabel(type)
    
    if (params.action?.includes('спрячь') || params.action?.includes('оставь')) {
      return `✅ Графики скрыты. Отображается только карта с ${count} единицами транспорта.`
    }

    if (params.region) {
      const regionName = result?.regionName || params.region
      return `✅ Показано ${count} ${typeLabel} на ${regionName}.`
    }
    
    return `✅ На карту добавлены ${count} ${type}. Из них ${result?.delayed || 0} опаздывают.`
  },

  FIND_DELAYED: (params, result) => {
    if (!result || result.vehicles.length === 0) {
      return '✅ Отлично! Сейчас нет транспорта с задержками более 5 минут.'
    }
    
    const list = result.vehicles.map(v => 
      `• ${v.type === 'bus' ? 'Автобус' : 'Троллейбус'} ${v.routeId} (${v.stateNumber}) — отставание ${Math.round(v.delay / 60)} мин`
    ).join('\n')
    
    return `⚠️ Найдено ${result.vehicles.length} ТС с задержками:\n\n${list}\n\nПодсвечиваю их на карте.`
  },

  BUILD_CHART: (params, result) => {
    const chartType = params.chartType || 'линейную'
    const metric = params.metric || 'загрузки'
    
    return `✅ Построил ${chartType} график ${metric}. Данные обновляются в реальном времени.`
  },

  GET_METRIC: (params, result) => {
    if (!result) return 'Не удалось получить метрики.'
    
    const lines = []
    if (result.vehiclesOnLine !== undefined) {
      lines.push(`🚌 ТС на линии: ${result.vehiclesOnLine}`)
    }
    if (result.averageSpeed !== undefined) {
      lines.push(`⚡ Средняя скорость: ${result.averageSpeed} км/ч`)
    }
    if (result.punctuality !== undefined) {
      lines.push(`️ Пунктуальность: ${result.punctuality}%`)
    }
    if (result.activeIncidents !== undefined) {
      lines.push(`🚨 Активные инциденты: ${result.activeIncidents}`)
    }
    
    return lines.join('\n')
  },

  ROUTE_INFO: (params, result) => {
    if (!result) return 'Маршрут не найден.'
    
    return `📊 Маршрут ${result.routeId}:\n` +
      `• ТС на линии: ${result.vehicleCount}\n` +
      `• Средняя скорость: ${result.averageSpeed} км/ч\n` +
      `• Задержка: ${result.averageDelay} мин\n` +
      `• Статус: ${result.status}`
  },

  TOGGLE_VIEW: (params) => {
    const element = params.element || 'элементы'
    const action = params.action || 'покажи'
    
    if (action.includes('спрячь')) {
      return `✅ ${element} скрыты.`
    }
    return `✅ ${element} отображаются.`
  },

  HELP: () => {
    return `🤖 Я могу помочь вам с анализом транспорта:\n\n` +
      `🔍 **Поиск:**\n` +
      `• "Покажи все автобусы, опаздывающие более 5 минут"\n` +
      `• "Где пробки?"\n\n` +
      `📊 **Графики:**\n` +
      `• "Построй график загрузки маршрута 555 за неделю"\n` +
      `• "Сравни пассажиропоток на остановках А и Б"\n\n` +
      `🗺️ **Карта:**\n` +
      `• "Покажи трамваи на северо-западе"\n` +
      `• "Добавь на карту только троллейбусы"\n` +
      `• "Спрячь все графики"\n\n` +
      `📈 **Метрики:**\n` +
      `• "Сколько автобусов на линии?"\n` +
      `• "Какая средняя скорость?"\n\n` +
      `Просто напишите, что вас интересует!`
  }
}

// ============================================
// CORE FUNCTIONS
// ============================================

function getVehicleTypeLabel(type) {
  const map = {
    'автобусы': 'автобусов',
    'троллейбусы': 'троллейбусов',
    'трамваи': 'трамваев',
    'транспорт': 'единиц транспорта',
    bus: 'автобусов',
    trolleybus: 'троллейбусов',
    tram: 'трамваев'
  }
  return map[type?.toLowerCase()] || 'единиц транспорта'
}

function resolveRegionKey(regionText) {
  if (!regionText) return null
  const key = regionText.toLowerCase().replace(/\s+/g, '-')
  return REGION_MAP[key] || REGION_MAP[regionText.toLowerCase()] || null
}

function countFilteredVehicles(uiStore) {
  const realtimeStore = useRealtimeStore()
  let count = 0
  let delayed = 0
  realtimeStore.vehicles.forEach(v => {
    if (uiStore.matchesFilters(v)) {
      count++
      if (v.delay > 300) delayed++
    }
  })
  return { count, delayed }
}

/**
 * Распознать намерение из текста
 */
function recognizeIntent(text) {
  const lowerText = text.toLowerCase()
  
  for (const [intentName, config] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerText)) {
        const params = extractParams(lowerText, config.params)
        return {
          intent: intentName,
          params,
          confidence: 0.85 + Math.random() * 0.1
        }
      }
    }
  }
  
  return {
    intent: 'unknown',
    params: {},
    confidence: 0.3
  }
}

/**
 * Извлечь параметры из текста
 */
function extractParams(text, paramPatterns) {
  const params = {}
  
  for (const [paramName, pattern] of Object.entries(paramPatterns)) {
    const match = text.match(pattern)
    if (match) {
      params[paramName] = match[1] || match[0]
    }
  }
  
  return params
}

/**
 * Сформировать команду для дашборда
 */
function buildCommand(intent, params) {
  const commands = []
  
  switch (intent) {
    case 'FILTER_MAP':
      if (params.vehicleType && !params.action?.includes('убери')) {
        const typeMap = {
          'автобусы': 'bus',
          'троллейбусы': 'trolleybus',
          'трамваи': 'tram',
          'транспорт': ['bus', 'trolleybus', 'tram']
        }
        const raw = params.vehicleType.toLowerCase()
        const types = typeMap[raw]
        commands.push({
          type: 'SET_VEHICLE_FILTER',
          payload: {
            vehicleTypes: Array.isArray(types) ? types : [types || raw]
          }
        })
      } else if (params.action?.includes('убери') && params.vehicleType) {
        commands.push({
          type: 'SET_VEHICLE_FILTER',
          payload: { vehicleTypes: [] }
        })
      }
      if (params.region) {
        const regionKey = resolveRegionKey(params.region)
        if (regionKey) {
          commands.push({
            type: 'SET_REGION_FILTER',
            payload: { region: regionKey }
          })
        }
      }
      if (params.action?.includes('спрячь') || params.action?.includes('оставь')) {
        commands.push({
          type: 'SET_LAYOUT',
          payload: { layout: 'map-only' }
        })
      }
      break
      
    case 'FIND_DELAYED':
      const delayThreshold = params.delayMinutes ? parseInt(params.delayMinutes) * 60 : 300 // 5 минут
      commands.push({
        type: 'HIGHLIGHT_DELAYED_VEHICLES',
        payload: { delayThreshold }
      })
      break
      
    case 'BUILD_CHART':
      const chartTypeMap = {
        'столбчатую': 'bar',
        'линейную': 'line',
        'круговую': 'doughnut',
        'тепловую': 'heatmap'
      }
      commands.push({
        type: 'ADD_CHART',
        payload: {
          chartType: chartTypeMap[params.chartType] || 'line',
          metric: params.metric || 'passengers',
          routeId: params.routeId,
          period: params.period || '7d'
        }
      })
      break
      
    case 'TOGGLE_VIEW':
      if (params.element?.includes('графики')) {
        commands.push({
          type: 'TOGGLE_CHARTS_PANEL',
          payload: { visible: !params.action?.includes('спрячь') }
        })
      }
      break
  }
  
  return commands
}

/**
 * Выполнить команду и получить результат
 */
async function executeCommand(command) {
  const uiStore = useUiStore()
  const realtimeStore = useRealtimeStore()
  const analyticsStore = useAnalyticsStore()
  
  let result = null
  
  switch (command.type) {
    case 'SET_VEHICLE_FILTER':
      uiStore.setFilter('vehicleTypes', command.payload.vehicleTypes)
      result = countFilteredVehicles(uiStore)
      break

    case 'SET_REGION_FILTER':
      uiStore.setRegionFilter(command.payload.region)
      result = {
        ...countFilteredVehicles(uiStore),
        regionName: MOSCOW_REGIONS[command.payload.region]?.name || command.payload.region
      }
      break
      
    case 'SET_LAYOUT':
      uiStore.setLayout(command.payload.layout)
      result = { count: realtimeStore.vehicles.size }
      break
      
    case 'HIGHLIGHT_DELAYED_VEHICLES':
      const delayed = realtimeStore.delayedVehicles
      delayed.forEach(v => {
        realtimeStore.highlightVehicle(v.id)
      })
      result = { vehicles: delayed }
      break
      
    case 'ADD_CHART':
      const chartData = await analyticsStore.fetchRouteAnalytics(
        command.payload.routeId,
        command.payload.period
      )
      uiStore.addChart(analyticsStore.toChartConfig(
        chartData,
        command.payload.chartType,
        `График ${command.payload.metric}`
      ))
      result = { chartType: command.payload.chartType }
      break
      
    case 'TOGGLE_CHARTS_PANEL':
      uiStore.toggleChartsPanel(command.payload.visible)
      break
  }
  
  return result
}

/**
 * Сформировать текстовый ответ
 */
function generateResponse(intent, params, result) {
  const template = RESPONSE_TEMPLATES[intent]
  if (!template) return 'Извините, я не понял запрос.'
  
  return template(params, result)
}

// ============================================
// MAIN PROCESSING FUNCTION
// ============================================

/**
 * Обработать запрос пользователя
 * @param {string} message - Текст запроса
 * @param {object} context - Текущий контекст (роль, выбранные элементы)
 * @returns {Promise<object>} Результат обработки
 */
export async function processRequest(message, context = {}) {
  // 1. Распознаём намерение
  const { intent, params, confidence } = recognizeIntent(message)
  
  // 2. Если не распознали — предлагаем помощь
  if (intent === 'unknown' || confidence < 0.5) {
    return {
      intent: 'unknown',
      params: {},
      confidence,
      response: 'Извините, я не совсем понял. Попробуйте перефразировать или скажите "помощь".',
      commands: [],
      requiresConfirmation: false
    }
  }
  
  // 3. Формируем команды
  const commands = buildCommand(intent, params)
  
  // 4. Выполняем команды и получаем результаты
  const results = []
  for (const command of commands) {
    try {
      const result = await executeCommand(command)
      results.push(result)
    } catch (err) {
      console.error(`Command ${command.type} failed:`, err)
      results.push({ error: err.message })
    }
  }
  
  // 5. Формируем текстовый ответ
  const response = generateResponse(intent, params, results[0])
  
  return {
    intent,
    params,
    confidence,
    response,
    commands,
    results,
    requiresConfirmation: false
  }
}

// ============================================
// EXPORT
// ============================================

export const transportAnalystAgent = {
  processRequest,
  recognizeIntent,
  extractParams,
  buildCommand,
  executeCommand,
  INTENT_PATTERNS,
  RESPONSE_TEMPLATES
}