/**
 * Rangos de valores normales (regimen sin tormenta).
 */
const NORMAL = {
  /** Precipitacion acumulada 24h en mm (por debajo del umbral WARNING de 20). */
  precipitation: { min: 0, max: 18 },
  /** Humedad relativa en %. */
  humidity: { min: 60, max: 88 },
  /** Temperatura de referencia a nivel del mar, en degC. */
  seaLevelTemp: 29,
  /** Ruido de temperatura, en degC. */
  tempNoise: 1.5,
} as const;

/** Gradiente termico vertical estandar: -6.5 degC por cada 1000 m. */
const LAPSE_RATE = 6.5 / 1000;

/**
 * Genera valores de las tres variables. Toda la aleatoriedad pasa por un RNG
 * inyectable para permitir pruebas deterministas; `rampPrecipitation` es pura
 * (sin RNG) y modela la rampa progresiva de la tormenta.
 */
export class ReadingGenerator {
  /**
   * @param rng Generador inyectable que devuelve valores en el intervalo [0, 1).
   *             Se inyecta en las pruebas para producir lecturas deterministas.
   */
  public constructor(private readonly rng: () => number = Math.random) {}

  /**
   * @returns Precipitación acumulada sintética, en mm y con una cifra decimal.
   */
  public precipitationNormal(): number {
    return round1(this.randomInRange(NORMAL.precipitation.min, NORMAL.precipitation.max));
  }

  /**
   * Precipitacion durante la tormenta: rampa progresiva y acelerada desde
   * `base` hasta `peak` conforme `progress` va de 0 a 1. Deterministe: mismos
   * argumentos -> mismo valor.
   * @param progress Progreso de la tormenta; se limita al intervalo [0, 1].
   * @param peak Valor máximo de precipitación para la estación, en mm/24 h.
   * @param base Valor inicial de la rampa, en mm/24 h.
   * @returns Precipitación interpolada y redondeada a una cifra decimal.
   */
  public rampPrecipitation(progress: number, peak: number, base = 8): number {
    const p = clamp01(progress);
    const eased = Math.pow(p, 1.5);
    return round1(base + (peak - base) * eased);
  }

  /**
   * Temperatura del aire ajustada por altitud (mas frio a mayor altura). En
   * tormenta desciende algunos grados por la lluvia.
   * @param altitude Altitud de la estación en metros.
   * @param isStorm Si está activo el descenso térmico de tormenta.
   * @returns Temperatura sintética en grados Celsius.
   */
  public temperature(altitude: number, isStorm: boolean): number {
    const base = NORMAL.seaLevelTemp - altitude * LAPSE_RATE;
    const stormDrop = isStorm ? 3 : 0;
    const noise = (this.rng() - 0.5) * 2 * NORMAL.tempNoise;
    return round1(base - stormDrop + noise);
  }

  /**
   * Genera humedad relativa; durante la tormenta sube hacia la saturación.
   * @param isStorm Si debe usar el rango húmedo de tormenta.
   * @returns Humedad sintética en porcentaje.
   */
  public humidity(isStorm: boolean): number {
    if (isStorm) {
      return round1(this.randomInRange(90, 99));
    }
    return round1(this.randomInRange(NORMAL.humidity.min, NORMAL.humidity.max));
  }

  /** Genera un valor uniforme entre los límites indicados. */
  private randomInRange(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }
}

/** Limita un progreso al intervalo válido [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Redondea una lectura a una cifra decimal para el payload de FROST. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
