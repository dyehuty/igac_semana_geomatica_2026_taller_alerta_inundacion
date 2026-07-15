/**
 * Contrato minimo de logger para mantener reemplazable la infraestructura.
 * Mismo contrato que gateway/src/domain/contracts.ts para consistencia.
 */
export interface Logger {
  /** Registra un mensaje informativo. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Registra una condición recuperable o inesperada. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Registra un error de la aplicación. */
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Variable observada por una estacion. Cada una corresponde a un Datastream
 * en FROST-Server.
 */
export type Variable = "precipitation" | "temperature" | "humidity";

/**
 * Estacion meteorologica de la zona de estudio (Santa Marta).
 */
export interface Station {
  /** Identificador estable, en kebab-case (ej. "barrio-manzanares"). */
  id: string;
  /** Nombre legible de la estacion. */
  name: string;
  /** Cuenca o zona (ej. "Manzanares", "Gaira"). */
  basin: string;
  /** Descripcion de la ubicacion dentro de la cuenca. */
  zone: string;
  /** Latitud en grados decimales (WGS84). */
  lat: number;
  /** Longitud en grados decimales (WGS84). */
  lon: number;
  /** Altitud en metros sobre el nivel del mar. */
  alt: number;
}

/**
 * Estacion ya sembrada en FROST con los IDs de sus tres Datastreams.
 */
export interface StationRuntime {
  /** Metadatos estáticos de la estación. */
  station: Station;
  /** IDs asignados por FROST, indexados por variable observada. */
  datastreamIds: Record<Variable, number>;
}

/**
 * Observacion lista para enviar a FROST.
 */
export interface ObservationInput {
  /** ID del Datastream al que pertenece la lectura. */
  datastreamId: number;
  /** Resultado numérico en la unidad declarada por el Datastream. */
  result: number;
  /** Instante del fenómeno en formato ISO 8601, normalmente UTC. */
  phenomenonTime: string;
}
