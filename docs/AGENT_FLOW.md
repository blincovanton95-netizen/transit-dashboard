# 🔄 Поток данных: Пользовательский запрос → Действие на дашборде

## 📊 Общая схема

┌─────────────────────────────────────────────────────────────┐
│ 1. Пользователь вводит запрос в ChatWidget │
│ "Покажи все автобусы, опаздывающие более 5 минут" │
└─────────────────────────────────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────────┐
│ 2. chatStore.sendMessage() │
│ - Добавляет сообщение пользователя в messages[] │
│ - Создаёт пустое сообщение ассистента │
│ - Вызывает transportAnalystAgent.processRequest() │
└─────────────────────────────────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────────┐
│ 3. transportAnalystAgent.processRequest() │
│ а) recognizeIntent(text) │
│ → intent: 'FIND_DELAYED', confidence: 0.92 │
│ б) extractParams(text, patterns) │
│ → {delayMinutes: 5, vehicleType: 'автобусы'} │
│ в) buildCommand(intent, params) │
│ → [{type: 'HIGHLIGHT_DELAYED_VEHICLES', payload: { │
│ delayThreshold: 300}}] │
│ г) executeCommand(command) │
│ → realtimeStore.highlightVehicle(id) для каждого ТС │
│ д) generateResponse(intent, params, result) │
│ → "⚠️ Найдено 12 ТС с задержками..." │
└─────────────────────────────────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────────┐
│ 4. chatStore.streamResponse() │
│ - Разбивает текст на токены │
│ - Постепенно добавляет в message.content │
│ - Vue реактивно обновляет UI │
─────────────────────────────────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Параллельно: realtimeStore.highlightVehicle() │
│ - Находит маркер на карте по vehicleId │
│ - Добавляет CSS-класс 'highlighted' │
│ - Центрирует карту на первом подсвеченном ТС │
│ - Открывает popup с деталями │
└─────────────────────────────────────────────────────────────┘


## 🎯 Примеры команд

### Пример 1: Фильтрация карты

**Запрос:** "Добавь на карту только троллейбусы"

**Распознавание:**
- Intent: `FILTER_MAP`
- Params: `{vehicleType: 'троллейбусы', action: 'добавь'}`

**Команды:**
```javascript
[{
  type: 'SET_VEHICLE_FILTER',
  payload: {
    vehicleTypes: ['trolleybus']
  }
}]

Действие: uiStore.setFilter('vehicleTypes', ['trolleybus'])

Результат: На карте остаются только троллейбусы, автобусы и трамваи скрываются.

Пример 2: Построение графика

Запрос: "Построй график загрузки маршрута 555 за неделю"

Распознавание:

- Intent: BUILD_CHART
- Params: {chartType: 'линейную', metric: 'загрузки', routeId: '555', period: 'неделю'}

Команды:

[{
  type: 'ADD_CHART',
  payload: {
    chartType: 'line',
    metric: 'passengers',
    routeId: '555',
    period: '7d'
  }
}]

Действие:

- analyticsStore.fetchRouteAnalytics('555', '7d')
- uiStore.addChart({type: 'line', data: chartData})

Результат: На дашборде появляется линейный график с данными за неделю.

Пример 3: Получение метрик

Запрос: "Сколько автобусов на линии?"

Распознавание:

- Intent: GET_METRIC
- Params: {metric: 'количество', vehicleType: 'автобусы'}

Команды:

[] // Нет команд для UI, только запрос данных

Действие: Чтение из realtimeStore.kpi

Результат: Текстовый ответ: "🚌 ТС на линии: 47"

🔐 Confirmation Flow (для критических действий)

Некоторые действия требуют подтверждения пользователя:

Пример: "Отмени все бронирования на маршрут 555"

Поток:

- Агент распознаёт intent: CANCEL_BOOKINGS
- Формирует команду, но помечает requiresConfirmation: true
Возвращает ответ: "Вы уверены, что хотите отменить все бронирования на маршрут 555? Это действие нельзя отменить."
Показывает кнопки "Подтвердить" / "Отмена"
Если пользователь подтверждает — выполняет команду
Если отменяет — ничего не делает

Реализация:

// В chatStore.js
async function confirmIntent(messageId) {
  const message = messages.value.find(m => m.id === messageId)
  if (!message?.metadata.commands) return
  
  for (const command of message.metadata.commands) {
    await executeCommand(command)
  }
  
  messages.value.push({
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: '✅ Выполнено!'
  })
}