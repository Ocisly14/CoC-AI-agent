import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { lightPresets, projectCanopy } from "./lighting";

describe("Grayhaven sunlight geometry", () => {
  it("projects canopy shade away from the sun and lengthens it for low sun", () => {
    const high = projectCanopy(10, 20, 15, new Vector3(-1, 2, -1).normalize());
    const low = projectCanopy(10, 20, 15, new Vector3(-1, 0.5, -1).normalize());
    expect(high.x).toBeGreaterThan(10);
    expect(high.z).toBeGreaterThan(20);
    expect(low.x - 10).toBeGreaterThan(high.x - 10);
    expect(low.z - 20).toBeGreaterThan(high.z - 20);
    expect(projectCanopy(10, 20, 0, new Vector3(-1, 1, 0))).toEqual({ x: 10, z: 20 });
  });

  it("keeps overhead and grazing-angle projections finite", () => {
    expect(projectCanopy(10, 20, 15, new Vector3(0, 1, 0))).toEqual({ x: 10, z: 20 });
    const grazing = projectCanopy(10, 20, 15, new Vector3(1, 0, 0));
    expect(Number.isFinite(grazing.x)).toBe(true);
    expect(Number.isFinite(grazing.z)).toBe(true);
  });

  it("uses daylight for the afternoon and reserves local pools of light for dusk", () => {
    expect(lightPresets.afternoon.direct).toBeGreaterThan(lightPresets.afternoon.ambient * 3);
    expect(lightPresets.afternoon.porch).toBe(0);
    expect(lightPresets.afternoon.harbor).toBe(0);
    expect(lightPresets.bluehour.beacon).toBeGreaterThan(lightPresets.sunset.beacon);
    expect(lightPresets.sunset.beacon).toBeGreaterThan(lightPresets.afternoon.beacon);
  });
});
