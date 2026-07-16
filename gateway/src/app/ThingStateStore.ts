import type { ThingStateRepository } from "../domain/contracts.js";
import type { MetricValue, NormalizedObservation, ThingState } from "../domain/models.js";
import type { CatalogRegistry } from "./CatalogRegistry.js";

/**
 * Mantiene el estado en vivo por Thing: sus metricas mas recientes por
 * Datastream. Es generico (no calcula estado ni estilo). Se puede sembrar
 * desde el catalogo para que el snapshot muestre todos los Things de una vez.
 */
export class ThingStateStore implements ThingStateRepository {
  private readonly states = new Map<number, ThingState>();

  public constructor(private readonly catalog: CatalogRegistry) {}

  /**
   * Crea un estado vacio (sin metricas) por cada Thing del catalogo, para que
   * el snapshot inicial no espere a la primera observacion.
   */
  public seedFromCatalog(): void {
    for (const thing of this.catalog.getThings()) {
      if (!this.states.has(thing.thingId)) {
        this.states.set(thing.thingId, {
          thingId: thing.thingId,
          name: thing.name,
          type: thing.type,
          properties: thing.properties,
          position: thing.position,
          metrics: {},
          lastUpdated: "",
        });
      }
    }
  }

  public upsert(observation: NormalizedObservation): ThingState | null {
    const state = this.states.get(observation.thingId) ?? this.createState(observation.thingId);

    if (!state) {
      return null;
    }

    const metric: MetricValue = {
      datastreamId: observation.datastreamId,
      datastreamName: observation.datastreamName,
      observedProperty: observation.observedProperty,
      unitSymbol: observation.unitSymbol,
      value: observation.value,
      phenomenonTime: observation.phenomenonTime,
    };

    state.metrics[observation.datastreamId] = metric;
    state.lastUpdated = observation.phenomenonTime;
    this.states.set(state.thingId, state);
    return state;
  }

  public getAll(): ThingState[] {
    return [...this.states.values()];
  }

  private createState(thingId: number): ThingState | null {
    const thing = this.catalog.getThing(thingId);

    if (!thing) {
      return null;
    }

    const state: ThingState = {
      thingId: thing.thingId,
      name: thing.name,
      type: thing.type,
      properties: thing.properties,
      position: thing.position,
      metrics: {},
      lastUpdated: "",
    };

    this.states.set(thingId, state);
    return state;
  }
}
