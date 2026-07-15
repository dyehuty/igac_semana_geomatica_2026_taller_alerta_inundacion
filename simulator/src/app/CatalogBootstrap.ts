import type { Logger, Station, StationRuntime, Variable } from "../domain/contracts.js";
import type { FrostDatastream, FrostThing } from "../infrastructure/FrostClient.js";
import { FrostClient } from "../infrastructure/FrostClient.js";

const OM_MEASUREMENT =
  "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement";

/** Sufijo de nombre de Datastream por variable (identidad estable en FROST). */
const DATASTREAM_SUFFIX: Record<Variable, string> = {
  precipitation: "-precipitation-24h",
  temperature: "-temperature",
  humidity: "-humidity",
};

/**
 * Siembra idempotente del catalogo SensorThings en FROST-Server.
 *
 * Por cada estacion garantiza un Thing con Location y tres Datastreams
 * (precipitacion acumulada 24h, temperatura y humedad). Si el Thing ya existe
 * con sus tres Datastreams, reutiliza sus IDs en lugar de duplicar.
 */
export class CatalogBootstrap {
  /**
   * @param frost Cliente que consulta y modifica el catálogo SensorThings.
   * @param logger Logger para informar cuántas estaciones se crean o reutilizan.
   */
  public constructor(
    private readonly frost: FrostClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Garantiza el catálogo de todas las estaciones y devuelve los IDs necesarios para publicar.
   *
   * @param stations Estaciones que se quieren simular.
   * @returns Configuración de ejecución con tres IDs por estación.
   * @throws {Error} Si una estación creada no puede leerse de nuevo con sus Datastreams.
   */
  public async run(stations: Station[]): Promise<StationRuntime[]> {
    const runtimes: StationRuntime[] = [];
    let created = 0;
    let reused = 0;

    for (const station of stations) {
      const existing = await this.frost.findThingByName(station.name);

      if (existing && this.hasAllDatastreams(existing)) {
        runtimes.push(this.toRuntime(station, existing.Datastreams ?? []));
        reused += 1;
        continue;
      }

      if (existing) {
        this.logger.warn("Thing existente incompleto; se recrea el catalogo", {
          station: station.name,
        });
      }

      await this.frost.createThing(buildStationBody(station));
      const persisted = await this.frost.findThingByName(station.name);

      if (!persisted || !this.hasAllDatastreams(persisted)) {
        throw new Error(`No se pudieron leer los Datastreams de ${station.name} tras crearlo`);
      }

      runtimes.push(this.toRuntime(station, persisted.Datastreams ?? []));
      created += 1;
    }

    this.logger.info("Catalogo listo", { total: runtimes.length, created, reused });
    return runtimes;
  }

  /** Comprueba que existen los tres Datastreams identificados por sus sufijos estables. */
  private hasAllDatastreams(thing: FrostThing): boolean {
    const names = thing.Datastreams ?? [];
    return (Object.keys(DATASTREAM_SUFFIX) as Variable[]).every((variable) =>
      names.some((ds) => ds.name.endsWith(DATASTREAM_SUFFIX[variable])),
    );
  }

  /** Traduce la respuesta expandida de FROST al contrato interno del bucle. */
  private toRuntime(station: Station, datastreams: FrostDatastream[]): StationRuntime {
    const datastreamIds = {} as Record<Variable, number>;

    for (const variable of Object.keys(DATASTREAM_SUFFIX) as Variable[]) {
      const match = datastreams.find((ds) => ds.name.endsWith(DATASTREAM_SUFFIX[variable]));

      if (!match) {
        throw new Error(`Falta el Datastream de ${variable} en ${station.name}`);
      }

      datastreamIds[variable] = match["@iot.id"];
    }

    return { station, datastreamIds };
  }
}

/**
 * Construye el cuerpo deep-insert de un Thing con su Location y sus tres
 * Datastreams (cada uno con Sensor y ObservedProperty).
 */
/**
 * Construye el deep insert SensorThings para una estación meteorológica.
 *
 * @param station Metadatos espaciales y de dominio que se serializarán.
 * @returns Payload listo para `POST /Things`.
 */
export function buildStationBody(station: Station): unknown {
  return {
    name: station.name,
    description: `Estacion meteorologica ${station.name} (${station.zone}, cuenca ${station.basin}) - Santa Marta`,
    properties: {
      type: "weather-station",
      stationId: station.id,
      basin: station.basin,
      zone: station.zone,
      altitude: station.alt,
    },
    Locations: [
      {
        name: `${station.name} - ubicacion`,
        description: `Ubicacion de la estacion ${station.name}`,
        encodingType: "application/geo+json",
        location: {
          type: "Point",
          coordinates: [station.lon, station.lat, station.alt],
        },
      },
    ],
    Datastreams: [
      {
        name: `${station.id}${DATASTREAM_SUFFIX.precipitation}`,
        description: `Precipitacion acumulada 24h en ${station.name}`,
        observationType: OM_MEASUREMENT,
        unitOfMeasurement: {
          name: "millimetre",
          symbol: "mm",
          definition: "http://qudt.org/vocab/unit/MilliM",
        },
        Sensor: {
          name: "pluviometro-simulado",
          description: "Pluviometro simulado (acumulado 24h)",
          encodingType: "text/html",
          metadata: "https://www.ideam.gov.co/",
        },
        ObservedProperty: {
          name: "Precipitacion acumulada 24h",
          definition: "http://vocabs.lter-europe.net/EnvThes/22035",
          description: "Precipitacion acumulada en una ventana de 24 horas",
        },
      },
      {
        name: `${station.id}${DATASTREAM_SUFFIX.temperature}`,
        description: `Temperatura del aire en ${station.name}`,
        observationType: OM_MEASUREMENT,
        unitOfMeasurement: {
          name: "degree Celsius",
          symbol: "degC",
          definition: "http://qudt.org/vocab/unit/DEG_C",
        },
        Sensor: {
          name: "termometro-simulado",
          description: "Termometro simulado",
          encodingType: "text/html",
          metadata: "https://www.ideam.gov.co/",
        },
        ObservedProperty: {
          name: "Temperatura",
          definition:
            "http://www.qudt.org/qudt/owl/1.0.0/quantity/Instances.html#ThermodynamicTemperature",
          description: "Temperatura del aire",
        },
      },
      {
        name: `${station.id}${DATASTREAM_SUFFIX.humidity}`,
        description: `Humedad relativa en ${station.name}`,
        observationType: OM_MEASUREMENT,
        unitOfMeasurement: {
          name: "percent",
          symbol: "%",
          definition: "http://qudt.org/vocab/unit/PERCENT",
        },
        Sensor: {
          name: "higrometro-simulado",
          description: "Higrometro simulado",
          encodingType: "text/html",
          metadata: "https://www.ideam.gov.co/",
        },
        ObservedProperty: {
          name: "Humedad relativa",
          definition: "https://en.wikipedia.org/wiki/Relative_humidity",
          description: "Humedad relativa del aire",
        },
      },
    ],
  };
}
