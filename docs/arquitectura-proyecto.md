# Arquitectura del proyecto

El proyecto está compuesto por servicios ejecutándose en Docker Compose y un
frontend web desarrollado por los participantes del taller.

```mermaid
flowchart LR
    subgraph HOST["Máquina anfitriona"]
        FRONT["Frontend del participante<br/>Aplicación web<br/>localhost:3000"]
    end

    subgraph DOCKER["Docker Compose"]
        DB[("PostgreSQL + PostGIS<br/>Puerto 5432")]

        FROST["FROST-Server<br/>REST SensorThings API<br/>Puerto 8080"]
        MQTT["Broker MQTT de FROST<br/>TCP 1883<br/>WebSocket 9876/mqtt"]

        SIM["Simulador meteorológico<br/>API de control<br/>Puerto 3002"]

        GATEWAY["Gateway de visualización<br/>REST 3001<br/>WebSocket 3001/ws"]
    end

    DB -->|Persistencia| FROST

    SIM -->|REST: crea observaciones| FROST
    FROST -->|Publica observaciones| MQTT

    MQTT -->|MQTT TCP interno| GATEWAY
    GATEWAY -->|REST: catálogo y estado| FROST

    FRONT -->|Modo Gateway REST| GATEWAY
    FRONT -->|Modo Gateway WebSocket| GATEWAY

    FRONT -.->|Modo FROST REST| FROST
    FRONT -.->|Modo FROST MQTT sobre WebSocket| MQTT

    classDef frontend fill:#1976d2,color:#fff,stroke:#0d47a1
    classDef frost fill:#e65100,color:#fff,stroke:#bf360c
    classDef infra fill:#616161,color:#fff,stroke:#212121
    classDef gateway fill:#388e3c,color:#fff,stroke:#1b5e20
    classDef simulator fill:#7b1fa2,color:#fff,stroke:#4a148c

    class FRONT frontend
    class FROST,MQTT frost
    class DB infra
    class GATEWAY gateway
    class SIM simulator
```

## Flujo de datos

1. El simulador genera observaciones meteorológicas y las registra en FROST mediante REST.
2. FROST persiste los datos en PostgreSQL/PostGIS y publica las nuevas observaciones en MQTT.
3. El Gateway consume FROST mediante REST y MQTT, y expone una API REST y un WebSocket para el frontend.
4. El frontend puede consumir los datos a través del Gateway o directamente desde FROST mediante REST y MQTT sobre WebSocket.

## Puertos principales

| Servicio | Puerto | Uso |
|---|---:|---|
| Frontend | `3000` | Aplicación web del participante |
| Gateway | `3001` | REST y WebSocket `/ws` |
| Simulador | `3002` | Panel y API para eventos de tormenta |
| FROST REST | `8080` | API SensorThings `/FROST-Server/v1.1` |
| FROST MQTT | `1883` | MQTT TCP para servicios internos |
| FROST MQTT-WebSocket | `9876` | MQTT para navegadores en `/mqtt` |
| PostgreSQL/PostGIS | `5432` | Persistencia de FROST |

Las conexiones directas del navegador a FROST utilizan REST en el puerto `8080`
y MQTT sobre WebSocket en `ws://localhost:9876/mqtt`. El puerto MQTT TCP `1883`
se utiliza para las conexiones internas de Docker y no para el navegador.
