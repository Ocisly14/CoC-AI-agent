import { describe, expect, it } from "vitest";
import { distanceToRoad, landmarks, shoreline } from "./layout";
import { makeForestLayout } from "./forestLayout";

describe("Grayhaven painted forest", () => {
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

  it("preserves the same authored forest across reloads and uses all four sprites", () => {
    const trees = makeForestLayout();
    expect(trees).toEqual(makeForestLayout());
    expect(new Set(trees.map(tree => tree.variant))).toEqual(new Set([0, 1, 2, 3]));
    for (const tree of trees) {
      expect(tree.width).toBeGreaterThan(0);
      expect(tree.height).toBeGreaterThan(tree.width);
    }
  });
});
