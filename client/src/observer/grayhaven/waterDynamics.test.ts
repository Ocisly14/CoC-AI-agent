import { describe, expect, it } from "vitest";
import { sampleShoreWave, WAVE_COUNT, WAVE_INTERVAL } from "./waterDynamics";

describe("coastal wave lifecycle", () => {
  it("arrives, slows into run-up and recedes before disappearing", () => {
    for (let id = -20; id < 60; id++) {
      const { birth, duration } = sampleShoreWave(id, 0);
      const at = (age: number) => sampleShoreWave(id, birth + duration * age);
      expect(at(0).strength).toBe(0);
      expect(at(.3).front).toBeGreaterThan(at(.5).front);
      expect(at(.6).front).toBeLessThan(0);
      expect(at(.72).front).toBeLessThan(at(.6).front);
      expect(at(.9).front).toBeGreaterThan(at(.72).front);
      expect(at(1.01).strength).toBe(0);
      expect(at(.72).front).toBeGreaterThanOrEqual(-13);
      expect(at(.4).strength).toBeGreaterThan(.6);
    }
  });
  it("keeps front position continuous at the two lifecycle transitions", () => {
    for (let id = 0; id < 40; id++) {
      const { birth, duration } = sampleShoreWave(id, 0);
      for (const phase of [.55, .72]) {
        const t = birth + phase * duration;
        expect(Math.abs(sampleShoreWave(id, t - .0001).front - sampleShoreWave(id, t + .0001).front)).toBeLessThan(.003);
      }
    }
  });
  it("recycles only invisible waves, with repeatable but varied spacing and strength", () => {
    const intervals: number[] = [], strengths: number[] = [];
    for (let newest = 0; newest < 100; newest++) {
      const time = newest * WAVE_INTERVAL;
      expect(sampleShoreWave(newest, time).strength).toBe(0);
      expect(sampleShoreWave(newest - WAVE_COUNT, time).strength).toBe(0);
      const wave = sampleShoreWave(newest, time);
      expect(sampleShoreWave(newest, time)).toEqual(wave);
      intervals.push(sampleShoreWave(newest + 1, time).birth - wave.birth);
      strengths.push(sampleShoreWave(newest, wave.birth + wave.duration * .4).strength);
    }
    expect(Math.min(...intervals)).toBeGreaterThan(3.5);
    expect(Math.max(...intervals) - Math.min(...intervals)).toBeGreaterThan(2);
    expect(Math.max(...strengths) - Math.min(...strengths)).toBeGreaterThan(.6);
  });
});
