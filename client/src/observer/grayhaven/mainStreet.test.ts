import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mainStreetPlots } from "./mainStreet";
import { roadPaths, shoreline } from "./layout";

const plots = mainStreetPlots();
function corners(p: typeof plots[number]) {
  return [-1,1].flatMap(x => [-1,1].map(z => new THREE.Vector3(x*p.width/2,0,z*p.depth/2)
    .applyAxisAngle(new THREE.Vector3(0,1,0),p.angle).add(p.center)));
}

describe("module-based main street overview", () => {
  it("places each module entrance once, in source order, and keeps the sheriff opposite the diner", () => {
    const access = roadPaths.find(r => r.id === "ROAD_main_street")!.access;
    const named = plots.filter(p => p.kind !== "vacant");
    expect(named.map(p => ({id:p.id,position:p.along}))).toEqual(access);
    expect(named.find(p => p.kind === "diner")!.side).toBe(named.find(p => p.kind === "grocery")!.side);
    expect(named.find(p => p.kind === "sheriff")!.side).not.toBe(named.find(p => p.kind === "diner")!.side);
  });
  it("faces entrances toward the street and keeps footprints on land without overlapping", () => {
    for (const p of plots) {
      const forward = new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),p.angle);
      expect(forward.dot(p.outward)).toBeCloseTo(-1);
      for (const v of corners(p)) expect(v.x).toBeGreaterThan(shoreline(v.z));
    }
    for (let i=0;i<plots.length;i++) for(let j=i+1;j<plots.length;j++) {
      const a=plots[i],b=plots[j];
      const axes=[a.angle,b.angle].flatMap(angle=>[new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)].map(v=>v.applyAxisAngle(new THREE.Vector3(0,1,0),angle)));
      const separate=axes.some(axis=>{
        const aa=corners(a).map(v=>v.dot(axis)),bb=corners(b).map(v=>v.dot(axis));
        return Math.max(...aa)<=Math.min(...bb)||Math.max(...bb)<=Math.min(...aa);
      });
      expect(separate,`${a.id} overlaps ${b.id}`).toBe(true);
    }
  });
});
