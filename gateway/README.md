# Gateway de visualización para FROST

Gateway en Node.js 24 que lee observaciones de FROST-Server por MQTT y las
expone a clientes web mediante HTTP y WebSocket. En este taller acompaña al
`simulator/`, que genera datos para estaciones meteorológicas de Santa Marta.

## Flujo del taller

```text
simulator
  └─ POST /v1.1/Observations ──► FROST-Server
                                  └─ MQTT ──► gateway ── WebSocket ──► frontend
```

El simulador crea 22 `Things`. Cada estación tiene una `Location` y tres
`Datastreams`:

| Variable | Nombre del Datastream | Unidad |
| --- | --- | --- |
| Precipitación acumulada 24 h | `<stationId>-precipitation-24h` | `mm` |
| Temperatura del aire | `<stationId>-temperature` | `degC` |
| Humedad relativa | `<stationId>-humidity` | `%` |

En la configuración de Docker Compose el simulador publica las tres variables
de cada estación cada 10 segundos (`BASE_TICK_MS=10000`). FROST conserva el
histórico; el gateway mantiene en memoria el último valor de cada Datastream
para entregar un estado útil para visualización en vivo.

## Qué hace el gateway

- Consulta el catálogo REST de FROST al arrancar.
- Agrupa los Datastreams por `Thing` y resuelve nombre, tipo, unidad y posición.
- Se suscribe a los topics MQTT concretos de esos Datastreams.
- Normaliza cada observación y actualiza el último estado por estación.
- Expone salud, catálogo y estado actual por HTTP.
- Entrega snapshots y eventos en tiempo real por WebSocket.

El gateway es genérico en su implementación, pero los ejemplos de esta guía
usan el tipo `weather-station` y las estaciones simuladas de Santa Marta.

## Requisitos

- Node.js 24+
- npm 11+
- FROST-Server, PostgreSQL y el simulador disponibles.

Desde la raíz del repositorio, Docker Compose inicia PostgreSQL, FROST, el
simulador y el gateway. El gateway espera a que FROST esté saludable y a que el
simulador haya comenzado a sembrar el catálogo:

```bash
docker compose up --build
```

Para ejecutar solo el gateway y sus dependencias:

```bash
docker compose up --build database web simulator gateway
```

En desarrollo también puede ejecutarse localmente, fuera de Docker:

```bash
cd gateway
npm install
cp .env.example .env
npm run dev
```

Con el stack de Compose activo, las URLs por defecto son:

- FROST REST: `http://localhost:8080/FROST-Server/v1.1`
- FROST MQTT: `mqtt://localhost:1883`
- Simulador: `http://localhost:3002`
- Gateway HTTP/WebSocket: `http://localhost:3001` y `ws://localhost:3001/ws`

Dentro de la red de Compose, el gateway usa `http://web:8080/FROST-Server/v1.1`
para REST y `mqtt://web:1883` para MQTT. Los clientes del host deben utilizar
las URLs publicadas en `localhost`.

## Configuración

Variables de entorno disponibles:

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3001` | Puerto HTTP y WebSocket. |
| `WS_PATH` | `/ws` | Ruta del servidor WebSocket. |
| `FROST_URL` | `http://localhost:8080/FROST-Server/v1.1` | URL base REST de SensorThings. |
| `FROST_MQTT_URL` | `mqtt://localhost:1883` | Broker MQTT de FROST. |
| `MQTT_CLIENT_ID` | `frost-visualization-gateway` | Identificador del cliente MQTT. |
| `CORS_ORIGIN` | `*` | Origen permitido para clientes HTTP; `*` permite cualquier dominio. |
| `CATALOG_REFRESH_MS` | `30000` | Periodo de refresco del catálogo; `0` lo desactiva. |
| `LOG_LEVEL` | `info` | Nivel reservado para filtrado futuro. |

El gateway habilita CORS para que el dashboard pueda ejecutarse en un origen
distinto, por ejemplo `http://localhost:3000`. El valor predeterminado `*` es
válido porque este servicio no utiliza cookies ni credenciales. En entornos
controlados se puede definir `CORS_ORIGIN` con un origen específico.

## API HTTP

### Salud

```text
GET /health
```

Ejemplo:

```json
{
  "status": "ok",
  "service": "gateway-visualizacion-frost",
  "timestamp": "2026-07-15T21:30:00.000Z",
  "mqtt": { "connected": true },
  "things": 22
}
```

`status` es `ok` cuando MQTT está conectado y `degraded` cuando todavía no lo
está.

### Catálogo de estaciones

```text
GET /catalog
```

El catálogo se construye desde FROST y contiene el contexto necesario para
interpretar un mensaje MQTT:

```json
{
  "things": [
    {
      "thingId": 15,
      "name": "Gaira",
      "type": "weather-station",
      "properties": {
        "type": "weather-station",
        "stationId": "gaira",
        "basin": "Gaira",
        "zone": "Bajo urbano",
        "altitude": 8
      },
      "position": {
        "lat": 11.187,
        "lon": -74.216,
        "alt": 8
      },
      "datastreams": [
        {
          "datastreamId": 44,
          "datastreamName": "gaira-precipitation-24h",
          "observedProperty": "Precipitacion acumulada 24h",
          "unitSymbol": "mm",
          "thingId": 15
        }
      ]
    }
  ]
}
```

