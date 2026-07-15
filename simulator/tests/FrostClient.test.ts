import { afterEach, describe, expect, it, vi } from "vitest";
import { FrostClient } from "../src/infrastructure/FrostClient.js";

const silentLogger = { info() {}, warn() {}, error() {} };
const BASE = "http://frost.test/FROST-Server/v1.1";

function mockFetch(impl: (url: string, init?: RequestInit) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL, init?: RequestInit) => Promise.resolve(impl(String(input), init))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FrostClient.postObservation", () => {
  it("hace POST a /Observations con el Datastream enlazado por @iot.id", async () => {
    let captured: { url: string; body: unknown } | null = null;
    mockFetch((url, init) => {
      captured = { url, body: JSON.parse(String(init?.body)) };
      return new Response(null, { status: 201 });
    });

    const client = new FrostClient(BASE, silentLogger);
    await client.postObservation({
      datastreamId: 101,
      result: 63.8,
      phenomenonTime: "2026-07-14T21:30:00Z",
    });

    expect(captured!.url).toBe(`${BASE}/Observations`);
    expect(captured!.body).toEqual({
      Datastream: { "@iot.id": 101 },
      phenomenonTime: "2026-07-14T21:30:00Z",
      result: 63.8,
    });
  });

  it("lanza error si FROST responde con estado no-2xx", async () => {
    mockFetch(() => new Response("bad request", { status: 400 }));
    const client = new FrostClient(BASE, silentLogger);
    await expect(
      client.postObservation({ datastreamId: 1, result: 1, phenomenonTime: "t" }),
    ).rejects.toThrow(/400/);
  });
});

describe("FrostClient.findThingByName", () => {
  it("construye el filtro por nombre y expande Datastreams", async () => {
    let requestedUrl = "";
    mockFetch((url) => {
      requestedUrl = url;
      return new Response(
        JSON.stringify({ value: [{ "@iot.id": 7, name: "Gaira", Datastreams: [] }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new FrostClient(BASE, silentLogger);
    const thing = await client.findThingByName("Gaira");

    expect(requestedUrl).toContain(`${BASE}/Things?$filter=`);
    expect(requestedUrl).toContain(encodeURIComponent("name eq 'Gaira'"));
    expect(requestedUrl).toContain("$expand=Datastreams");
    expect(thing?.["@iot.id"]).toBe(7);
  });

  it("devuelve null cuando no hay coincidencias", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = new FrostClient(BASE, silentLogger);
    expect(await client.findThingByName("Inexistente")).toBeNull();
  });
});
