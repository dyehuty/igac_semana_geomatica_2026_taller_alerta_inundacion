# Guía de contratos REST con FROST-Server

Esta guía explica cómo el simulador registra estaciones meteorológicas y sus
mediciones en FROST-Server. Está dirigida a participantes que quieran reutilizar
el mismo patrón con sensores y datos reales.

## Tabla de contenido

- [1. Introducción](#1-introducción)
- [2. Contexto: OGC SensorThings API](#2-contexto-ogc-sensorthings-api)
  - [2.1. El modelo aplicado a una estación meteorológica](#21-el-modelo-aplicado-a-una-estación-meteorológica)
- [3. Preparación](#3-preparación)
- [4. Flujo del simulador](#4-flujo-del-simulador)
- [5. Contratos HTTP](#5-contratos-http)
  - [5.1. Comprobar que FROST está disponible](#51-comprobar-que-frost-está-disponible)
  - [5.2. Buscar una estación y sus Datastreams](#52-buscar-una-estación-y-sus-datastreams)
  - [5.3. Registrar una estación con deep insert](#53-registrar-una-estación-con-deep-insert)
  - [5.4. Publicar una observación](#54-publicar-una-observación)
- [6. Patrón para enviar datos reales](#6-patrón-para-enviar-datos-reales)
- [7. Respuestas y errores](#7-respuestas-y-errores)
- [8. Referencias en este proyecto](#8-referencias-en-este-proyecto)

## 1. Introducción

FROST-Server implementa **OGC SensorThings API 1.1**, un estándar abierto para
describir sensores y publicar sus observaciones mediante HTTP y JSON. El
simulador usa su API REST para dos tareas distintas:

1. Registrar el catálogo de cada estación una sola vez.
2. Insertar las mediciones periódicas de precipitación, temperatura y humedad.

El mismo proceso aplica a un dispositivo real: primero se modela el activo y
sus flujos de datos; después se envían lecturas al flujo correcto. Esta guía
documenta únicamente las peticiones que el simulador realiza hoy. No cubre el
gateway, MQTT ni WebSocket.

## 2. Contexto: OGC SensorThings API

SensorThings evita guardar una medición como un JSON aislado. En su lugar,
separa el activo físico, el instrumento, la variable medida y cada lectura. Esa
separación hace que otros sistemas puedan interpretar los datos sin conocer el
fabricante del sensor.

### 2.1. El modelo aplicado a una estación meteorológica

```text
Thing: estación Gaira
├── Location: coordenadas de la estación
├── Datastream: gaira-precipitation-24h
│   ├── Sensor: pluviómetro
│   ├── ObservedProperty: precipitación acumulada 24 h
│   └── Observation: 63.8 mm a las 2026-07-14T21:30:00Z
├── Datastream: gaira-temperature
│   ├── Sensor: termómetro
│   ├── ObservedProperty: temperatura del aire
│   └── Observation: 27.4 °C a las 2026-07-14T21:30:00Z
└── Datastream: gaira-humidity
    ├── Sensor: higrómetro
    ├── ObservedProperty: humedad relativa
    └── Observation: 94.2 % a las 2026-07-14T21:30:00Z
```

| Entidad | Qué representa en este taller | Por qué importa |
|---|---|---|
| `Thing` | La estación meteorológica | Agrupa los flujos y su metadato común. |
| `Location` | La posición GeoJSON de la estación | Permite ubicarla en un mapa. |
| `Sensor` | El pluviómetro, termómetro o higrómetro | Describe el origen de una medición. |
| `ObservedProperty` | Precipitación, temperatura o humedad | Define el fenómeno observado. |
| `Datastream` | Un canal homogéneo de lecturas | Enlaza una estación, un sensor y una variable. |
| `Observation` | Una medición con tiempo y resultado | Es el dato que se inserta continuamente. |

Para ampliar este contexto, consulta el
[resumen del estándar](../resumen-estandar-ogc-sensorthings.md) y la
[especificación oficial OGC SensorThings API 1.1](https://docs.ogc.org/is/18-088/18-088.html).

## 3. Preparación

La API se accede por una raíz versionada. En este proyecto las direcciones son:

| Desde dónde se ejecuta el cliente | URL base |
|---|---|
| Máquina anfitriona | `http://localhost:8080/FROST-Server/v1.1` |
| Contenedor `simulator` de Docker Compose | `http://web:8080/FROST-Server/v1.1` |

En los ejemplos se usa esta variable para no repetir la dirección:

```bash
FROST_URL="http://localhost:8080/FROST-Server/v1.1"
```

`FROST_URL` ya contiene `/v1.1`. Por ello, las rutas de las tablas son
relativas a esa raíz: para el endpoint `/Observations` se usa
`$FROST_URL/Observations`, **no** `$FROST_URL/v1.1/Observations`.

Los `GET` del simulador incluyen `Accept: application/json`. Los `POST`
incluyen `Content-Type: application/json`. La instancia local del taller no
requiere autenticación; una instalación real puede exigir encabezados de
autenticación adicionales.

## 4. Flujo del simulador

Al iniciar, por cada estación el simulador sigue este orden:

```text
GET /v1.1                         comprobar disponibilidad
GET /v1.1/Things?...               buscar la estación y sus Datastreams
POST /v1.1/Things                  crear el catálogo si no existe
GET /v1.1/Things?...               recuperar los IDs de Datastream creados
POST /v1.1/Observations            publicar una lectura por variable
```

Si encuentra un `Thing` con los tres Datastreams esperados, reutiliza sus IDs
en vez de crear otro catálogo. En cada ciclo de simulación publica una
observación de cada variable por estación.

## 5. Contratos HTTP

### 5.1. Comprobar que FROST está disponible

| Aspecto | Valor |
|---|---|
| Método | `GET` |
| Endpoint | `/v1.1` |
| Encabezado | `Accept: application/json` |
| Uso en el simulador | Esperar antes de sembrar el catálogo. |
| Éxito | Cualquier estado HTTP `2xx` y una respuesta JSON. |

```bash
curl --fail --header "Accept: application/json" "$FROST_URL"
```

El simulador intenta esta petición hasta 30 veces, con 2 segundos entre
intentos. Si FROST no responde, no registra ni publica datos.

### 5.2. Buscar una estación y sus Datastreams

| Aspecto | Valor |
|---|---|
| Método | `GET` |
| Endpoint | `/v1.1/Things` |
| Encabezado | `Accept: application/json` |
| Consulta OData | `$filter` por nombre y `$expand` de `Datastreams` |
| Uso en el simulador | Sembrado idempotente y recuperación de IDs. |

El simulador busca por el nombre exacto del `Thing` y solicita solamente el ID
y nombre de sus Datastreams:

```text
GET /Things?$filter=name%20eq%20%27Gaira%27&$expand=Datastreams($select=@iot.id,name)
```

Ejemplo equivalente con `curl`:

```bash
curl --get --fail \
  --header "Accept: application/json" \
  --data-urlencode "\$filter=name eq 'Gaira'" \
  --data-urlencode "\$expand=Datastreams(\$select=@iot.id,name)" \
  "$FROST_URL/Things"
```

Una respuesta simplificada tiene esta forma:

```json
{
  "value": [
    {
      "@iot.id": 7,
      "name": "Gaira",
      "Datastreams": [
        { "@iot.id": 101, "name": "gaira-precipitation-24h" },
        { "@iot.id": 102, "name": "gaira-temperature" },
        { "@iot.id": 103, "name": "gaira-humidity" }
      ]
    }
  ]
}
```

Los IDs (`101`, `102` y `103` en el ejemplo) pertenecen a esa instancia de
FROST. No deben suponerse ni copiarse a otra instalación: hay que consultarlos
o persistirlos al crear el catálogo.

### 5.3. Registrar una estación con deep insert

| Aspecto | Valor |
|---|---|
| Método | `POST` |
| Endpoint | `/v1.1/Things` |
| Encabezado | `Content-Type: application/json` |
| Patrón SensorThings | *Deep insert* de entidades relacionadas. |
| Uso en el simulador | Crear una estación, su ubicación y sus tres flujos en una petición. |

El siguiente payload corresponde al cuerpo que el simulador construye para la
estación Gaira. `coordinates` sigue el orden GeoJSON **[longitud, latitud,
altitud]**, no `[latitud, longitud]`.

El simulador crea un `Sensor` y una `ObservedProperty` dentro de cada estación
porque simplifica la demostración. En una red real suele ser preferible contar
con un catálogo compartido de sensores y propiedades, y enlazar esos recursos
existentes, para no crear duplicados semánticos.

```json
{
  "name": "Gaira",
  "description": "Estacion meteorologica Gaira (Bajo urbano, cuenca Gaira) - Santa Marta",
  "properties": {
    "type": "weather-station",
    "stationId": "gaira",
    "basin": "Gaira",
    "zone": "Bajo urbano",
    "altitude": 8
  },
  "Locations": [
    {
      "name": "Gaira - ubicacion",
      "description": "Ubicacion de la estacion Gaira",
      "encodingType": "application/geo+json",
      "location": { "type": "Point", "coordinates": [-74.216, 11.187, 8] }
    }
  ],
  "Datastreams": [
    {
      "name": "gaira-precipitation-24h",
      "description": "Precipitacion acumulada 24h en Gaira",
      "observationType": "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement",
      "unitOfMeasurement": { "name": "millimetre", "symbol": "mm", "definition": "http://qudt.org/vocab/unit/MilliM" },
      "Sensor": { "name": "pluviometro-simulado", "description": "Pluviometro simulado (acumulado 24h)", "encodingType": "text/html", "metadata": "https://www.ideam.gov.co/" },
      "ObservedProperty": { "name": "Precipitacion acumulada 24h", "definition": "http://vocabs.lter-europe.net/EnvThes/22035", "description": "Precipitacion acumulada en una ventana de 24 horas" }
    },
    {
      "name": "gaira-temperature",
      "description": "Temperatura del aire en Gaira",
      "observationType": "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement",
      "unitOfMeasurement": { "name": "degree Celsius", "symbol": "degC", "definition": "http://qudt.org/vocab/unit/DEG_C" },
      "Sensor": { "name": "termometro-simulado", "description": "Termometro simulado", "encodingType": "text/html", "metadata": "https://www.ideam.gov.co/" },
      "ObservedProperty": { "name": "Temperatura", "definition": "http://www.qudt.org/qudt/owl/1.0.0/quantity/Instances.html#ThermodynamicTemperature", "description": "Temperatura del aire" }
    },
    {
      "name": "gaira-humidity",
      "description": "Humedad relativa en Gaira",
      "observationType": "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement",
      "unitOfMeasurement": { "name": "percent", "symbol": "%", "definition": "http://qudt.org/vocab/unit/PERCENT" },
      "Sensor": { "name": "higrometro-simulado", "description": "Higrometro simulado", "encodingType": "text/html", "metadata": "https://www.ideam.gov.co/" },
      "ObservedProperty": { "name": "Humedad relativa", "definition": "https://en.wikipedia.org/wiki/Relative_humidity", "description": "Humedad relativa del aire" }
    }
  ]
}
```

Guarda el JSON anterior en `gaira.json` para enviarlo manualmente:

```bash
curl --fail --request POST \
  --header "Content-Type: application/json" \
  --data @gaira.json \
  "$FROST_URL/Things"
```

Después de crear la estación, ejecuta de nuevo la consulta de la sección 5.2
para obtener los IDs reales de sus Datastreams. Esos IDs son necesarios para
el siguiente contrato.

### 5.4. Publicar una observación

| Aspecto | Valor |
|---|---|
| Método | `POST` |
| Endpoint | `/v1.1/Observations` |
| Encabezado | `Content-Type: application/json` |
| Relación | `Datastream.@iot.id` enlaza la lectura con su flujo. |
| Uso en el simulador | Insertar una lectura por variable y estación en cada ciclo. |

El simulador publica el mismo tiempo de fenómeno para las tres variables de
una estación dentro de un ciclo. El formato es ISO 8601 en UTC.

**Precipitación acumulada 24 h** — el ID es ilustrativo:

```json
{
  "Datastream": { "@iot.id": 101 },
  "phenomenonTime": "2026-07-14T21:30:00Z",
  "result": 63.8
}
```

**Temperatura:**

```json
{
  "Datastream": { "@iot.id": 102 },
  "phenomenonTime": "2026-07-14T21:30:00Z",
  "result": 27.4
}
```

**Humedad relativa:**

```json
{
  "Datastream": { "@iot.id": 103 },
  "phenomenonTime": "2026-07-14T21:30:00Z",
  "result": 94.2
}
```

Ejemplo de envío de la lectura de precipitación:

```bash
curl --fail --request POST \
  --header "Content-Type: application/json" \
  --data '{
    "Datastream": { "@iot.id": 101 },
    "phenomenonTime": "2026-07-14T21:30:00Z",
    "result": 63.8
  }' \
  "$FROST_URL/Observations"
```

`result` debe respetar la unidad declarada por el Datastream: mm para
precipitación, `degC` para temperatura y `%` para humedad.

## 6. Patrón para enviar datos reales

Sigue este procedimiento al integrar un dispositivo real:

1. Define qué activo se representará como `Thing` y verifica su posición.
2. Crea una sola vez el `Thing`, su `Location` y un Datastream por variable
   homogénea; usa nombres estables y unidades correctas.
3. Asigna una identidad estable y única a la estación. El simulador busca por
   nombre exacto, por lo que en una integración real los nombres deben ser
   únicos; conserva además un identificador propio, por ejemplo `stationId`, en
   `properties`.
4. Consulta y guarda los IDs de Datastream que FROST asignó.
5. En cada lectura del dispositivo, transforma el valor a la unidad declarada
   y envía un `POST /Observations` al ID correspondiente.
6. Usa la hora a la que ocurrió el fenómeno en `phenomenonTime`, en UTC. No
   sustituyas ese tiempo por la hora de recepción si el sensor estuvo sin red.
7. Si se acumulan lecturas fuera de línea, publica cada observación con su
   timestamp original; no es necesario volver a registrar el catálogo.

Para precipitación real, el valor enviado como acumulado de 24 horas debe
calcularse a partir de incrementos o del contador del pluviómetro. El simulador
usa valores sintéticos para la demostración, pero una integración real no debe
generar un acumulado independiente en cada ciclo.

El simulador tampoco envía explícitamente un `FeatureOfInterest`. Para repetir
su contrato local no hace falta añadirlo; antes de integrar otro servidor
SensorThings, verifica si ese servidor exige modelarlo o lo resuelve mediante
la ubicación de la estación.

## 7. Respuestas y errores

El cliente del simulador considera exitosa cualquier respuesta HTTP `2xx`.
Ante otro estado, conserva hasta 500 caracteres del cuerpo de respuesta y
lanza un error. Comprueba especialmente:

- `400`: JSON o relaciones inválidas; revisa `Datastream.@iot.id`, que el
  valor ya esté convertido a la unidad del Datastream y el formato de fecha.
- `401` o `403`: la instalación requiere autenticación o no autoriza escribir.
- `404`: la URL base, la versión o el ID de Datastream no existen.
- `5xx`: FROST o su base de datos no están disponibles; reintenta la operación
  sin alterar el timestamp original de la medición.

Una pérdida de red o un *timeout* después de enviar un `POST` es ambiguo:
FROST puede haber registrado la observación aunque el cliente no recibiera la
respuesta. Un reintento ciego puede duplicarla. Para datos reales, usa una
cola local que conserve el Datastream y el tiempo del fenómeno, y antes de
reintentar define una estrategia de deduplicación o verifica si la observación
ya fue persistida.

El simulador solo reintenta automáticamente la comprobación inicial de FROST.
Para una fuente real conviene añadir esa cola local y una política de reintento
para no perder lecturas cuando la red falle.

## 8. Referencias en este proyecto

- [Cliente HTTP de FROST](src/infrastructure/FrostClient.ts): construye las
  peticiones de disponibilidad, búsqueda y publicación.
- [Sembrado del catálogo](src/app/CatalogBootstrap.ts): define el payload de
  deep insert y cómo se obtienen los IDs de Datastream.
- [Bucle de simulación](src/app/SimulationLoop.ts): define cuándo se publican
  las observaciones.
- [Resumen del estándar SensorThings](../resumen-estandar-ogc-sensorthings.md):
  explicación amplia del modelo y de otros contratos del estándar.
