import type { NormalizedObservation, ThingContext, ThingState } from "./models.js";

/**
 * Contrato minimo de logger para mantener reemplazable la infraestructura.
 */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Fuente de observaciones crudas por Datastream (adaptador MQTT de FROST).
 */
export interface RealtimeSource {
  start(
    datastreamIds: number[],
    onObservation: (datastreamId: number, result: unknown, phenomenonTime: string) => void,
  ): Promise<void>;
  subscribeMore(datastreamIds: number[]): void;
  isConnected(): boolean;
}

/**
 * Proveedor del catalogo de Things para descubrimiento y arranque.
 */
export interface CatalogProvider {
  getThings(): ThingContext[];
}

/**
 * Almacena el estado normalizado en vivo por Thing.
 */
export interface ThingStateRepository {
  upsert(observation: NormalizedObservation): ThingState | null;
  getAll(): ThingState[];
}
