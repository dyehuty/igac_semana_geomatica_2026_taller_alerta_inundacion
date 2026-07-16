import Fastify, { type FastifyInstance } from "fastify";
import type { CatalogProvider, RealtimeSource } from "../domain/contracts.js";
import type { ThingState } from "../domain/models.js";

/**
 * Superficie HTTP: salud, catalogo de Things y snapshot en vivo.
 */
export function createHttpApp(
  realtimeSource: RealtimeSource,
  catalog: CatalogProvider,
  store: { getAll(): ThingState[] },
): FastifyInstance {
  const app = Fastify();

  app.get("/health", async () => ({
    status: realtimeSource.isConnected() ? "ok" : "degraded",
    service: "gateway-visualizacion-frost",
    timestamp: new Date().toISOString(),
    mqtt: { connected: realtimeSource.isConnected() },
    things: catalog.getThings().length,
  }));

  app.get("/catalog", async () => ({ things: catalog.getThings() }));

  app.get("/things", async () => ({ things: store.getAll() }));

  return app;
}
