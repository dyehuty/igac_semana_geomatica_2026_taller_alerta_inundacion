import type { Logger, ObservationInput, StationRuntime } from "../domain/contracts.js";
import type { FrostClient } from "../infrastructure/FrostClient.js";
import type { ReadingGenerator } from "./ReadingGenerator.js";
import type { StormController } from "./StormController.js";

/**
 * Bucle base de simulacion: en cada tick publica una observacion de
 * precipitacion, temperatura y humedad por estacion en FROST-Server. Si la
 * estacion esta bajo tormenta, la precipitacion sigue la rampa progresiva.
 */
export class SimulationLoop {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /**
   * @param runtimes Estaciones y IDs de Datastream ya resueltos en FROST.
   * @param generator Generador de valores meteorológicos.
   * @param storm Controlador que decide qué estaciones están bajo tormenta.
   * @param frost Cliente REST usado para insertar observaciones.
   * @param logger Registrador de inicio y fallos parciales.
   * @param tickMs Intervalo entre ciclos de publicación en milisegundos.
   */
  public constructor(
    private readonly runtimes: StationRuntime[],
    private readonly generator: ReadingGenerator,
    private readonly storm: StormController,
    private readonly frost: FrostClient,
    private readonly logger: Logger,
    private readonly tickMs: number,
  ) {}

  /** Ids de todas las estaciones (para disparar tormenta sobre todas). */
  /** @returns IDs de todas las estaciones disponibles para el panel. */
  public allStationIds(): string[] {
    return this.runtimes.map((runtime) => runtime.station.id);
  }

  /** Inicia un único temporizador de publicación; llamadas repetidas no duplican ciclos. */
  public start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    this.logger.info("Bucle de simulacion iniciado", {
      stations: this.runtimes.length,
      tickMs: this.tickMs,
    });
  }

  /** Detiene el temporizador; es seguro llamar aunque ya esté detenido. */
  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Construye tres observaciones por estación y las publica en paralelo.
   * Si FROST tarda más que el intervalo, descarta el ciclo solapado para evitar
   * concurrencia ilimitada; un fallo individual no impide publicar los demás.
   */
  private async tick(): Promise<void> {
    // Evita solapar ticks si FROST responde mas lento que el periodo.
    if (this.running) {
      return;
    }
    this.running = true;

    const phenomenonTime = new Date().toISOString();
    const observations: ObservationInput[] = [];

    for (const { station, datastreamIds } of this.runtimes) {
      const isStorm = this.storm.isTarget(station.id);
      const precipitation = isStorm
        ? this.generator.rampPrecipitation(this.storm.progress(), this.storm.peakFor(station.id) ?? 0)
        : this.generator.precipitationNormal();

      observations.push(
        { datastreamId: datastreamIds.precipitation, result: precipitation, phenomenonTime },
        {
          datastreamId: datastreamIds.temperature,
          result: this.generator.temperature(station.alt, isStorm),
          phenomenonTime,
        },
        {
          datastreamId: datastreamIds.humidity,
          result: this.generator.humidity(isStorm),
          phenomenonTime,
        },
      );
    }

    const results = await Promise.allSettled(
      observations.map((observation) => this.frost.postObservation(observation)),
    );

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      this.logger.warn("Fallaron observaciones en el tick", {
        failed: failed.length,
        total: observations.length,
        sample:
          failed[0]?.status === "rejected" ? String(failed[0].reason).slice(0, 200) : undefined,
      });
    }

    this.running = false;
  }
}
