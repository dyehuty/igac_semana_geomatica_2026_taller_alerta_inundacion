import { afterEach, describe, expect, it, vi } from "vitest";
import { FrostCatalogClient } from "../src/infrastructure/FrostCatalogClient.js";

const silentLogger = { info() {}, warn() {}, error() {} };
const BASE = "http://frost.test/FROST-Server/v1.1";

const PAGE = {
  value: [
    {
      "@iot.id": 45,
      name: "gaira-humidity",
      unitOfMeasurement: { symbol: "%" },
      ObservedProperty: { name: "Humedad relativa" },
      Thing: {
        "@iot.id": 15,
        name: "Gaira",
        properties: { type: "weather-station", basin: "Gaira", stationId: "gaira" },
        Locations: [{ location: { type: "Point", coordinates: [-74.216, 11.187, 8] } }],
      },
    },
    {
      "@iot.id": 44,
      name: "gaira-precipitation-24h",
      unitOfMeasurement: { symbol: "mm" },
      ObservedProperty: { name: "Precipitacion acumulada 24h" },
      Thing: {
        "@iot.id": 15,
        name: "Gaira",
        properties: { type: "weather-station", basin: "Gaira", stationId: "gaira" },
        Locations: [{ location: { type: "Point", coordinates: [-74.216, 11.187, 8] } }],
      },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("FrostCatalogClient.fetchCatalog", () => {
  it("agrupa datastreams por Thing y deriva type/position/unidad", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(PAGE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const things = await new FrostCatalogClient(BASE, silentLogger).fetchCatalog();

    expect(things).toHaveLength(1);
    const gaira = things[0]!;
    expect(gaira.thingId).toBe(15);
    expect(gaira.type).toBe("weather-station");
    expect(gaira.properties.basin).toBe("Gaira");
    expect(gaira.position).toEqual({ lon: -74.216, lat: 11.187, alt: 8 });
    expect(gaira.datastreams).toHaveLength(2);

    const precip = gaira.datastreams.find((d) => d.datastreamName === "gaira-precipitation-24h");
    expect(precip?.observedProperty).toBe("Precipitacion acumulada 24h");
    expect(precip?.unitSymbol).toBe("mm");
  });

  it("usa type 'unknown' cuando properties.type falta", async () => {
    const page = {
      value: [
        {
          "@iot.id": 1,
          name: "x-temp",
          Thing: { "@iot.id": 2, name: "X", properties: {}, Locations: [] },
          ObservedProperty: { name: "Temp" },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(page), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const things = await new FrostCatalogClient(BASE, silentLogger).fetchCatalog();
    expect(things[0]!.type).toBe("unknown");
    expect(things[0]!.position).toBeUndefined();
  });
});
