import { describe, expect, it } from "vitest";
import { CatalogRegistry } from "../src/app/CatalogRegistry.js";
import { ObservationNormalizer } from "../src/app/ObservationNormalizer.js";
import { ThingStateStore } from "../src/app/ThingStateStore.js";
import { datastreamIdFromTopic } from "../src/infrastructure/MqttRealtimeSource.js";
import type { ThingContext } from "../src/domain/models.js";

function gaira(): ThingContext {
  return {
    thingId: 15,
    name: "Gaira",
    type: "weather-station",
    properties: { basin: "Gaira" },
    position: { lon: -74.216, lat: 11.187, alt: 8 },
    datastreams: [
      { datastreamId: 44, datastreamName: "gaira-precipitation-24h", observedProperty: "Precipitacion", unitSymbol: "mm", thingId: 15 },
      { datastreamId: 45, datastreamName: "gaira-humidity", observedProperty: "Humedad", unitSymbol: "%", thingId: 15 },
    ],
  };
}

describe("datastreamIdFromTopic", () => {
  it("extrae el id del topic de FROST", () => {
    expect(datastreamIdFromTopic("v1.1/Datastreams(45)/Observations")).toBe(45);
  });
  it("devuelve null para topics no reconocidos", () => {
    expect(datastreamIdFromTopic("v1.1/Observations")).toBeNull();
    expect(datastreamIdFromTopic("basura")).toBeNull();
  });
});

describe("CatalogRegistry.refresh", () => {
  it("devuelve solo los datastream ids nuevos", () => {
    const registry = new CatalogRegistry([gaira()]);
    expect(registry.allDatastreamIds().sort()).toEqual([44, 45]);

    const withNew: ThingContext = {
      ...gaira(),
      datastreams: [
        ...gaira().datastreams,
        { datastreamId: 99, datastreamName: "gaira-temperature", observedProperty: "Temp", thingId: 15 },
      ],
    };
    expect(registry.refresh([withNew])).toEqual([99]);
  });
});

describe("ObservationNormalizer", () => {
  const catalog = new CatalogRegistry([gaira()]);
  const normalizer = new ObservationNormalizer(catalog);

  it("resuelve el contexto de un datastream conocido", () => {
    const obs = normalizer.normalize(44, 63.8, "2026-07-15T21:30:00Z");
    expect(obs).toMatchObject({
      thingId: 15,
      thingName: "Gaira",
      type: "weather-station",
      datastreamName: "gaira-precipitation-24h",
      observedProperty: "Precipitacion",
      unitSymbol: "mm",
      value: 63.8,
    });
  });

  it("devuelve null para un datastream desconocido", () => {
    expect(normalizer.normalize(9999, 1, "t")).toBeNull();
  });
});

describe("ThingStateStore", () => {
  it("siembra Things vacios y actualiza metricas por observacion", () => {
    const catalog = new CatalogRegistry([gaira()]);
    const store = new ThingStateStore(catalog);
    store.seedFromCatalog();

    const seeded = store.getAll();
    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.metrics).toEqual({});
    expect(seeded[0]!.position).toEqual({ lon: -74.216, lat: 11.187, alt: 8 });

    const updated = store.upsert({
      thingId: 15,
      thingName: "Gaira",
      type: "weather-station",
      datastreamId: 44,
      datastreamName: "gaira-precipitation-24h",
      observedProperty: "Precipitacion",
      unitSymbol: "mm",
      value: 63.8,
      phenomenonTime: "2026-07-15T21:30:00Z",
    });

    expect(updated?.metrics[44]?.value).toBe(63.8);
    expect(updated?.lastUpdated).toBe("2026-07-15T21:30:00Z");
  });

  it("no crea estado para un Thing fuera del catalogo", () => {
    const store = new ThingStateStore(new CatalogRegistry([]));
    const result = store.upsert({
      thingId: 404, thingName: "X", type: "unknown", datastreamId: 1,
      datastreamName: "d", observedProperty: "p", value: 1, phenomenonTime: "t",
    });
    expect(result).toBeNull();
  });
});
