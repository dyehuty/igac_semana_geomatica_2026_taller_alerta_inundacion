import Fastify, { type FastifyInstance } from "fastify";
import type { SimulationLoop } from "../app/SimulationLoop.js";
import type { StormController } from "../app/StormController.js";
import { CONTROL_PANEL_HTML } from "./controlPanelHtml.js";

interface StormBody {
  /** IDs opcionales; si se omiten o quedan vacíos se afectan todas las estaciones. */
  stations?: string[];
}

/**
 * Panel de control HTTP (Fastify): sirve la página de control y expone los
 * endpoints para consultar el estado y disparar/detener la tormenta.
 *
 * Rutas expuestas:
 * - `GET /`: HTML embebido del panel.
 * - `GET /api/status`: estado de la tormenta y número de estaciones.
 * - `POST /api/storm`: inicia una tormenta para todas o algunas estaciones.
 * - `POST /api/normal`: detiene la tormenta inmediatamente.
 *
 * @param storm Estado y ciclo de vida de la tormenta.
 * @param loop Catálogo de estaciones disponibles para validar objetivos.
 * @param rainThreshold Umbral que el panel muestra como referencia visual.
 * @returns Instancia Fastify lista para escuchar en un puerto.
 */
export function createControlApp(
  storm: StormController,
  loop: SimulationLoop,
  rainThreshold: number,
): FastifyInstance {
  const app = Fastify({ logger: false });

  /** Entrega el HTML autónomo del panel, sin depender de archivos estáticos. */
  app.get("/", (_request, reply) => {
    reply.type("text/html").send(CONTROL_PANEL_HTML);
  });

  /** Entrega estado para el panel y para clientes de automatización. */
  app.get("/api/status", () => {
    const status = storm.status();
    return {
      ...status,
      stationCount: loop.allStationIds().length,
      threshold: rainThreshold,
    };
  });

  /** Inicia una tormenta global o filtra los IDs de estación solicitados. */
  app.post<{ Body: StormBody }>("/api/storm", (request) => {
    const requested = request.body?.stations;
    const known = new Set(loop.allStationIds());
    const targets =
      requested && requested.length > 0
        ? requested.filter((id) => known.has(id))
        : loop.allStationIds();

    storm.start(targets);
    return storm.status();
  });

  /** Cancela una tormenta activa y deja el simulador en régimen normal. */
  app.post("/api/normal", () => {
    storm.stop();
    return storm.status();
  });

  return app;
}
