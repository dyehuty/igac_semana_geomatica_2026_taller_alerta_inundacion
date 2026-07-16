import type { Logger } from "../domain/contracts.js";
import type { DatastreamContext, Position, ThingContext } from "../domain/models.js";

/** Forma parcial de un Datastream expandido devuelto por FROST. */
interface FrostDatastream {
  "@iot.id": number;
  name: string;
  unitOfMeasurement?: { symbol?: string } | null;
  ObservedProperty?: { name?: string } | null;
  Thing?: FrostThing | null;
}

interface FrostThing {
  "@iot.id": number;
  name: string;
  properties?: Record<string, unknown> | null;
  Locations?: Array<{ location?: { type?: string; coordinates?: number[] } | null }> | null;
}

const CATALOG_QUERY =
  "/Datastreams?$select=@iot.id,name,unitOfMeasurement" +
  "&$expand=Thing($select=@iot.id,name,properties;$expand=Locations($select=location))," +
  "ObservedProperty($select=name)&$top=200";

/**
 * Cliente REST que arma el catalogo Datastream -> Thing desde FROST-Server.
 * Es la fuente de contexto (nombre, type, properties, ubicacion, variable,
 * unidad) que las observaciones MQTT "peladas" no traen.
 */
export class FrostCatalogClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Descarga el catalogo completo (paginando por @iot.nextLink) y lo agrupa por
   * Thing.
   */
  public async fetchCatalog(): Promise<ThingContext[]> {
    const things = new Map<number, ThingContext>();
    let url: string | null = `${this.baseUrl}${CATALOG_QUERY}`;

    while (url) {
      const page = (await this.getJson(url)) as {
        value?: FrostDatastream[];
        "@iot.nextLink"?: string;
      };

      for (const datastream of page.value ?? []) {
        this.accumulate(things, datastream);
      }

      url = page["@iot.nextLink"] ?? null;
    }

    return [...things.values()];
  }

  /** Verifica si FROST responde (para reintentos en el arranque). */
  public async isReachable(): Promise<boolean> {
    try {
      await this.getJson(this.baseUrl);
      return true;
    } catch (error) {
      this.logger.warn("FROST REST no responde todavia", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private accumulate(things: Map<number, ThingContext>, datastream: FrostDatastream): void {
    const thing = datastream.Thing;

    if (!thing) {
      return;
    }

    const existing = things.get(thing["@iot.id"]) ?? this.toThingContext(thing);
    const datastreamContext: DatastreamContext = {
      datastreamId: datastream["@iot.id"],
      datastreamName: datastream.name,
      observedProperty: datastream.ObservedProperty?.name ?? datastream.name,
      unitSymbol: datastream.unitOfMeasurement?.symbol ?? undefined,
      thingId: thing["@iot.id"],
    };

    existing.datastreams.push(datastreamContext);
    things.set(thing["@iot.id"], existing);
  }

  private toThingContext(thing: FrostThing): ThingContext {
    const properties = thing.properties ?? {};
    const type = typeof properties["type"] === "string" ? (properties["type"] as string) : "unknown";

    return {
      thingId: thing["@iot.id"],
      name: thing.name,
      type,
      properties,
      position: this.toPosition(thing.Locations),
      datastreams: [],
    };
  }

  private toPosition(
    locations: FrostThing["Locations"],
  ): Position | undefined {
    const coordinates = locations?.[0]?.location?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return undefined;
    }

    const [lon, lat, alt] = coordinates;
    return {
      lon: Number(lon),
      lat: Number(lat),
      alt: typeof alt === "number" ? alt : undefined,
    };
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`GET ${url} -> ${response.status}`);
    }

    return response.json();
  }
}
