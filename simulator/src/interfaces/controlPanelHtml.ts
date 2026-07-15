/**
 * Panel de control HTML del simulador. Se sirve embebido para que el build
 * (solo `tsc`) funcione igual en `dev` y en `dist` sin copiar archivos.
 */
export const CONTROL_PANEL_HTML = /* html */ `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Simulador de estaciones - Santa Marta</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0;
    }
    .card {
      width: min(520px, 92vw); background: #1e293b; border: 1px solid #334155;
      border-radius: 16px; padding: 28px; box-shadow: 0 12px 40px rgba(0,0,0,.35);
    }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    p.sub { margin: 0 0 20px; color: #94a3b8; font-size: .9rem; }
    .status {
      display: flex; align-items: center; gap: 12px; padding: 14px 16px;
      border-radius: 12px; background: #0f172a; border: 1px solid #334155; margin-bottom: 20px;
    }
    .dot { width: 14px; height: 14px; border-radius: 50%; background: #22c55e; }
    .dot.storm { background: #ef4444; animation: blink 1s steps(2, start) infinite; }
    @keyframes blink { 50% { opacity: .25; } }
    .status .mode { font-weight: 600; }
    .status .meta { margin-left: auto; color: #94a3b8; font-size: .85rem; text-align: right; }
    button {
      width: 100%; padding: 16px; border: 0; border-radius: 12px; font-size: 1rem;
      font-weight: 600; cursor: pointer; transition: transform .05s, filter .15s;
    }
    button:active { transform: translateY(1px); }
    .btn-storm { background: #dc2626; color: white; }
    .btn-storm:hover { filter: brightness(1.08); }
    .btn-normal { background: transparent; color: #94a3b8; border: 1px solid #334155; margin-top: 10px; }
    .btn-normal:hover { color: #e2e8f0; }
    .facts { margin-top: 18px; font-size: .8rem; color: #64748b; line-height: 1.5; }
    code { color: #cbd5e1; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Simulador de estaciones meteorologicas</h1>
    <p class="sub">Zona de estudio: Santa Marta - cuenca del rio Manzanares</p>

    <div class="status">
      <span id="dot" class="dot"></span>
      <span id="mode" class="mode">Normal</span>
      <span id="meta" class="meta"></span>
    </div>

    <button id="storm" class="btn-storm">Simular tormenta (2 min)</button>
    <button id="normal" class="btn-normal">Volver a normal</button>

    <p class="facts">
      La tormenta eleva progresivamente la precipitacion acumulada 24h por encima
      del umbral critico de <code id="thr">50</code> mm y luego vuelve al regimen
      normal. Las observaciones se escriben en FROST-Server y llegan al frontend
      por el gateway.
    </p>
  </main>

  <script>
    // El panel solo controla el simulador; las observaciones siguen viajando
    // del proceso Node a FROST y luego al gateway.
    const dot = document.getElementById("dot");
    const mode = document.getElementById("mode");
    const meta = document.getElementById("meta");
    const thr = document.getElementById("thr");

    // Refresca el estado cada segundo para actualizar el contador de tormenta.
    async function refresh() {
      try {
        const res = await fetch("/api/status");
        const s = await res.json();
        thr.textContent = s.threshold;
        if (s.mode === "storm") {
          dot.className = "dot storm";
          mode.textContent = "Tormenta activa";
          const secs = Math.ceil(s.remainingMs / 1000);
          meta.textContent = s.targetCount + " estaciones - " + secs + "s restantes";
        } else {
          dot.className = "dot";
          mode.textContent = "Normal";
          meta.textContent = s.stationCount + " estaciones activas";
        }
      } catch (e) {
        mode.textContent = "Sin conexion";
        meta.textContent = "";
      }
    }

    // Sin lista de estaciones, el backend aplica la tormenta a todas.
    document.getElementById("storm").addEventListener("click", async () => {
      await fetch("/api/storm", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      refresh();
    });
    // Detiene la tormenta inmediatamente, aunque no haya expirado su duración.
    document.getElementById("normal").addEventListener("click", async () => {
      await fetch("/api/normal", { method: "POST" });
      refresh();
    });

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`;
