import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BEACH_ITEMS, BEACH_LOD, BEACH_VIEW, beachDetailLevel, createBeachScene } from "./beachScene";
import scene from "../../../../testmods/grayhaven/Grayhaven_Scenarios/SCN_dock.json";
import notes from "./beachScene.generated.json";
import { BAKE_LAYER } from "./worldLightAtlas";

function fixture() {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const beach = createBeachScene((color, surface) => {
    const key = `${color}/${surface}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color }));
    return materials.get(key)!;
  });
  const dispose = () => {
    const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(materials.values());
    beach.root.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) mats.add(mesh.material as THREE.Material); });
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
  };
  return { beach, dispose };
}

describe("SCN_dock zoom detail", () => {
  it("covers the source scene's fourteen items and exports their original reading notes", () => {
    expect(BEACH_ITEMS.map(id => "item.dock." + id).sort()).toEqual(scene.references.items.map(i => i.id).sort());
    expect(notes.items).toEqual(scene.references.items);
  });
  it("keeps small details out of the overview and has hysteresis at each zoom boundary", () => {
    expect(beachDetailLevel(1)).toBe(0);
    expect(beachDetailLevel(BEACH_LOD.props + .01)).toBe(1);
    expect(beachDetailLevel(BEACH_LOD.props - .05, 1)).toBe(1);
    expect(beachDetailLevel(BEACH_LOD.props - .2, 1)).toBe(0);
    expect(beachDetailLevel(BEACH_VIEW.zoom)).toBe(2);
    expect(beachDetailLevel(BEACH_LOD.fine - .05, 2)).toBe(2);
    expect(beachDetailLevel(BEACH_LOD.fine - .2, 2)).toBe(1);
  });
  it("retains the same major geometry and baked shadow contributors at every detail level", () => {
    const { beach, dispose } = fixture();
    const baked = () => {
      const result: THREE.Object3D[] = [];
      beach.root.traverseVisible(o => { if (o.layers.isEnabled(BAKE_LAYER.bounce) || (o as THREE.Mesh).castShadow) result.push(o); });
      return result;
    };
    beach.update(1, 0); const overview = baked();
    expect(overview.length).toBeGreaterThan(0);
    beach.update(6.5, 0); expect(baked()).toEqual(overview);
    expect(beach.root.getObjectByName("beach-detail-2")!.visible).toBe(true);
    beach.update(1, 0); expect(beach.root.getObjectByName("beach-detail-1")!.visible).toBe(false);
    dispose();
  });
  it("animates hulls and attached moorings deterministically and bounds detail draw calls", () => {
    const { beach, dispose } = fixture();
    beach.update(6.5, 0);
    let count = 0;
    beach.root.traverseVisible(o => { if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine) count++; });
    expect(count).toBeLessThan(80);
    const transforms = () => { const values: number[] = []; beach.root.traverse(o => values.push(o.position.y, o.rotation.x, o.rotation.z)); return values; };
    const initial = transforms(); beach.update(6.5, 12); expect(transforms()).not.toEqual(initial);
    const frozen = transforms(); beach.update(6.5, 12); expect(transforms()).toEqual(frozen);
    beach.update(6.5, 0); expect(transforms()).toEqual(initial);
    beach.root.traverse(o => {
      const mesh = o as THREE.InstancedMesh;
      if (mesh.isInstancedMesh) expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    });
    dispose();
  });
});
