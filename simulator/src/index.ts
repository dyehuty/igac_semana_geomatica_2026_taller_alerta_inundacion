import { loadConfig } from "./config/loadConfig.js";
import type { Logger } from "./domain/contracts.js";
import { CatalogBootstrap } from "./app/CatalogBootstrap.js";
import { ReadingGenerator } from "./app/ReadingGenerator.js";
import { SimulationLoop } from "./app/SimulationLoop.js";
import { StormController } from "./app/StormController.js";
import { STATIONS } from "./domain/stations.js";
import { ConsoleLogger } from "./infrastructure/ConsoleLogger.js";
import { FrostClient } from "./infrastructure/FrostClient.js";
import { createControlApp } from "./interfaces/createControlApp.js";

/** Número máximo de comprobaciones de disponibilidad antes de abortar el arranque. */
const FROST_MAX_RETRIES = 30;
/** Pausa entre comprobaciones de FROST durante el arranque. */
const FROST_RETRY_MS = 2000;

/**
 * Espera a que la API REST de FROST acepte peticiones.
 *
 * @param frost Cliente que consulta la raíz de SensorThings.
 * @param logger Logger para hacer visible el progreso durante el arranque.
 * @throws {Error} Si se agotan los intentos configurados.
 */
async function waitForFrost(frost: FrostClient, logger: Logger): Promise<void> {
  for (let attempt = 1; attempt <= FROST_MAX_RETRIES; attempt += 1) {
    if (await frost.isReachable()) {
      return;
    }
    logger.info("Esperando a FROST-Server...", { attempt, max: FROST_MAX_RETRIES });
    await sleep(FROST_RETRY_MS);
  }
  throw new Error("FROST-Server no respondio tras varios intentos");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new ConsoleLogger();
  const frost = new FrostClient(config.frostUrl, logger);

  logger.info("Simulador de estaciones - Santa Marta", { frostUrl: config.frostUrl });
  await waitForFrost(frost, logger);

  const stations = STATIONS.slice(0, config.stationCount);
  const runtimes = await new CatalogBootstrap(frost, logger).run(stations);

  const generator = new ReadingGenerator();
  const storm = new StormController(config.stormDurationMs);
  const loop = new SimulationLoop(
    runtimes,
    generator,
    storm,
    frost,
    logger,
    config.baseTickMs,
  );
  loop.start();

  const app = createControlApp(storm, loop, config.rainThreshold);
  await app.listen({ port: config.port, host: "0.0.0.0" });

  logger.info("Panel de control listo", {
    panel: `http://localhost:${config.port}`,
    threshold: `${config.rainThreshold} mm/24h`,
    stormDuration: `${config.stormDurationMs / 1000}s`,
  });

  const shutdown = async (): Promise<void> => {
    logger.info("Cerrando simulador...");
    loop.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

/** Resuelve después de la duración indicada sin bloquear el event loop. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
