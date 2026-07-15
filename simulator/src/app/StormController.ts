/**
 * Estado del simulador expuesto al panel de control.
 */
export interface StormStatus {
  /** Régimen actual expuesto al panel. */
  mode: "normal" | "storm";
  /** Milisegundos hasta la expiración; vale 0 en régimen normal. */
  remainingMs: number;
  /** Número de estaciones objetivo durante la tormenta. */
  targetCount: number;
}

/**
 * Controla el evento de tormenta: al iniciarse, eleva progresivamente la
 * precipitacion de las estaciones objetivo durante `durationMs` y luego vuelve
 * al regimen normal de forma automatica (expira por tiempo, sin timer).
 */
export class StormController {
  private startedAt: number | null = null;
  private readonly peaks = new Map<string, number>();

  /**
   * @param durationMs Duración de la tormenta en milisegundos.
   * @param peakRange Rango de precipitación acumulada 24 h que alcanzarán las estaciones objetivo.
   * @param rng Generador inyectable para asignar picos reproducibles en pruebas.
   * @param now Reloj inyectable; facilita probar expiración y progreso sin esperar tiempo real.
   */
  public constructor(
    private readonly durationMs: number,
    private readonly peakRange: { min: number; max: number } = { min: 55, max: 85 },
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Inicia la tormenta sobre las estaciones indicadas, asignando a cada una un
   * pico de precipitacion aleatorio dentro de `peakRange` (por encima del
   * umbral critico) para que crucen el umbral de forma escalonada.
   */
  /**
   * Activa o reinicia la tormenta para un conjunto de estaciones.
   *
   * @param targetIds Identificadores de estación que recibirán la rampa extrema.
   */
  public start(targetIds: string[]): void {
    this.startedAt = this.now();
    this.peaks.clear();

    for (const id of targetIds) {
      const peak =
        this.peakRange.min + this.rng() * (this.peakRange.max - this.peakRange.min);
      this.peaks.set(id, peak);
    }
  }

  /** Fuerza el fin de la tormenta y vuelve al regimen normal. */
  /** Detiene la tormenta inmediatamente y elimina sus picos asignados. */
  public stop(): void {
    this.startedAt = null;
    this.peaks.clear();
  }

  /** Indica si la tormenta esta activa en el instante dado. */
  /**
   * Indica si la tormenta sigue dentro de su ventana temporal.
   * @returns `true` mientras no haya expirado; no necesita un temporizador propio.
   */
  public isActive(): boolean {
    if (this.startedAt === null) {
      return false;
    }
    return this.now() < this.startedAt + this.durationMs;
  }

  /** Progreso 0..1 de la tormenta segun el tiempo transcurrido. */
  /**
   * Calcula el avance normalizado de la tormenta.
   * @returns Un valor entre `0` y `1`, donde `1` representa el final de la ventana.
   */
  public progress(): number {
    if (this.startedAt === null) {
      return 0;
    }
    const elapsed = this.now() - this.startedAt;
    return clamp01(elapsed / this.durationMs);
  }

  /** Milisegundos restantes de la tormenta (0 si no esta activa). */
  /**
   * @returns Milisegundos restantes o `0` si la tormenta no está activa.
   */
  public remainingMs(): number {
    if (this.startedAt === null || !this.isActive()) {
      return 0;
    }
    return this.startedAt + this.durationMs - this.now();
  }

  /** Indica si una estacion esta siendo afectada por la tormenta activa. */
  /**
   * @param stationId Identificador estable de la estación.
   * @returns `true` si la estación está incluida en la tormenta vigente.
   */
  public isTarget(stationId: string): boolean {
    return this.isActive() && this.peaks.has(stationId);
  }

  /** Pico de precipitacion asignado a una estacion objetivo. */
  /**
   * @param stationId Identificador estable de la estación.
   * @returns El pico asignado o `undefined` si no es una estación objetivo.
   */
  public peakFor(stationId: string): number | undefined {
    return this.peaks.get(stationId);
  }

  /** Obtiene el estado serializable que consume el panel de control. */
  public status(): StormStatus {
    const active = this.isActive();
    return {
      mode: active ? "storm" : "normal",
      remainingMs: this.remainingMs(),
      targetCount: active ? this.peaks.size : 0,
    };
  }
}

/** Limita un valor de progreso al intervalo [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
