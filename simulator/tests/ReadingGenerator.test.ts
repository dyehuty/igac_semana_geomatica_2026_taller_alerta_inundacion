import { describe, expect, it } from "vitest";
import { ReadingGenerator } from "../src/app/ReadingGenerator.js";

describe("ReadingGenerator.rampPrecipitation", () => {
  const generator = new ReadingGenerator(() => 0.5);

  it("empieza en la base y termina en el pico", () => {
    expect(generator.rampPrecipitation(0, 70, 8)).toBe(8);
    expect(generator.rampPrecipitation(1, 70, 8)).toBe(70);
  });

  it("es monotona creciente a lo largo de la rampa", () => {
    let previous = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const value = generator.rampPrecipitation(p, 70, 8);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("cruza el umbral critico de 50 mm dentro de la tormenta", () => {
    const peak = 70;
    const below = generator.rampPrecipitation(0.3, peak, 8);
    const above = generator.rampPrecipitation(0.95, peak, 8);
    expect(below).toBeLessThan(50);
    expect(above).toBeGreaterThan(50);
  });

  it("recorta progress fuera de [0,1]", () => {
    expect(generator.rampPrecipitation(-1, 70, 8)).toBe(8);
    expect(generator.rampPrecipitation(2, 70, 8)).toBe(70);
  });
});

describe("ReadingGenerator valores normales", () => {
  it("precipitacion normal queda por debajo del umbral WARNING (20 mm)", () => {
    const generator = new ReadingGenerator(() => 0.99);
    expect(generator.precipitationNormal()).toBeLessThan(20);
  });

  it("la temperatura baja con la altitud", () => {
    const generator = new ReadingGenerator(() => 0.5); // sin ruido
    const costa = generator.temperature(0, false);
    const sierra = generator.temperature(2300, false);
    expect(sierra).toBeLessThan(costa);
  });

  it("en tormenta la humedad se acerca a la saturacion", () => {
    const generator = new ReadingGenerator(() => 0);
    expect(generator.humidity(true)).toBeGreaterThanOrEqual(90);
  });
});
