import { describe, expect, it } from "vitest";
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from "three";
import { giPresets, mistStrength, toneMappingFromSearch } from "./globalIllumination";

describe("global illumination presets", () => {
  it("reserves the strongest ground bounce for sunset and the least for blue hour", () => {
    expect(giPresets.sunset.bounceStrength).toBeGreaterThan(giPresets.afternoon.bounceStrength);
    expect(giPresets.bluehour.bounceStrength).toBeLessThan(giPresets.afternoon.bounceStrength);
  });

  it("softens the sun as it drops: afternoon < sunset < blue hour penumbra", () => {
    expect(giPresets.afternoon.penumbra).toBeLessThan(giPresets.sunset.penumbra);
    expect(giPresets.sunset.penumbra).toBeLessThan(giPresets.bluehour.penumbra);
  });

  it("keeps the low-lying mist restrained so the main street stays readable", () => {
    for (const preset of Object.values(giPresets)) {
      expect(mistStrength(preset, 0.24)).toBeLessThanOrEqual(0.3);
      expect(mistStrength(preset, 1)).toBeLessThanOrEqual(0.7);
      expect(mistStrength(preset, 0)).toBeGreaterThanOrEqual(0);
      expect(preset.mistTop).toBeGreaterThan(preset.mistFloor);
    }
  });

  it("defaults to ACES and only switches tone mapping on an explicit query", () => {
    expect(toneMappingFromSearch("")).toBe(ACESFilmicToneMapping);
    expect(toneMappingFromSearch("?fog=1")).toBe(ACESFilmicToneMapping);
    expect(toneMappingFromSearch("?tone=agx")).toBe(AgXToneMapping);
    expect(toneMappingFromSearch("?tone=neutral")).toBe(NeutralToneMapping);
    expect(toneMappingFromSearch("?tone=bogus")).toBe(ACESFilmicToneMapping);
  });
});
