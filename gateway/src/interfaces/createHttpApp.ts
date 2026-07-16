import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { CatalogProvider, RealtimeSource } from "../domain/contracts.js";
import type { ThingState } from "../domain/models.js";

/**
 * Superficie HTTP: salud, catalogo de Things y snapshot en vivo.
 */
export function createHttpApp(
  realtimeSource: RealtimeSource,
  catalog: CatalogProvider,
  store: { getAll(): ThingState[] },
  corsOrigin = "*",
): FastifyInstance {
  const app = Fastify();

  // El gateway es consumido directamente por el dashboard desde otro origen.
  // `*` es seguro en este servicio porque no utiliza cookies ni credenciales.
  void app.register(cors, {
    origin: corsOrigin,
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

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
