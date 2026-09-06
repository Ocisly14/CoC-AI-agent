import { describe, expect, it } from "vitest";
import { coastalElevation, coastWidth, elevation, landmarks, shoreline, waterline } from "./layout";

describe("Grayhaven crescent bay terrain", () => {
  it("places the bay inland of both projecting headlands", () => {
    expect(waterline(0)).toBeGreaterThan(waterline(-280) + 120);
    expect(waterline(0)).toBeGreaterThan(waterline(280) + 120);
  });

  it("surrounds the low town with northern, eastern and southern ridges", () => {
    const town = elevation(0, 30);
    expect(town).toBeLessThan(25);
    for (const [x, z] of [[0, -340], [300, -80], [110, 300]]) {
      expect(elevation(x, z)).toBeGreaterThan(town + 100);
    }
  });

  it("joins a broad sandy bay to dry ground and the sea without a seam", () => {
    expect(coastWidth(0)).toBeGreaterThan(75);
    expect(coastWidth(0)).toBeGreaterThan(coastWidth(280) * 3);
    for (let z = -350; z <= 350; z += 10) {
      expect(coastalElevation(z, 0)).toBeCloseTo(elevation(shoreline(z), z), 8);
      expect(coastalElevation(z, 1)).toBeCloseTo(-0.55, 8);
      for (let t = 0; t <= 1; t += 0.1) expect(Number.isFinite(coastalElevation(z, t))).toBe(true);
    }
    expect(coastalElevation(0, 0.5)).toBeLessThan(3);
  });

  it("keeps the harbour and lighthouse above the water beside their new coast", () => {
    for (const id of ["SCN_dock", "SCN_lighthouse_cliff"]) {
      const [x, z] = landmarks.find(l => l.id === id)!.position;
      expect(x - shoreline(z)).toBeGreaterThan(0);
      expect(x - shoreline(z)).toBeLessThan(25);
      expect(elevation(x, z)).toBeGreaterThan(1);
    }
  });
});
