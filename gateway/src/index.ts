import { loadConfig } from "./config/loadConfig.js";
import type { Logger } from "./domain/contracts.js";
import { CatalogRegistry } from "./app/CatalogRegistry.js";
import { ObservationNormalizer } from "./app/ObservationNormalizer.js";
import { ThingStateStore } from "./app/ThingStateStore.js";
import { ConsoleLogger } from "./infrastructure/ConsoleLogger.js";
import { FrostCatalogClient } from "./infrastructure/FrostCatalogClient.js";
import { MqttRealtimeSource } from "./infrastructure/MqttRealtimeSource.js";
import { createHttpApp } from "./interfaces/createHttpApp.js";
import { WebSocketGateway } from "./interfaces/WebSocketGateway.js";

const CATALOG_MAX_RETRIES = 30;
const CATALOG_RETRY_MS = 2000;

/** Espera a que FROST tenga al menos un Datastream en el catalogo. */
async function loadInitialCatalog(
  client: FrostCatalogClient,
  logger: Logger,
): Promise<Awaited<ReturnType<FrostCatalogClient["fetchCatalog"]>>> {
  for (let attempt = 1; attempt <= CATALOG_MAX_RETRIES; attempt += 1) {
    if (await client.isReachable()) {
      const things = await client.fetchCatalog();
      const datastreams = things.reduce((sum, thing) => sum + thing.datastreams.length, 0);

      if (datastreams > 0) {
        return things;
      }

      logger.info("Catalogo aun vacio; esperando datastreams...", { attempt });
    }

    await sleep(CATALOG_RETRY_MS);
  }

  throw new Error("FROST no expuso datastreams tras varios intentos");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new ConsoleLogger();
  const catalogClient = new FrostCatalogClient(config.frostUrl, logger);

  logger.info("Gateway de visualizacion FROST", {
    frostUrl: config.frostUrl,
    mqtt: config.frostMqttUrl,
  });

  const initialThings = await loadInitialCatalog(catalogClient, logger);
  const catalog = new CatalogRegistry(initialThings);
  const store = new ThingStateStore(catalog);
  store.seedFromCatalog();
  const normalizer = new ObservationNormalizer(catalog);
  const realtimeSource = new MqttRealtimeSource(config.frostMqttUrl, config.mqttClientId, logger);

  const httpApp = createHttpApp(realtimeSource, catalog, store, config.corsOrigin);
  const wsGateway = new WebSocketGateway(httpApp, config.wsPath, store, logger);
  wsGateway.start();

  logger.info("Catalogo cargado", {
    things: catalog.getThings().length,
    datastreams: catalog.allDatastreamIds().length,
  });

  await realtimeSource.start(catalog.allDatastreamIds(), (datastreamId, result, phenomenonTime) => {
    const observation = normalizer.normalize(datastreamId, result, phenomenonTime);

    if (!observation) {
      return;
    }

    const thing = store.upsert(observation);
    wsGateway.broadcastObservation(observation);

    if (thing) {
      wsGateway.broadcastThingUpdated(thing);
    }
  });

  // Refresco periodico: detecta datastreams nuevos (nuevos Things) y se suscribe.
  if (config.catalogRefreshMs > 0) {
    setInterval(() => {
      void refreshCatalog(catalogClient, catalog, store, realtimeSource, logger);
    }, config.catalogRefreshMs);
  }

  await httpApp.listen({ port: config.port, host: "0.0.0.0" });

  logger.info("Gateway listo", {
    http: `http://localhost:${config.port}`,
    ws: `ws://localhost:${config.port}${config.wsPath}`,
  });
}

async function refreshCatalog(
  client: FrostCatalogClient,
  catalog: CatalogRegistry,
  store: ThingStateStore,
  realtimeSource: MqttRealtimeSource,
  logger: Logger,
): Promise<void> {
  try {
    const things = await client.fetchCatalog();
    const newDatastreamIds = catalog.refresh(things);
    store.seedFromCatalog();

    if (newDatastreamIds.length > 0) {
      realtimeSource.subscribeMore(newDatastreamIds);
      logger.info("Catalogo refrescado con datastreams nuevos", {
        added: newDatastreamIds.length,
      });
    }
  } catch (error) {
    logger.warn("Fallo el refresco del catalogo", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
