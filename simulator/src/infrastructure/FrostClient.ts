import type { Logger, ObservationInput } from "../domain/contracts.js";

/**
 * Datastream tal como lo devuelve FROST al expandir un Thing.
 */
export interface FrostDatastream {
  /** Identificador numérico asignado por FROST. */
  "@iot.id": number;
  /** Nombre estable usado para distinguir la variable de la estación. */
  name: string;
}

/**
 * Thing con sus Datastreams expandidos.
 */
export interface FrostThing {
  /** Identificador numérico asignado por FROST. */
  "@iot.id": number;
  /** Nombre exacto de la estación. */
  name: string;
  /** Datastreams incluidos cuando la consulta usa `$expand`. */
  Datastreams?: FrostDatastream[];
}

/**
 * Cliente REST minimo para la API OGC SensorThings v1.1 de FROST-Server.
 * Usa el `fetch` global de Node (>=18); no requiere dependencias HTTP.
 */
export class FrostClient {
  /**
   * @param baseUrl Raíz de SensorThings, incluyendo la versión `/v1.1` y sin slash final.
   * @param logger Logger usado para informar fallos de disponibilidad.
   */
  public constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Busca un Thing por nombre exacto e incluye sus Datastreams.
   * Devuelve null si no existe. Sirve para el sembrado idempotente.
   */
  /**
   * Busca un Thing por nombre exacto y expande sus Datastreams.
   *
   * @param name Nombre que se escapa y codifica dentro del filtro OData.
   * @returns El primer Thing coincidente o `null` si la colección está vacía.
   * @throws {Error} Si FROST responde con un estado no exitoso o JSON inválido.
   */
  public async findThingByName(name: string): Promise<FrostThing | null> {
    const filter = encodeURIComponent(`name eq '${name.replace(/'/g, "''")}'`);
    const url = `${this.baseUrl}/Things?$filter=${filter}&$expand=Datastreams($select=@iot.id,name)`;
    const body = (await this.getJson(url)) as { value?: FrostThing[] };
    const first = body.value?.[0];
    return first ?? null;
  }

  /**
   * Crea un Thing con deep-insert (Location + Datastreams + Sensor +
   * ObservedProperty en una sola peticion).
   */
  /**
   * @param body Payload SensorThings, normalmente un deep insert construido por `CatalogBootstrap`.
   * @throws {Error} Si FROST rechaza la petición.
   */
  public async createThing(body: unknown): Promise<void> {
    await this.post("/Things", body);
  }

  /**
   * Publica una observacion enlazada a un Datastream existente por @iot.id.
   */
  /**
   * @param input ID del Datastream, resultado numérico y tiempo del fenómeno.
   * @throws {Error} Si FROST rechaza la observación.
   */
  public async postObservation(input: ObservationInput): Promise<void> {
    await this.post("/Observations", {
      Datastream: { "@iot.id": input.datastreamId },
      phenomenonTime: input.phenomenonTime,
      result: input.result,
    });
  }

  /**
   * Verifica disponibilidad del servicio (GET a la raiz de la API).
   */
  /**
   * Comprueba la raíz de la API sin propagar el error: el arranque decide cuándo reintentar.
   * @returns `true` si FROST responde correctamente; `false` ante red o estado HTTP no exitoso.
   */
  public async isReachable(): Promise<boolean> {
    try {
      await this.getJson(this.baseUrl);
      return true;
    } catch (error) {
      this.logger.warn("FROST no responde todavia", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Ejecuta un GET JSON y convierte cualquier respuesta no-2xx en un error descriptivo. */
  private async getJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`GET ${url} -> ${response.status} ${await safeText(response)}`);
    }

    return response.json();
  }

  /** Ejecuta un POST JSON relativo a `baseUrl` y acepta cualquier respuesta 2xx. */
  private async post(path: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // 201 Created (o 200/204 segun configuracion). Cualquier 2xx es exito.
    if (!response.ok) {
      throw new Error(`POST ${url} -> ${response.status} ${await safeText(response)}`);
    }
  }
}

/** Lee una muestra limitada del cuerpo de error sin ocultar fallos secundarios. */
async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}
