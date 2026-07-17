# Resumen práctico de OGC SensorThings API 1.1 para FROST y el taller

La referencia normativa principal es:

- OGC SensorThings API Part 1: Sensing 1.1: https://docs.ogc.org/is/18-088/18-088.html

En este proyecto, FROST expone la API en:

```text
http://localhost:8080/FROST-Server/v1.1
```

## 1. Qué estándar está implementando FROST

FROST implementa **OGC SensorThings API 1.1**, un estándar REST/JSON para modelar sensores, activos IoT, flujos de observación y consultas históricas. La especificación define:

- un **modelo de entidades** para describir activos, sensores, variables y observaciones;
- una **interfaz HTTP** para crear, leer, actualizar y borrar recursos;
- un conjunto de **query options** heredadas de OData, como `$expand`, `$filter`, `$orderby`, `$top` y paginación con `nextLink`.

Para el taller, el valor real del estándar no es "guardar JSON", sino separar claramente:

- el **activo** que existe en el mundo (`Thing`);
- la **ubicación** del activo (`Location`);
- la **variable medida** (`ObservedProperty`);
- el **canal de medición** (`Datastream`);
- la **medición puntual** (`Observation`).

## 2. Entidades relevantes para el taller

La especificación define ocho entidades de sensado. Para el taller, estas son las importantes:

### 2.1. `Thing`

Representa el activo IoT o el activo digital observado. En el taller corresponde a:

- un bus eléctrico;
- un dron;
- cualquier vehículo o elemento móvil del gemelo digital.

Propiedades mínimas normativas:

- `name`
- `description`
- `properties` opcional

Relaciones relevantes:

- un `Thing` puede tener varias `Locations`;
- un `Thing` puede tener varios `Datastreams`.

Uso recomendado en el taller:

- 1 `Thing` por activo móvil.

Ejemplo conceptual:

```json
{
  "name": "bus-001",
  "description": "Bus electrico de ruta centro",
  "properties": {
    "assetType": "ELECTRIC_BUS",
    "modelUrl": "/models/electric-bus.glb",
    "routeId": "route-centro-01"
  }
}
```

### 2.2. `Location`

Describe la localización geográfica del `Thing`.

Propiedades mínimas normativas:

- `name`
- `description`
- `encodingType`
- `location`
- `properties` opcional

En la práctica, para FROST casi siempre usarás:

- `encodingType: "application/vnd.geo+json"` o `application/geo+json`
- `location` como GeoJSON

Uso recomendado en el taller:

- guardar la ubicación base o la última ubicación conocida del activo.

Ejemplo:

```json
{
  "name": "bus-001-current-location",
  "description": "Ultima ubicacion conocida del bus 001",
  "encodingType": "application/vnd.geo+json",
  "location": {
    "type": "Point",
    "coordinates": [-74.0721, 4.7110]
  }
}
```

### 2.3. `HistoricalLocation`

Registra la relación temporal entre un `Thing` y sus ubicaciones. La especificación lo usa para conservar la evolución de localizaciones de un activo.

Para el taller:

- es útil conceptualmente;
- no debería ser el foco pedagógico principal;
- puede dejarse a FROST como responsabilidad interna si el flujo principal se centra en `Observations`.

### 2.4. `Sensor`

Describe el instrumento o sistema que produce la observación.

Propiedades mínimas normativas:

- `name`
- `description`
- `encodingType`
- `metadata`
- `properties` opcional

Uso recomendado en el taller:

- no modelar hardware real en detalle;
- usar sensores lógicos como `gps-simulator`, `battery-simulator`, `temperature-simulator`, `speed-simulator`.

Ejemplo:

```json
{
  "name": "gps-simulator",
  "description": "Simulador de posicion para activos moviles",
  "encodingType": "text/html",
  "metadata": "https://example.org/docs/gps-simulator"
}
```

### 2.5. `ObservedProperty`

Describe el fenómeno observado. No es el valor, sino la clase de variable.

Propiedades mínimas normativas:

- `name`
- `definition`
- `description`
- `properties` opcional

Uso recomendado en el taller:

- crear una por variable de negocio:
  - `position`
  - `speed`
  - `battery`
  - `temperature`
  - opcionalmente `status`

Nota importante:

- `ObservedProperty` es la semántica de la variable.
- `Datastream` es el canal concreto donde esa variable se mide para un `Thing`.

### 2.6. `Datastream`

Es la entidad central para el taller. Un `Datastream` agrupa observaciones del mismo fenómeno, producidas por el mismo sensor y asociadas a un mismo `Thing`.

Propiedades mínimas normativas:

- `name`
- `description`
- `unitOfMeasurement`
- `observationType`
- `properties` opcional

Propiedades opcionales relevantes:

- `observedArea`
- `phenomenonTime`
- `resultTime`

Relaciones obligatorias:

- debe enlazar a un `Thing`;
- debe enlazar a un `Sensor`;
- debe enlazar a un `ObservedProperty`.

Uso recomendado en el taller:

- 1 `Datastream` por métrica y por activo.

Ejemplo para un mismo bus:

- `bus-001-speed`
- `bus-001-battery`
- `bus-001-temperature`

Decisión de modelado recomendada:

- si quieres simplicidad, usa un `Datastream` por métrica;
- no metas toda la telemetría heterogénea en un solo `Datastream`.

Eso encaja mejor con el estándar y simplifica lectura histórica, filtros y gráficas.

### 2.7. `Observation`

Es la medición concreta en un instante o intervalo.

Propiedades normativas clave:

- `phenomenonTime`
- `result`
- `resultTime`
- `parameters` opcional
- `validTime` opcional
- `resultQuality` opcional

Relaciones obligatorias:

- debe pertenecer a un `Datastream`;
- debe observar un `FeatureOfInterest`.

Comportamiento importante del estándar:

- si al crear una `Observation` no envías `phenomenonTime`, el servicio puede asignar la hora actual del servidor;
- si no envías `resultTime`, el servicio puede dejarlo en `null`;
- si no envías `FeatureOfInterest`, el servicio puede derivarlo desde la `Location` del `Thing`.

Uso recomendado en el taller:

- cada tick del simulador publica una `Observation` en cada `Datastream` relevante;
- para histórico y analítica, esta es la entidad que realmente se consulta.

### 2.8. `FeatureOfInterest`

Es la "cosa del mundo" sobre la que recae la observación.

En IoT de activos móviles, muchas veces coincide con la ubicación del `Thing`.
