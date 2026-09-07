import { describe, expect, it } from "vitest";
import { distanceToRoad, landmarks, shoreline } from "./layout";
import { forestAtlasCells, sequoiaAtlasCells, makeForestLayout, makeSawmillGrove, makeSawmillCompanions } from "./forestLayout";

describe("Grayhaven painted forest", () => {
  it("adds mature mill-side groves while keeping the working yard and paths clear", () => {
    const grove = makeSawmillGrove();
    const [x,z] = landmarks.find(l=>l.id === "SCN_sawmill")!.position;
    expect(grove.length).toBeGreaterThanOrEqual(12);
    expect(grove.length).toBeLessThanOrEqual(16);
    expect(grove.filter(tree=>tree.height<45).length).toBeGreaterThanOrEqual(3);
    expect(grove.filter(tree=>tree.height>=45&&tree.height<63).length).toBeGreaterThanOrEqual(4);
    expect(grove.filter(tree=>tree.height>=63).length).toBeGreaterThanOrEqual(3);
    for (const tree of grove) {
      expect(tree.sequoia).toBe(true);
      expect(sequoiaAtlasCells[tree.variant]).toBeDefined();
      expect(tree.height).toBeGreaterThanOrEqual(30);
      expect(Math.hypot(tree.x-x,tree.z-z)).toBeGreaterThanOrEqual(44);
      expect(distanceToRoad([tree.x,tree.z])).toBeGreaterThanOrEqual(13);
    }
    for (let i=0;i<grove.length;i++) for (const tree of grove.slice(i+1))
      expect(Math.hypot(tree.x-grove[i].x,tree.z-grove[i].z)).toBeGreaterThanOrEqual(12);
  });
  it("interleaves ordinary trees without crowding trunks, paths or the working yard", () => {
    const grove=makeSawmillGrove(), companions=makeSawmillCompanions(grove);
    expect(companions.length).toBeGreaterThanOrEqual(18);
    for (const tree of companions) {
      expect(tree.sequoia).not.toBe(true);
      expect(tree.height).toBeLessThan(34);
      expect(distanceToRoad([tree.x,tree.z])).toBeGreaterThanOrEqual(8);
      expect(Math.hypot(tree.x-170,tree.z+147)).toBeGreaterThanOrEqual(38);
      const distances=grove.map(giant=>Math.hypot(tree.x-giant.x,tree.z-giant.z));
      expect(Math.min(...distances)).toBeGreaterThanOrEqual(7);
      expect(Math.min(...distances)).toBeLessThanOrEqual(26);
    }
  });
  it("keeps trees off roads, landmark clearings and the sea", () => {
    const trees = makeForestLayout();
    expect(trees.length).toBeGreaterThan(1000);
    expect(trees.length).toBeLessThan(5000);
    for (const tree of trees) {
      expect(tree.x).toBeGreaterThanOrEqual(shoreline(tree.z) + 18);
      expect(distanceToRoad([tree.x, tree.z])).toBeGreaterThanOrEqual(6);
      for (const landmark of landmarks) {
        expect(Math.hypot(tree.x - landmark.position[0], tree.z - landmark.position[1])).toBeGreaterThanOrEqual(17);
      }
    }
  });

  it("preserves the authored forest across reloads and uses the selected tapered sprites", () => {
    const trees = makeForestLayout();
    expect(trees).toEqual(makeForestLayout());
    expect(new Set(trees.filter(tree=>!tree.sequoia).map(tree => forestAtlasCells[tree.variant]))).toEqual(new Set([0, 1, 3]));
    for (const tree of trees) {
      expect(tree.width).toBeGreaterThan(0);
      expect(tree.height).toBeGreaterThan(tree.width);
    }
  });
});
