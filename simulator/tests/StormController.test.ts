import { describe, expect, it } from "vitest";
import { StormController } from "../src/app/StormController.js";

function controllerWithClock(durationMs: number) {
  let now = 1_000_000;
  const advance = (ms: number): void => {
    now += ms;
  };
  const storm = new StormController(durationMs, { min: 55, max: 85 }, () => 0.5, () => now);
  return { storm, advance };
}

describe("StormController", () => {
  it("arranca inactivo (regimen normal)", () => {
    const { storm } = controllerWithClock(120_000);
    expect(storm.isActive()).toBe(false);
    expect(storm.status().mode).toBe("normal");
    expect(storm.progress()).toBe(0);
  });

  it("se activa sobre las estaciones objetivo y asigna picos", () => {
    const { storm } = controllerWithClock(120_000);
    storm.start(["a", "b", "c"]);
    expect(storm.isActive()).toBe(true);
    expect(storm.isTarget("a")).toBe(true);
    expect(storm.isTarget("z")).toBe(false);
    expect(storm.peakFor("a")).toBeGreaterThan(50);
    expect(storm.status().targetCount).toBe(3);
  });

  it("progresa y expira automaticamente por tiempo", () => {
    const { storm, advance } = controllerWithClock(120_000);
    storm.start(["a"]);
    advance(60_000);
    expect(storm.progress()).toBeCloseTo(0.5, 5);
    expect(storm.isActive()).toBe(true);

    advance(70_000); // total 130s > 120s
    expect(storm.isActive()).toBe(false);
    expect(storm.progress()).toBe(1);
    expect(storm.remainingMs()).toBe(0);
    expect(storm.isTarget("a")).toBe(false);
    expect(storm.status().mode).toBe("normal");
  });

  it("stop() vuelve a normal de inmediato", () => {
    const { storm, advance } = controllerWithClock(120_000);
    storm.start(["a"]);
    advance(10_000);
    storm.stop();
    expect(storm.isActive()).toBe(false);
    expect(storm.isTarget("a")).toBe(false);
  });
});