Los IDs de `Thing` y `Datastream` son asignados por FROST y pueden cambiar al
usar otra base de datos. Para identificar una estación de forma estable use
`properties.stationId` o su nombre, no un ID fijo de ejemplo.

### Estado actual

```text
GET /things
```

Devuelve el último valor conocido por Datastream. Al inicio puede haber
estaciones sin métricas, porque el gateway siembra el estado desde el catálogo
antes de recibir el primer mensaje MQTT.

Ejemplo abreviado:

```json
{
  "things": [
    {
      "thingId": 15,
      "name": "Gaira",
      "type": "weather-station",
      "position": { "lat": 11.187, "lon": -74.216, "alt": 8 },
      "metrics": {
        "44": {
          "datastreamId": 44,
          "datastreamName": "gaira-precipitation-24h",
          "observedProperty": "Precipitacion acumulada 24h",
          "unitSymbol": "mm",
          "value": 63.8,
          "phenomenonTime": "2026-07-15T21:30:00Z"
        }
      },
      "lastUpdated": "2026-07-15T21:30:00Z"
    }
  ]
}
```

## API WebSocket

Endpoint:

```text
ws://localhost:3001/ws
```

Al conectarse, el cliente recibe un mensaje `welcome` y un `snapshot` inicial
con todas las estaciones conocidas.

### Suscribirse a estaciones

El filtro admite `thingTypes` y `thingIds`. Ambos son opcionales; si se omite
`filter`, se reciben todas las estaciones.

```json
{
  "action": "subscribe",
  "filter": {
    "thingTypes": ["weather-station"],
    "thingIds": [15]
  }
}
```

La respuesta es otro `snapshot` filtrado:

```json
{
  "type": "snapshot",
  "things": []
}
```

### Ping

```json
{ "action": "ping" }
```

Respuesta:

```json
{ "type": "pong" }
```

### Evento `observation`

Se emite por cada observación MQTT normalizada:

```json
{
  "type": "observation",
  "data": {
    "thingId": 15,
    "thingName": "Gaira",
    "type": "weather-station",
    "datastreamId": 44,
    "datastreamName": "gaira-precipitation-24h",
    "observedProperty": "Precipitacion acumulada 24h",
    "unitSymbol": "mm",
    "value": 63.8,
    "phenomenonTime": "2026-07-15T21:30:00Z"
  }
}
```

### Evento `thing.updated`

Se emite después de actualizar el estado de la estación:

```json
{
  "type": "thing.updated",
  "thing": {
    "thingId": 15,
    "name": "Gaira",
    "type": "weather-station",
    "properties": {
      "stationId": "gaira",
      "basin": "Gaira",
      "zone": "Bajo urbano"
    },
    "position": { "lat": 11.187, "lon": -74.216, "alt": 8 },
    "metrics": {
      "44": {
        "datastreamId": 44,
        "datastreamName": "gaira-precipitation-24h",
        "observedProperty": "Precipitacion acumulada 24h",
        "unitSymbol": "mm",
        "value": 63.8,
        "phenomenonTime": "2026-07-15T21:30:00Z"
      }
    },
    "lastUpdated": "2026-07-15T21:30:00Z"
  }
}
```

`metrics` contiene una entrada por Datastream, indexada por el ID numérico del
Datastream. El ejemplo está abreviado; en ejecución contiene las mediciones
recibidas hasta ese momento.

### Errores

Un JSON inválido o una acción desconocida produce:

```json
{
  "type": "error",
  "message": "Payload JSON invalido"
}
```

## Mensajes MQTT de FROST

El gateway se suscribe a un topic concreto por Datastream:

```text
v1.1/Datastreams(<datastreamId>)/Observations
```

Para el Datastream `44`:

```text
v1.1/Datastreams(44)/Observations
```

El simulador inserta la observación por REST y FROST publica un payload MQTT
similar a:

```json
{
  "result": 63.8,
  "phenomenonTime": "2026-07-15T21:30:00Z"
}
```

El gateway obtiene el `datastreamId` desde el topic y usa el catálogo REST para
resolver la estación, variable, unidad y ubicación. Por eso un mensaje MQTT no
necesita repetir todos los metadatos del Thing.

## Ejemplo de cliente web

```js
const socket = new WebSocket("ws://localhost:3001/ws");

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    action: "subscribe",
    filter: { thingTypes: ["weather-station"] }
  }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "thing.updated") {
    const station = message.thing;
    console.log(station.name, station.position, station.metrics);
  }
});
```

Para probar una tormenta desde el simulador:

```bash
curl -X POST http://localhost:3002/api/storm \
  -H 'Content-Type: application/json' \
  -d '{"stations":["gaira","bonda"]}'
```

La tormenta dura dos minutos por defecto y modifica progresivamente la
precipitación simulada. El gateway no calcula la alerta: entrega los valores y
metadatos para que el frontend aplique su propia visualización o reglas.

## Desarrollo y pruebas

```bash
npm test
npm run build
```

Las pruebas cubren la extracción del ID de Datastream desde el topic MQTT, la
carga y refresco del catálogo, la normalización de observaciones y la
agregación del estado por estación.

## Limitaciones actuales

- No hay autenticación ni autorización.
- El estado en vivo se pierde al reiniciar el gateway.
- El gateway no ofrece consultas históricas; para eso se consulta FROST REST.
- No filtra por variable o unidad en la suscripción WebSocket.
- El catálogo se refresca periódicamente para detectar Datastreams nuevos.
