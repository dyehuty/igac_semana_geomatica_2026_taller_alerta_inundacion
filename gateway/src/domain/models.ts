/**
 * Posicion geografica generica (derivada de la Location del Thing en FROST).
 */
export interface Position {
  lat: number;
  lon: number;
  alt?: number | undefined;
}

/**
 * Contexto estatico de un Datastream, tomado del catalogo REST de FROST.
 */
export interface DatastreamContext {
  datastreamId: number;
  datastreamName: string;
  observedProperty: string;
  unitSymbol?: string | undefined;
  thingId: number;
}

/**
 * Contexto estatico de un Thing y sus Datastreams. Es generico: no asume
 * ningun dominio (estaciones hoy, vehiculos manana). El "type" sale de
 * `properties.type` y las `properties` viajan tal cual.
 */
export interface ThingContext {
  thingId: number;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  position?: Position | undefined;
  datastreams: DatastreamContext[];
}

/**
 * Ultimo valor observado de un Datastream.
 */
export interface MetricValue {
  datastreamId: number;
  datastreamName: string;
  observedProperty: string;
  unitSymbol?: string | undefined;
  value: unknown;
  phenomenonTime: string;
}

/**
 * Estado en vivo de un Thing: sus metricas mas recientes por Datastream.
 */
export interface ThingState {
  thingId: number;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  position?: Position | undefined;
  metrics: Record<number, MetricValue>;
  lastUpdated: string;
}

/**
 * Observacion normalizada individual (evento crudo del stream).
 */
export interface NormalizedObservation {
  thingId: number;
  thingName: string;
  type: string;
  datastreamId: number;
  datastreamName: string;
  observedProperty: string;
  unitSymbol?: string | undefined;
  value: unknown;
  phenomenonTime: string;
}

/**
 * Filtro opcional de suscripcion del cliente WebSocket.
 */
export interface SubscriptionFilter {
  thingTypes?: string[] | undefined;
  thingIds?: number[] | undefined;
}

/**
 * Mensaje de protocolo recibido desde clientes WebSocket.
 */
export type ClientMessage =
  | { action: "subscribe"; filter?: SubscriptionFilter }
  | { action: "ping" };
