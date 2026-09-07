import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OUTDOOR_CUTAWAY, boxFootprint, createCutaway, discFootprint, facesCamera, outdoorCutawayActive, treeOccludes } from './cutaway';

/** The sandbox's fixed coastal viewing direction. */
function fixedCamera(zoom = 1) {
  const camera = new THREE.OrthographicCamera(-262 * 1.6, 262 * 1.6, 262, -262, 1, 2200);
  camera.position.set(-398, 351, 487); camera.lookAt(0, 0, 0); camera.zoom = zoom;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return camera;
}
const forwardOf = (camera: THREE.Camera) => camera.getWorldDirection(new THREE.Vector3());
/** A horizontal step from the origin toward the camera. */
function towardCamera(camera: THREE.Camera) {
  const toward = forwardOf(camera).multiplyScalar(-1); toward.y = 0; return toward.normalize();
}
const rightOf = (camera: THREE.Camera) => new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as const;
const RING = () => discFootprint(new THREE.Vector3(), new THREE.Vector2(38, 29), fixedCamera());

describe('object-level cutaway', () => {
  it('hides exactly the two wall sides that face the fixed camera, for any building rotation', () => {
    const forward = forwardOf(fixedCamera());
    const facing = (angle: number) => SIDES
      .filter(n => facesCamera(new THREE.Vector3(...n), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), forward))
      .map(n => n.join(',')).sort();
    expect(facing(1.4988)).toEqual(['-1,0,0', '0,0,-1']);
    expect(facing(1.4988 + Math.PI)).toEqual(['0,0,1', '1,0,0']);
  });

  it('hides a tree only when it stands in front of the target and overlaps it on screen, whatever the zoom or pan', () => {
    const camera = fixedCamera(), toward = towardCamera(camera), right = rightOf(camera), footprint = RING();
    const tree = (base: THREE.Vector3) => ({ base, height: 30 });
    const front = toward.clone().multiplyScalar(48);
    const cases = [front, toward.clone().multiplyScalar(-48), front.clone().addScaledVector(right, 100), right.clone().multiplyScalar(30)];
    const results = (view: THREE.Matrix4) => cases.map(base => treeOccludes(tree(base), footprint, view));
    expect(results(camera.matrixWorldInverse)).toEqual([true, false, false, false]);
    const moved = fixedCamera(6); moved.position.add(new THREE.Vector3(120, 0, -80)); moved.updateMatrixWorld();
    expect(results(moved.matrixWorldInverse)).toEqual([true, false, false, false]);
  });

  it('switches the outdoor cutaway with hysteresis', () => {
    expect(outdoorCutawayActive(3.5, false)).toBe(false); expect(outdoorCutawayActive(3.5, true)).toBe(true);
    expect(outdoorCutawayActive(OUTDOOR_CUTAWAY.on, false)).toBe(true); expect(outdoorCutawayActive(OUTDOOR_CUTAWAY.off, true)).toBe(false);
  });

  it('collapses occluding instances in place, restores them exactly and skips unchanged frames', () => {
    const camera = fixedCamera(), toward = towardCamera(camera), right = rightOf(camera);
    const positions = [toward.clone().multiplyScalar(48), toward.clone().multiplyScalar(-48), toward.clone().multiplyScalar(48).addScaledVector(right, 100)];
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3), dummy = new THREE.Object3D();
    positions.forEach((p, i) => { dummy.position.copy(p); dummy.scale.setScalar(4); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    const original = Array.from(mesh.instanceMatrix.array), m = new THREE.Matrix4();
    const cutaway = createCutaway();
    cutaway.registerInstanced(mesh, positions.map(base => ({ base, height: 30 })));
    const target = { kind: 'outdoor' as const, id: 'SCN_redwood_ring', footprint: RING() };
    cutaway.setTarget(target, camera);
    mesh.getMatrixAt(0, m);
    expect(m.elements.slice(0, 12)).toEqual(new Array(12).fill(0));
    expect(m.elements.slice(12)).toEqual(original.slice(12, 16));
    mesh.getMatrixAt(1, m); expect(m.elements).toEqual(original.slice(16, 32));
    mesh.getMatrixAt(2, m); expect(m.elements).toEqual(original.slice(32, 48));
    const version = mesh.instanceMatrix.version;
    cutaway.setTarget(target, camera); expect(mesh.instanceMatrix.version).toBe(version);
    cutaway.setTarget(null, camera);
    expect(Array.from(mesh.instanceMatrix.array)).toEqual(original);
  });

  it('hides the shell, the camera-facing sides and every partition of the active interior, and nothing else', () => {
    const camera = fixedCamera();
    const root = new THREE.Group(); root.rotation.y = 1.4988; root.position.set(60, 4, -30); root.updateMatrixWorld(true);
    const sides = SIDES.map(n => { const g = new THREE.Group(); g.userData.cutawayNormal = [...n]; root.add(g); return g; });
    const partition = new THREE.Group(); partition.userData.cutawayPartition = true; root.add(partition);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(floor);
    const exterior = new THREE.Group(); exterior.position.copy(root.position); exterior.rotation.copy(root.rotation); exterior.updateMatrixWorld(true);
    const cutaway = createCutaway(); cutaway.registerInterior(root);
    const footprint = boxFootprint(exterior.matrixWorld, new THREE.Vector3(7, 6, 11), new THREE.Vector3(0, 6, 0));
    cutaway.setTarget({ kind: 'interior', root, exterior, footprint }, camera);
    expect(exterior.visible).toBe(false); expect(partition.visible).toBe(false); expect(floor.visible).toBe(true);
    expect(sides.map(g => g.visible)).toEqual([true, false, true, false]);
    cutaway.setTarget(null, camera);
    expect(exterior.visible).toBe(true); expect(partition.visible).toBe(true); expect(sides.every(g => g.visible)).toBe(true);
  });

  it('registers tagged trees and instance batches from a scene root, hides those in front of a building, and suspends for bakes', () => {
    const camera = fixedCamera(), toward = towardCamera(camera), m = new THREE.Matrix4();
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
    const scene = new THREE.Group();
    const crown = new THREE.Mesh(geometry, material); crown.userData.cutawayTree = { base: toward.clone().multiplyScalar(40), height: 40 }; scene.add(crown);
    const far = new THREE.Mesh(geometry, material); far.userData.cutawayTree = { base: toward.clone().multiplyScalar(-40), height: 40 }; scene.add(far);
    const stubs = new THREE.InstancedMesh(geometry, material, 1); stubs.userData.cutawayInstances = [{ base: toward.clone().multiplyScalar(40), height: 40 }]; scene.add(stubs);
    const cutaway = createCutaway(); cutaway.registerTrees(scene);
    const exterior = new THREE.Group(); exterior.updateMatrixWorld(true);
    const target = { kind: 'interior' as const, root: new THREE.Group(), exterior, footprint: boxFootprint(exterior.matrixWorld, new THREE.Vector3(7, 6, 11), new THREE.Vector3(0, 6, 0)) };
    cutaway.setTarget(target, camera);
    expect(crown.visible).toBe(false); expect(far.visible).toBe(true); expect(exterior.visible).toBe(false);
    stubs.getMatrixAt(0, m); expect(m.elements[0]).toBe(0);
    expect(() => cutaway.suspend(() => {
      expect(crown.visible).toBe(true); expect(exterior.visible).toBe(true);
      stubs.getMatrixAt(0, m); expect(m.elements[0]).toBe(1);
      throw Error('bake');
    })).toThrow('bake');
    expect(crown.visible).toBe(false); expect(exterior.visible).toBe(false);
    stubs.getMatrixAt(0, m); expect(m.elements[0]).toBe(0);
    cutaway.dispose();
    expect(crown.visible).toBe(true); expect(exterior.visible).toBe(true);
    stubs.getMatrixAt(0, m); expect(m.elements[0]).toBe(1);
  });
});
