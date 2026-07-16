import { afterEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../src/interfaces/createHttpApp.js";
import type { CatalogProvider, RealtimeSource } from "../src/domain/contracts.js";
import type { ThingContext, ThingState } from "../src/domain/models.js";

const thing: ThingContext = {
  thingId: 1,
  name: "Estación de prueba",
  type: "weather-station",
  properties: {},
  position: { lat: 11, lon: -74 },
  datastreams: [],
};
const state: ThingState = {
  thingId: 1,
  name: "Estación de prueba",
  type: "weather-station",
  properties: {},
  position: { lat: 11, lon: -74 },
  metrics: {},
  lastUpdated: "",
};
const realtimeSource: RealtimeSource = {
  start: async () => undefined,
  subscribeMore: () => undefined,
  isConnected: () => true,
};

describe("CORS del gateway HTTP", () => {
  const apps: ReturnType<typeof createHttpApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createTestApp(origin = "*") {
    const catalog: CatalogProvider = { getThings: () => [thing] };
    const app = createHttpApp(realtimeSource, catalog, { getAll: () => [state] }, origin);
    apps.push(app);
    return app;
  }

  it("permite solicitudes desde cualquier origen por defecto", async () => {
    const response = await createTestApp().inject({
      method: "GET",
      url: "/things",
      headers: { origin: "http://localhost:3000" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
  });

  it("responde el preflight OPTIONS con métodos y headers permitidos", async () => {
    const response = await createTestApp().inject({
      method: "OPTIONS",
      url: "/catalog",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
  });

  it("permite reemplazar el wildcard por un origen específico", async () => {
    const response = await createTestApp("http://localhost:3000").inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:3000" },
    });

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
