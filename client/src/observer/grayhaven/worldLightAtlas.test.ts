import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import * as THREE from "three";
import { ATLAS_BOUNDS, ATLAS_SIZE, atlasUv, BAKE_LAYER, canopyCanvasPoint, createBakeCamera, TREE_PROXY, treeProxyMatrix, WorldLightAtlas } from "./worldLightAtlas";

describe("world light atlas mapping", () => {
  it("excludes display overlays from every bounce bake while retaining physical surfaces and lights", () => {
    const atlas = new WorldLightAtlas(), scene = new THREE.Scene();
    const wall = new THREE.Mesh(), sun = new THREE.DirectionalLight();
    wall.layers.enable(BAKE_LAYER.bounce); sun.layers.enable(BAKE_LAYER.bounce);
    const ring = new THREE.Mesh(), guide = new THREE.Line(), halo = new THREE.Sprite();
    scene.add(wall, sun, ring, guide, halo);
    const captures: THREE.Object3D[][] = [];
    let target: THREE.WebGLRenderTarget | null = null;
    const renderer = {
      getRenderTarget: () => target,
      setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { target = next; },
      getClearColor: (color: THREE.Color) => color.set(0), getClearAlpha: () => 1,
      setClearColor: () => {}, clear: () => {}, readRenderTargetPixels: () => {},
      render: (root: THREE.Object3D, camera: THREE.Camera) => {
        if (root === scene) captures.push(scene.children.filter(o => o.visible && o.layers.test(camera.layers)));
      },
    } as unknown as THREE.WebGLRenderer;
    atlas.bakeStatic(renderer, scene);
    captures.length = 0;
    atlas.bakeBounce(renderer, scene);
    ring.visible = guide.visible = halo.visible = false;
    atlas.bakeBounce(renderer, scene);
    expect(captures).toEqual([[wall, sun], [wall, sun]]);
    expect(target).toBeNull();
    atlas.dispose();
    for (const object of [wall, ring, guide, halo]) {
      if ("geometry" in object) object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    sun.dispose();
  });
  it("puts the north-west corner at (0,1) and the south-east corner at (1,0)", () => {
    expect(atlasUv(ATLAS_BOUNDS.minX, ATLAS_BOUNDS.minZ)).toEqual([0, 1]);
    expect(atlasUv(ATLAS_BOUNDS.minX + ATLAS_BOUNDS.width, ATLAS_BOUNDS.minZ + ATLAS_BOUNDS.depth)).toEqual([1, 0]);
  });

  it("projects world points through the bake camera exactly where atlasUv places them", () => {
    const camera = createBakeCamera();
    for (const [x, z] of [[-430, -1100], [1120, 950], [38, -57], [300, 400]] as const) {
      const ndc = new Vector3(x, 12, z).project(camera);
      const [u, v] = atlasUv(x, z);
      expect(ndc.x).toBeCloseTo(u * 2 - 1, 5);
      expect(ndc.y).toBeCloseTo(v * 2 - 1, 5);
      expect(ndc.z).toBeGreaterThan(-1);
      expect(ndc.z).toBeLessThan(1);
    }
  });

  it("keeps terrain heights between -20 and 300 inside the bake camera's depth range", () => {
    const camera = createBakeCamera();
    expect(new Vector3(0, -20, 0).project(camera).z).toBeLessThan(1);
    expect(new Vector3(0, 300, 0).project(camera).z).toBeGreaterThan(-1);
  });

  it("draws the canopy canvas with row 0 at the south edge, matching readback order", () => {
    expect(canopyCanvasPoint(ATLAS_BOUNDS.minX, ATLAS_BOUNDS.minZ + ATLAS_BOUNDS.depth)).toEqual([0, 0]);
    expect(canopyCanvasPoint(ATLAS_BOUNDS.minX + ATLAS_BOUNDS.width, ATLAS_BOUNDS.minZ)).toEqual([ATLAS_SIZE.width, ATLAS_SIZE.height]);
  });

  it("stands a tree proxy on the ground using the painted crown width", () => {
    const matrix = new Matrix4();
    treeProxyMatrix({ x: 10, z: 20, height: 30, width: 20, crownWidth: 12 }, 5, matrix);
    const position = new Vector3(), scale = new Vector3();
    matrix.decompose(position, new Quaternion(), scale);
    expect(scale.x).toBeCloseTo(12 * TREE_PROXY.radius);
    expect(scale.z).toBeCloseTo(12 * TREE_PROXY.radius);
    expect(position.y - scale.y).toBeCloseTo(5 + 30 * TREE_PROXY.base);
    expect(position.y + scale.y).toBeCloseTo(5 + 30 * TREE_PROXY.top);
    treeProxyMatrix({ x: 10, z: 20, height: 30, width: 20 }, 5, matrix);
    matrix.decompose(position, new Quaternion(), scale);
    expect(scale.x).toBeCloseTo(20 * TREE_PROXY.radius);
  });
});
