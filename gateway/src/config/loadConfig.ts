import "dotenv/config";

/**
 * Configuracion de ejecucion cargada desde variables de entorno.
 */
export interface AppConfig {
  port: number;
  wsPath: string;
  /** URL base de la API REST de FROST (SensorThings v1.1). */
  frostUrl: string;
  /** URL del broker MQTT de FROST. */
  frostMqttUrl: string;
  mqttClientId: string;
  /** Orígenes autorizados por CORS; `*` permite cualquier dominio. */
  corsOrigin: string;
  /** Periodo de refresco del catalogo en ms (0 = desactivado). */
  catalogRefreshMs: number;
  logLevel: string;
}

function parseIntEnv(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`${name} debe ser un entero valido`);
  }

  return parsed;
}

/**
 * Carga y valida la configuracion de la aplicacion.
 */
export function loadConfig(): AppConfig {
  return {
    port: parseIntEnv("PORT", process.env.PORT, 3001),
    wsPath: process.env.WS_PATH ?? "/ws",
    frostUrl: (process.env.FROST_URL ?? "http://localhost:8080/FROST-Server/v1.1").replace(
      /\/$/,
      "",
    ),
    frostMqttUrl: process.env.FROST_MQTT_URL ?? process.env.MQTT_URL ?? "mqtt://localhost:1883",
    mqttClientId: process.env.MQTT_CLIENT_ID ?? "frost-visualization-gateway",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    catalogRefreshMs: parseIntEnv("CATALOG_REFRESH_MS", process.env.CATALOG_REFRESH_MS, 30000),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
