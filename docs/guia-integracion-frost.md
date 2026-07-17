# Integración de FROST desde un navegador web

Esta guía describe cómo consultar estaciones meteorológicas en FROST y recibir observaciones en tiempo real desde una aplicación web.

La implementación es independiente del framework y puede utilizarse con cualquier tecnología que se ejecute en un navegador.

## 1. Arquitectura

~~~text
Navegador
  ├─ HTTP/REST ──────────────► FROST-Server
  └─ MQTT sobre WebSocket ──► FROST-Server
~~~

URLs del taller:

| Servicio | URL | Uso |
|---|---|---|
| REST de FROST | <code>http://localhost:8080/FROST-Server/v1.1</code> | Catálogo y estado inicial |
| MQTT-WebSocket | <code>ws://localhost:9876/mqtt</code> | Observaciones en tiempo real |

Un navegador no puede utilizar directamente <code>mqtt://localhost:1883</code>, porque esa URL usa MQTT sobre TCP. Para JavaScript en el navegador se debe utilizar MQTT sobre WebSocket:

~~~text
ws://localhost:9876/mqtt
~~~

La ruta <code>/mqtt</code> forma parte de la URL y es obligatoria.

## 2. Flujo de implementación

~~~text
1. Consultar el catálogo de Datastreams mediante REST.
2. Agrupar los Datastreams por estación.
3. Crear un índice datastreamId → estación.
4. Consultar la última observación de cada Datastream.
5. Conectar MQTT.js a FROST-WebSocket.
6. Suscribirse a los topics de los Datastreams.
7. Procesar las observaciones nuevas.
8. Actualizar la métrica y el estado de la estación.
9. Reconectar si la conexión se pierde.
10. Cerrar la conexión al abandonar la aplicación.
~~~

## 3. Catálogo mediante REST

El catálogo se obtiene consultando los Datastreams con su Thing, ubicación y propiedad observada:

~~~http
GET http://localhost:8080/FROST-Server/v1.1/Datastreams?$select=@iot.id,name,unitOfMeasurement&$expand=Thing($select=@iot.id,name,properties;$expand=Locations($select=location)),ObservedProperty($select=name)&$top=200
~~~

Respuesta simplificada:

~~~json
{
  "value": [
    {
      "@iot.id": 44,
      "name": "gaira-precipitation-24h",
      "unitOfMeasurement": { "symbol": "mm" },
      "ObservedProperty": { "name": "Precipitacion acumulada 24h" },
      "Thing": {
        "@iot.id": 15,
        "name": "Gaira",
        "properties": {
          "type": "weather-station",
          "stationId": "gaira"
        },
        "Locations": [
          {
            "location": {
              "type": "Point",
              "coordinates": [-74.216, 11.187, 8]
            }
          }
        ]
      }
    }
  ]
}
~~~

### Paginación

FROST puede devolver el enlace <code>@iot.nextLink</code>. El cliente debe continuar consultando hasta que no exista:

~~~js
let url = catalogUrl
const datastreams = []

while (url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('FROST respondió ' + response.status)
  }

  const page = await response.json()
  datastreams.push(...(page.value || []))
  url = page['@iot.nextLink'] || null
}
~~~

### Ubicación

Las coordenadas GeoJSON de SensorThings utilizan el orden:

~~~text
[longitud, latitud, altura]
~~~

## 4. Contratos de datos

Los siguientes contratos son independientes del lenguaje o framework.

### Datastream

~~~ts
{
  datastreamId: number
  datastreamName: string
  observedProperty: string
  unitSymbol?: string
  thingId: number
}
~~~

### Station

~~~ts
{
  thingId: number
  name: string
  type: string
  properties: Record<string, unknown>
  position?: {
    lat: number
    lon: number
    alt?: number
  }
  datastreams: Datastream[]
}
~~~

### Observation

~~~ts
{
  result: unknown
  phenomenonTime: string
}
~~~

### Metric y StationState

~~~ts
{
  datastreamId: number
  datastreamName: string
  observedProperty: string
  unitSymbol?: string
  value: unknown
  phenomenonTime: string
}

{
  thingId: number
  name: string
  type: string
  properties: Record<string, unknown>
  position?: Position
  metrics: Record<number, Metric>
  lastUpdated: string
}
~~~

## 5. Índice Datastream → estación

Los mensajes MQTT identifican el Datastream mediante el topic, pero no necesariamente contienen el nombre de la estación, la ubicación o la unidad.

Después de cargar el catálogo, crear un índice:

~~~js
const byDatastream = new Map()

for (const station of stations) {
  for (const datastream of station.datastreams) {
    byDatastream.set(datastream.datastreamId, {
      station,
      datastream,
    })
  }
}
~~~

## 6. Estado inicial mediante REST

Para obtener la última observación de un Datastream:

~~~http
GET http://localhost:8080/FROST-Server/v1.1/Datastreams(44)/Observations?$orderby=phenomenonTime%20desc&$top=1
~~~

Respuesta:

~~~json
{
  "value": [
    {
      "result": 63.8,
      "phenomenonTime": "2026-07-15T21:30:00Z"
    }
  ]
}
~~~

El cliente debe asociar el resultado con la metadata del Datastream y agregarlo a su estación.

