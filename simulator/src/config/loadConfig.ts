import "dotenv/config";

/**
 * Configuracion de ejecucion cargada desde variables de entorno.
 */
export interface AppConfig {
  /** URL base de la API REST de FROST-Server (SensorThings v1.1). */
  frostUrl: string;
  /** Puerto del panel de control HTTP. */
  port: number;
  /** Numero de estaciones a sembrar/simular. */
  stationCount: number;
  /** Periodo del bucle base de publicacion, en milisegundos. */
  baseTickMs: number;
  /** Duracion del evento de tormenta, en milisegundos. */
  stormDurationMs: number;
  /** Umbral critico de precipitacion acumulada 24h, en mm. */
  rainThreshold: number;
  /** Nivel solicitado al logger (actualmente informativo; se conserva en la configuración). */
  logLevel: string;
}

/**
 * Convierte una variable de entorno a entero o usa un valor predeterminado.
 *
 * @param name Nombre de la variable, usado también en el mensaje de error.
 * @param value Valor recibido desde `process.env`.
 * @param fallback Valor que se usa cuando la variable no está definida.
 * @returns El valor entero configurado.
 * @throws {Error} Si el valor definido no es un entero válido.
 */
function parseIntEnv(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`${name} debe ser un entero valido`);
  }

  return parsed;
}

/**
 * Carga y valida la configuracion de la aplicacion.
 * @returns Configuración normalizada, con URL sin slash final y números enteros.
 * @throws {Error} Si una variable numérica definida no es válida.
 */
export function loadConfig(): AppConfig {
  return {
    frostUrl: (process.env.FROST_URL ?? "http://localhost:8080/FROST-Server/v1.1").replace(
      /\/$/,
      "",
    ),
    port: parseIntEnv("PORT", process.env.PORT, 3002),
    stationCount: parseIntEnv("STATION_COUNT", process.env.STATION_COUNT, 22),
    baseTickMs: parseIntEnv("BASE_TICK_MS", process.env.BASE_TICK_MS, 2000),
    stormDurationMs: parseIntEnv("STORM_DURATION_MS", process.env.STORM_DURATION_MS, 120000),
    rainThreshold: parseIntEnv("RAIN_THRESHOLD", process.env.RAIN_THRESHOLD, 50),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
