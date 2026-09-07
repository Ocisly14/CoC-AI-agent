import { describe, expect, it } from "vitest";
import { makeMistNoise, mistEnvelope, mistGroundHeight, seaMistExtent, createSeaMist } from "./seaMist";
import { elevation, landmarks, waterline } from "./layout";

describe("animated sea-to-valley fog", () => {
  it("starts over water, then allows drifting puffs throughout the valley at full strength", () => {
    expect(mistEnvelope(waterline(0)-80,6,0,.24)).toBeGreaterThan(.15);
    expect(mistEnvelope(170,elevation(170,-147)+10,-147,.24)).toBe(0);
    for (const landmark of landmarks) {
      const [x,z]=landmark.position;
      expect(mistEnvelope(x,elevation(x,z)+6,z,1),landmark.id).toBeGreaterThan(.07);
    }
    expect(seaMistExtent(1).inland).toBeGreaterThan(900);
    expect(seaMistExtent(1).top).toBeGreaterThan(200);
  });
  it("leaves ridge crests clear, never creates fog underground, and turns off at zero", () => {
    for (const [x,z] of [[0,0],[170,-147],[208,-65],[-100,120]]) {
      expect(mistEnvelope(x,mistGroundHeight(x,z)-2,z,1)).toBe(0);
      expect(mistEnvelope(x,mistGroundHeight(x,z)+8,z,0)).toBe(0);
    }
    expect(mistEnvelope(300,elevation(300,-80)+10,-80,1)).toBe(0);
    expect(seaMistExtent(-1)).toEqual(seaMistExtent(0));
    expect(seaMistExtent(2)).toEqual(seaMistExtent(1));
  });
  it("has a bounded deterministic 3D turbulence field with independent warp channels", () => {
    const a=makeMistNoise(), b=makeMistNoise();
    expect(a.byteLength).toBe(128*1024);
    expect(a).toEqual(b);
    const red=[], differences=[];
    for(let i=0;i<a.length;i+=4) { red.push(a[i]); differences.push(Math.abs(a[i]-a[i+1])); }
    expect(Math.max(...red)-Math.min(...red)).toBeGreaterThan(140);
    expect(differences.reduce((sum,n)=>sum+n,0)/differences.length).toBeGreaterThan(20);
  });
  it("bypasses all volume passes when disabled and releases owned resources", () => {
    const mist=createSeaMist();
    let calls=0;
    mist.setAtmosphere(0,0xffffff);
    // Disabled rendering must not allocate render targets or access camera matrices.
    mist.render({render:()=>calls++} as never,{} as never,{} as never);
    expect(calls).toBe(1);
    expect(mist.estimatedBytes).toBeLessThan(300000);
    mist.dispose();
  });
});
