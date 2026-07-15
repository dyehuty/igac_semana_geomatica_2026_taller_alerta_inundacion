# Simulador de estaciones meteorológicas → FROST-Server

Pieza de backend del taller **"Alertas de Inundación en Vivo: CesiumJS + IoT"**.
Genera datos de precipitación, temperatura y humedad para **22 estaciones de
Santa Marta** (cuenca del río Manzanares y cuencas vecinas) y los **inserta
directamente en FROST-Server** vía REST (OGC SensorThings API v1.1).

Incluye un **panel de control** para disparar un **evento de tormenta de 2
minutos** que eleva progresivamente la precipitación acumulada 24h por encima
del umbral crítico (50 mm) y luego regresa al régimen normal.

## Flujo

```
Simulador ──POST /v1.1/Observations──► FROST ──MQTT──► gateway ──WS──► frontend
```

El simulador solo escribe en FROST. El `gateway/` capta los cambios por MQTT y
los reemite al frontend; el simulador no necesita WebSocket propio.

## Requisitos

- Node.js ≥ 24
- FROST-Server corriendo (ver `docker-compose.yaml` en la raíz del repo)

## Uso

```bash
cp .env.example .env      # opcional; hay valores por defecto
npm install
npm run dev               # desarrollo (tsx watch)
# o
npm run build && npm start
```

### Docker Compose (entorno del taller)

Desde la raiz del repositorio:

```bash
docker compose up --build
```

Compose espera a que PostgreSQL y la API de FROST esten saludables antes de
iniciar el simulador. El panel de control queda disponible en
`http://localhost:3002` y FROST en `http://localhost:8080/FROST-Server/v1.1`.

La configuracion del simulador esta declarada explicitamente en el servicio
`simulator` de `docker-compose.yaml`; no requiere archivo `.env`. Para cambiar
la frecuencia de publicacion, edita esta propiedad:

```yaml
BASE_TICK_MS: 10000 # 10 segundos
```

Por ejemplo, usa `30000` para publicar cada 30 segundos.

Al arrancar:

1. Espera a que FROST responda.
2. **Siembra idempotente:** crea los `Thing` + `Location` + 3 `Datastream`
   (precipitación 24h, temperatura, humedad) de cada estación si no existen; si
   ya existen, reutiliza sus IDs (no duplica).
3. Inicia el **bucle base**: cada `BASE_TICK_MS` publica una observación por
   variable y estación.
4. Levanta el **panel de control** en `http://localhost:<PORT>`.

## Panel y API de control

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/` | Panel web (botón "Simular tormenta") |
| `GET` | `/api/status` | `{ mode, remainingMs, targetCount, stationCount, threshold }` |
| `POST` | `/api/storm` | Inicia tormenta 120s (body opcional `{ "stations": ["gaira", ...] }`, default todas) |
| `POST` | `/api/normal` | Fuerza el fin de la tormenta |

## Variables de entorno

Ver `.env.example`. Claves: `FROST_URL`, `PORT` (3002), `STATION_COUNT` (22),
`BASE_TICK_MS` (2000), `STORM_DURATION_MS` (120000), `RAIN_THRESHOLD` (50).

## Reglas de estado (referencia para el frontend)

| Estado | Precipitación 24h | Color |
|---|---|---|
| NORMAL | < 20 mm | Verde |
| WARNING | 20–50 mm | Amarillo |
| CRITICAL | > 50 mm | Rojo (parpadeo + alerta) |

## Tests

```bash
npm test
```

Cubren la rampa de precipitación (cruce de umbral), el ciclo de vida de la
tormenta y el contrato del cliente FROST.

## Zona de estudio

Santa Marta (Magdalena). Ubicación de estaciones respaldada por el estudio
*"Sistema de Información para Detección de Crecientes Súbitas en la Cuenca del
Río Manzanares en Santa Marta, Colombia"* (SciELO, 2017). Ver `domain/stations.ts`.
