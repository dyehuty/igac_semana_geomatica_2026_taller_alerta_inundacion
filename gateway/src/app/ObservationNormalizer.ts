import type { NormalizedObservation } from "../domain/models.js";
import type { CatalogRegistry } from "./CatalogRegistry.js";

/**
 * Convierte una observacion cruda (id de datastream + result + tiempo) en una
 * observacion normalizada, resolviendo el contexto (Thing, variable, unidad)
 * desde el catalogo. Devuelve null si el datastream no esta en el catalogo.
 */
export class ObservationNormalizer {
  public constructor(private readonly catalog: CatalogRegistry) {}

  public normalize(
    datastreamId: number,
    result: unknown,
    phenomenonTime: string,
  ): NormalizedObservation | null {
    const datastream = this.catalog.getDatastream(datastreamId);

    if (!datastream) {
      return null;
    }

    const thing = this.catalog.getThing(datastream.thingId);

    if (!thing) {
      return null;
    }

    return {
      thingId: thing.thingId,
      thingName: thing.name,
      type: thing.type,
      datastreamId: datastream.datastreamId,
      datastreamName: datastream.datastreamName,
      observedProperty: datastream.observedProperty,
      unitSymbol: datastream.unitSymbol,
      value: result,
      phenomenonTime,
    };
  }
}
