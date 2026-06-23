# 🏛️ Architecture: Transit Dashboard

## 🗺️ Общая схема

```mermaid
flowchart TB
    subgraph USER["👤 Пользователи"]
        DISP[Диспетчер<br/>Realtime фокус]
        ANA[Аналитик<br/>Historical фокус]
    end

    subgraph FRONTEND["🎨 Frontend (Vue 3 + Vite)"]
        subgraph VIEWS["Views"]
            MAP[MapView<br/>Leaflet]
            DASH[DashboardView<br/>KPI + Charts]
            ANALYTICS[AnalyticsView<br/>Reports]
        end
        
        subgraph WIDGETS["Widgets"]
            CHAT[ChatWidget<br/>AI-ассистент]
            FILTERS[FilterPanel]
            KPICARDS[KPIPanel]
        end
        
        subgraph STORES["Pinia Stores"]
            RS[realtimeStore<br/>ТС, координаты]
            US[uiStore<br/>фильтры, слои]
            CS[chatStore<br/>диалог]
            AS[analyticsStore<br/>история, отчёты]
        end
        
        subgraph CORE["Core"]
            AGENT[agentCore<br/>NLU + Tools]
            STREAM[SSE Client<br/>realtime stream]
        end
    end

    subgraph BACKEND["⚙️ Backend (Node.js/Express)"]
        CHAT_API["/api/chat<br/>LLM Proxy"]
        RT_API["/api/realtime<br/>SSE stream"]
        HIST_API["/api/analytics<br/>historical data"]
        REF_API["/api/reference<br/>routes, stops"]
    end

    subgraph DATA["💾 Data Layer"]
        MOCK_RT["Mock Realtime<br/>Generator<br/>(SSE)"]
        MOCK_HIST["Mock Historical<br/>(JSON files)"]
        GTFS["GTFS Static<br/>(reference)"]
    end

    %% Потоки
    DISP --> MAP
    DISP --> CHAT
    ANA --> DASH
    ANA --> CHAT
    
    MAP --> RS
    MAP --> US
    CHAT --> CS
    DASH --> AS
    
    STREAM -->|SSE| RT_API
    CHAT -->|POST| CHAT_API
    DASH -->|GET| HIST_API
    
    AGENT -->|Tool calls| RS
    AGENT -->|Tool calls| AS
    AGENT -->|Tool calls| US
    
    RT_API --> MOCK_RT
    HIST_API --> MOCK_HIST
    REF_API --> GTFS