## 7. MQTT.js en el navegador

MQTT.js es una librería JavaScript compatible con navegadores y conexiones MQTT sobre WebSocket.

Instálala con el gestor de paquetes de tu proyecto:

~~~bash
npm install mqtt
~~~

Conexión:

~~~js
import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:9876/mqtt', {
  clientId: 'browser-client-' + crypto.randomUUID(),
  reconnectPeriod: 3000,
})
~~~

El <code>clientId</code> debe ser diferente para cada pestaña o cliente conectado.

## 8. Suscripción a topics

El topic de observaciones tiene este formato:

~~~text
v1.1/Datastreams(<datastreamId>)/Observations
~~~

Ejemplo:

~~~text
v1.1/Datastreams(44)/Observations
~~~

Las suscripciones deben construirse usando los IDs obtenidos desde REST:

~~~js
client.on('connect', () => {
  for (const station of stations) {
    for (const datastream of station.datastreams) {
      const topic =
        'v1.1/Datastreams(' +
        datastream.datastreamId +
        ')/Observations'

      client.subscribe(topic)
    }
  }
})
~~~

No se deben asumir IDs fijos, porque FROST puede asignar IDs diferentes al utilizar otra base de datos.

## 9. Procesamiento de mensajes

Payload MQTT:

~~~json
{
  "result": 63.8,
  "phenomenonTime": "2026-07-15T21:30:00Z"
}
~~~

Procesamiento:

~~~js
client.on('message', (topic, payload) => {
  const match = topic.match(/Datastreams\((\d+)\)/)
  if (!match) return

  const datastreamId = Number(match[1])
  const context = byDatastream.get(datastreamId)
  if (!context) return

  let observation
  try {
    observation = JSON.parse(payload.toString())
  } catch {
    console.warn('Payload MQTT inválido')
    return
  }

  const previous = stateByStation.get(context.station.thingId)
  const next = {
    ...previous,
    metrics: { ...previous.metrics },
  }

  next.metrics[datastreamId] = {
    datastreamId,
    datastreamName: context.datastream.datastreamName,
    observedProperty: context.datastream.observedProperty,
    unitSymbol: context.datastream.unitSymbol,
    value: observation.result,
    phenomenonTime: observation.phenomenonTime,
  }

  next.lastUpdated = observation.phenomenonTime
  stateByStation.set(next.thingId, next)
  render(next)
})
~~~

La copia de <code>metrics</code> es importante: una observación de precipitación no debe eliminar temperatura ni humedad de la misma estación.

## 10. Eventos y ciclo de vida

~~~js
client.on('connect', () => console.log('Conectado a FROST MQTT'))
client.on('reconnect', () => console.log('Reconectando a FROST MQTT'))
client.on('close', () => console.log('Conexión MQTT cerrada'))
client.on('error', (error) => console.error('Error MQTT', error))
~~~

Cuando la aplicación se cierre o el componente que administra la conexión sea destruido:

~~~js
client.end(true)
~~~

MQTT.js puede volver a conectarse automáticamente con <code>reconnectPeriod</code> mayor que cero. Las suscripciones deben ser idempotentes para no registrarlas varias veces.

## 11. CORS y seguridad del navegador

FROST debe permitir el origen desde el cual se sirve la aplicación web:

~~~yaml
- http_cors_enable=true
- http_cors_allowed_origins=*
~~~

Para producción es preferible reemplazar <code>*</code> por el origen concreto de la aplicación.

Si la aplicación se sirve mediante HTTPS, MQTT debe utilizar WebSocket seguro:

~~~text
wss://dominio-frost/mqtt
~~~

Un navegador bloqueará una conexión <code>ws://</code> desde una página <code>https://</code> por contenido mixto.

Las credenciales incluidas en código JavaScript son visibles para el usuario. No se deben incluir secretos administrativos en una aplicación web pública.

## 12. Pruebas

Verificar que FROST esté ejecutándose:

~~~bash
docker compose ps
~~~

Verificar REST:

~~~bash
curl 'http://localhost:8080/FROST-Server/v1.1/Datastreams?$top=2'
~~~

Verificar MQTT-WebSocket:

~~~bash
nc -vz localhost 9876
~~~

Activar una tormenta desde el simulador:

~~~bash
curl -X POST http://localhost:3002/api/storm \
  -H 'Content-Type: application/json' \
  -d '{"stations":["gaira","bonda"]}'
~~~

La validación completa debe confirmar:

- El catálogo REST se carga.
- Se construye el índice de Datastreams.
- La última observación aparece en el estado inicial.
- MQTT.js conecta a <code>/mqtt</code>.
- Los topics reciben observaciones.
- Las métricas se actualizan sin perder valores anteriores.
- La reconexión vuelve a recibir datos.

## 13. Referencias

- [Documentación de FROST-Server](https://fraunhoferiosb.github.io/FROST-Server/)
- [Configuración MQTT de FROST](https://fraunhoferiosb.github.io/FROST-Server/settings/settings.html)
- [Uso de MQTT desde JavaScript en FROST](https://fraunhoferiosb.github.io/FROST-Server/sensorthingsapi/requestingData/STA-mqtt-javascript.html)
- [MQTT.js](https://github.com/mqttjs/MQTT.js/)
