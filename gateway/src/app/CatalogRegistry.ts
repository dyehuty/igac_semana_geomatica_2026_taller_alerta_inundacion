import type { CatalogProvider } from "../domain/contracts.js";
import type { DatastreamContext, ThingContext } from "../domain/models.js";

/**
 * Mantiene el catalogo de Things y el indice Datastream -> contexto, con
 * lookups rapidos y refresco incremental.
 */
export class CatalogRegistry implements CatalogProvider {
  private things: ThingContext[] = [];
  private readonly thingById = new Map<number, ThingContext>();
  private readonly datastreamById = new Map<number, DatastreamContext>();

  public constructor(things: ThingContext[] = []) {
    this.load(things);
  }

  /**
   * Reemplaza el catalogo y devuelve los ids de Datastream nuevos (no vistos
   * antes), para suscribirse solo a esos.
   */
  public refresh(things: ThingContext[]): number[] {
    const previousIds = new Set(this.datastreamById.keys());
    this.load(things);
    return [...this.datastreamById.keys()].filter((id) => !previousIds.has(id));
  }

  public getThings(): ThingContext[] {
    return this.things;
  }

  public getDatastream(datastreamId: number): DatastreamContext | undefined {
    return this.datastreamById.get(datastreamId);
  }

  public getThing(thingId: number): ThingContext | undefined {
    return this.thingById.get(thingId);
  }

  public allDatastreamIds(): number[] {
    return [...this.datastreamById.keys()];
  }

  private load(things: ThingContext[]): void {
    this.things = things;
    this.thingById.clear();
    this.datastreamById.clear();

    for (const thing of things) {
      this.thingById.set(thing.thingId, thing);

      for (const datastream of thing.datastreams) {
        this.datastreamById.set(datastream.datastreamId, datastream);
      }
    }
  }
}
