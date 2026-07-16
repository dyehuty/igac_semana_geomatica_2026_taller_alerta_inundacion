# Visor de log del gateway

Herramienta de diagnóstico **muy simple** para ver, como un log en vivo, los datos que el
`gateway/` emite por WebSocket. Sirve para validar el flujo
`simulador → FROST → gateway → WebSocket` y los valores que se generan.

## Uso

1. Asegúrate de que estén corriendo: FROST (`docker compose up -d`), el simulador
   (`cd simulator && npm run dev`) y el gateway (`cd gateway && npm run dev`).
2. Abre **`index.html`** con doble clic en el navegador. No requiere instalar nada ni servidor:
   usa el `WebSocket` nativo y se conecta a `ws://localhost:3001/ws`.

Verás de inmediato:
- `welcome` → conexión establecida.
- `snapshot` → estado inicial de los 22 things (con sus nombres).
- Luego, cada ~2 s, líneas `observation` (una por lectura) y `thing.updated` (estado por Thing).

Ejemplo de línea de observación:

```
14:32:07.412  observation   Gaira · Precipitación acumulada 24h = 12.4 mm
```

## Probar la tormenta

Abre el panel del simulador en `http://localhost:3002` y pulsa **"Simular tormenta"**. En el log
verás cómo la precipitación de las estaciones **sube progresivamente y cruza 50 mm**. El gateway
entrega el **valor crudo** (sin color ni estado): las reglas de umbral/alerta son del frontend.

## Controles

- **Filtro de texto**: escribe p.ej. `precipitation` o `Gaira` para ver solo esas líneas.
- **auto-scroll**: sigue el final del log (desactívalo para inspeccionar hacia atrás).
- **Reconectar** / **Limpiar**. Cada línea guarda el JSON completo del frame en su `title`
  (pasa el cursor por encima para verlo).

## Configuración

Al inicio del `<script>` en `index.html`:

- `WS_URL` — por defecto `ws://localhost:3001/ws`.
- `SUBSCRIBE` — `null` = todos los things. Para filtrar en el servidor:
  `{ thingTypes: ["weather-station"] }` o `{ thingIds: [15] }`.

## Diagnóstico

- **Conecta pero solo `welcome`/`snapshot`, sin `observation`**: el simulador no está posteando.
  Revisa que esté corriendo y generando datos.
- **No conecta** (punto rojo parpadeando): el gateway no está en `:3001`. Revisa `WS_URL` y que
  `gateway` esté arriba (`curl http://localhost:3001/health`).
