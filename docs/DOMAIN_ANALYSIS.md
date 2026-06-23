# 🗺️ Domain Analysis: Urban Transit Monitoring System

**Дата:** 23 июня 2026  
**Предметная область:** Мониторинг городского пассажирского транспорта  
**Заказчик (целевой):** ГБУ "Мосгортранс", логистические операторы  
**Аналог реального продукта:** "Мосгортранс" — ЕЦКУП, Яндекс.Карты (транспортный слой)

---

## 🎯 Бизнес-контекст

Городской транспорт — это сложная экосистема, где:
- **10 000+ ТС** одновременно находятся на линии (в Москве)
- **Диспетчеры** должны реагировать на инциденты за секунды
- **Аналитики** исследуют тренды за недели/месяцы
- **Пассажиры** хотят видеть актуальное время прибытия

**Ключевая проблема:** Данные есть, но они разрознены. Диспетчер видит карту, аналитик — Excel, руководитель — PDF-отчёт. AI-ассистент должен **объединить эти миры** через естественный язык.

---

## 🧩 Ключевые сущности домена

### 🚌 Vehicle (Транспортное средство)

```typescript
interface Vehicle {
  id: string;                    // "bus_1234"
  type: 'bus' | 'trolleybus' | 'tram' | 'shuttle';
  routeId: string;               // Ссылка на Route
  stateNumber: string;           // "А123БВ77"
  driverId?: string;             // ID водителя
  coordinates: {
    lat: number;                 // 55.7558
    lon: number;                 // 37.6173
    bearing: number;             // Угол направления (0-360°)
    speed: number;               // км/ч
    timestamp: number;           // Unix timestamp
  };
  status: 'moving' | 'stopped' | 'at_stop' | 'out_of_service' | 'emergency';
  occupancy: number;             // 0-100% загруженности салона
  nextStopId?: string;           // ID следующей остановки
  delay: number;                 // Отставание от графика (сек, + = опоздание)
  lastUpdated: Date;
}

🛣️ Route (Маршрут)

interface Route {
  id: string;                    // "555"
  name: string;                  // "Маршрут №555"
  type: 'bus' | 'trolleybus' | 'tram';
  color: string;                 // HEX-цвет на карте
  direction: 'forward' | 'backward';
  stops: Stop[];                 // Упорядоченный список остановок
  schedule: TimeRange[];         // Время работы
  totalLength: number;           // Длина маршрута (км)
  averageTripTime: number;       // Среднее время поездки (мин)
  vehiclesAssigned: string[];    // IDs приписанных ТС
  isActive: boolean;
}

🚏 Stop (Остановка)

interface Stop {
  id: string;                    // "stop_9876"
  name: string;                  // "ул. Тверская"
  coordinates: { lat: number; lon: number };
  routes: string[];              // ID маршрутов, проходящих через остановку
  facilities: ('shelter' | 'bench' | 'display' | 'wifi')[];
  passengerFlow: {
    peakHour: number;            // Пассажиров в час пик
    dailyAverage: number;        // Среднесуточный поток
    currentLoad: number;         // Текущая загрузка (0-100%)
  };
}

🚐 Trip (Поездка)

interface Trip {
  id: string;                    // "trip_2026-06-25_555_08:30"
  routeId: string;
  vehicleId: string;
  driverId: string;
  startTime: Date;
  endTime?: Date;
  plannedStops: { stopId: string; plannedTime: Date; actualTime?: Date }[];
  metrics: {
    totalDistance: number;       // Пройденное расстояние
    averageSpeed: number;        // Средняя скорость
    passengersCount: number;     // Всего пассажиров
    delays: number;              // Суммарное время опозданий
    fuelConsumption?: number;    // Расход топлива (л)
  };
  incidents: Incident[];         // Инциденты в поездке
}

🚨 Incident (Инцидент)

interface Incident {
  id: string;
  type: 'breakdown' | 'accident' | 'traffic_jam' | 'detour' | 'passenger_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  vehicleId?: string;
  location: { lat: number; lon: number };
  description: string;
  reportedAt: Date;
  resolvedAt?: Date;
  status: 'open' | 'in_progress' | 'resolved';
}

📡 Источники данных

1. Realtime Stream (потоковые данные)

Протокол: Server-Sent Events (SSE) или WebSocket
Формат: GTFS-Realtime (стандарт де-факто)
Частота обновления: каждые 5-10 секунд
Endpoint: /api/realtime/vehicles/stream

// Пример SSE-чанка
{
  "entity": [
    {
      "id": "bus_1234",
      "vehicle": {
        "trip": { "route_id": "555" },
        "position": {
          "latitude": 55.7558,
          "longitude": 37.6173,
          "bearing": 180,
          "speed": 12.5,
          "timestamp": 1719324600
        },
        "stop_id": "stop_9876",
        "current_stop_sequence": 12,
        "congestion_level": "RUNNING_SMOOTHLY"
      }
    }
  ]
}

2. Historical Data (исторические данные)

Формат: GTFS Static + кастомные расширения
Хранение: JSON-файлы (mock) / PostgreSQL (production)
Endpoint: /api/analytics/history

Содержит:

- Агрегированные данные по поездкам за последние 90 дней
- Статистику пассажиропотока по остановкам
- Метрики punctuality (пунктуальности) по маршрутам
- Инциденты с категоризацией

3. Reference Data (справочные данные)

- GTFS Static: маршруты, остановки, расписания
- OSM (OpenStreetMap): геометрия дорог, POI
- Тарифы, зоны, льготы

🔄 Потоки данных

┌─────────────────┐
│  GPS-датчики ТС │────┐
└─────────────────┘    │
                       ▼
┌─────────────────┐  ┌──────────────────┐
│  Валидаторы     │─▶│  Realtime Stream │──▶ SSE/WebSocket
│  (GTFS-RT)      │  │  (Redis Pub/Sub) │
└─────────────────┘  └──────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  Data Aggregator │──▶ Historical DB
                     │  (Node.js)       │
                     └──────────────────┘

🎭 Роли пользователей

👨‍✈️ Диспетчер (Dispatcher)

- Фокус: Оперативная обстановка "здесь и сейчас"
- Данные: Realtime (последние 5 минут)
- Действия: Перенаправить ТС, отменить рейс, вызвать помощь
- KPI: Время реакции на инцидент < 30 сек

📊 Аналитик (Analyst)

- Фокус: Тренды, аномалии, прогнозы
- Данные: Historical (дни, недели, месяцы)
- Действия: Построить отчёт, сравнить периоды, выявить паттерны
- KPI: Качество прогнозов, выявленные оптимизации

👨‍💼 Руководитель (Manager)

- Фокус: KPI, эффективность, бюджет
- Данные: Агрегированные метрики
- Действия: Принятие стратегических решений
- KPI: КПД парка, удовлетворённость пассажиров

📚 Словарь домена

| Термин | Определение |
|--------|-------------|
| GTFS | General Transit Feed Specification — стандарт описания маршрутов |
| GTFS-RT | Realtime-расширение GTFS для потоковых данных |
| Headway| Интервал между ТС на маршруте |
Punctuality | Пунктуальность (% рейсов в пределах ±3 мин от графика) |
| Deadhead | Пробег без пассажиров (в депо/на маршрут) |
| Block | Набор последовательных поездок одного ТС за смену |
| Layover | Время отдыха водителя на конечной остановке |
| Dwell time | Время стоянки на остановке |

