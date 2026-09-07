import * as THREE from 'three';

/** Object-level cutaway. What stands between the fixed camera and a small scene is
 * hidden by what it is, never by pixel depth: walls carry their outward normal,
 * full-height partitions a flag, trees a base point and a height. */
export type TreeSpan = { base: THREE.Vector3; height: number; radius?: number };
/** World-space extent of the scene being inspected: its centre plus the corners of
 * the volume a tree could hide. */
export type Footprint = { center: THREE.Vector3; corners: THREE.Vector3[] };
export type CutawayTarget =
  | { kind: 'interior'; root: THREE.Object3D; exterior: THREE.Object3D; footprint: Footprint }
  | { kind: 'outdoor'; id: string; footprint: Footprint };

export const OUTDOOR_CUTAWAY = { on: 3.8, off: 3.2 };
/** A tree level with the target centre stands beside it, not in front of it. */
export const TREE_DEPTH_MARGIN = 2;

export function facesCamera(localNormal: THREE.Vector3, rotation: THREE.Quaternion, forward: THREE.Vector3) {
  return localNormal.clone().applyQuaternion(rotation).dot(forward) < 0;
}

/** Instant, hysteretic switch: no strength ramp, so a zoom animation cannot flicker. */
export function outdoorCutawayActive(zoom: number, previous: boolean) {
  return zoom >= OUTDOOR_CUTAWAY.on ? true : zoom <= OUTDOOR_CUTAWAY.off ? false : previous;
}

export function boxFootprint(transform: THREE.Matrix4, halfExtents: THREE.Vector3, center = new THREE.Vector3()): Footprint {
  const corners: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    corners.push(center.clone().add(new THREE.Vector3(x * halfExtents.x, y * halfExtents.y, z * halfExtents.z)).applyMatrix4(transform));
  }
  return { center: center.clone().applyMatrix4(transform), corners };
}

/** A camera-plane rectangle with the radii the elliptical lens used, so the outdoor
 * close-ups keep the extent that was tuned for them. */
export function discFootprint(center: THREE.Vector3, radii: THREE.Vector2, camera: THREE.Camera): Footprint {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const corners: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) corners.push(center.clone().addScaledVector(right, x * radii.x).addScaledVector(up, y * radii.y));
  return { center: center.clone(), corners };
}

/** View-space test. Orthographic view XY is world units on the camera plane, so the
 * answer depends on neither zoom nor pan and is computed once per target. The
 * footprint's depth and rectangle are prepared once; the returned predicate is
 * run over every registered tree. */
export function occlusionTest(footprint: Footprint, view: THREE.Matrix4) {
  const centerDepth = -footprint.center.clone().applyMatrix4(view).z;
  const rect = new THREE.Box2();
  for (const corner of footprint.corners) {
    const p = corner.clone().applyMatrix4(view);
    rect.expandByPoint(new THREE.Vector2(p.x, p.y));
  }
  const base = new THREE.Vector3(), top = new THREE.Vector3(), span = new THREE.Box2();
  return (tree: TreeSpan) => {
    base.copy(tree.base).applyMatrix4(view);
    if (-base.z >= centerDepth - TREE_DEPTH_MARGIN) return false;
    top.copy(tree.base).setY(tree.base.y + tree.height).applyMatrix4(view);
    span.makeEmpty().expandByPoint(new THREE.Vector2(base.x, base.y)).expandByPoint(new THREE.Vector2(top.x, top.y))
      .expandByScalar(tree.radius ?? tree.height * .2);
    return rect.intersectsBox(span);
  };
}
export function treeOccludes(tree: TreeSpan, footprint: Footprint, view: THREE.Matrix4) {
  return occlusionTest(footprint, view)(tree);
}

type Instanced = { mesh: THREE.InstancedMesh; spans: TreeSpan[]; original: Float32Array; hidden: number[] };
type Wall = { object: THREE.Object3D; normal: THREE.Vector3 | null };

export function createCutaway() {
  const instanced: Instanced[] = [];
  const trees: { object: THREE.Object3D; span: TreeSpan }[] = [];
  const interiors = new Map<THREE.Object3D, Wall[]>();
  const hidden: THREE.Object3D[] = [];
  const rotation = new THREE.Quaternion(), forward = new THREE.Vector3(), view = new THREE.Matrix4();
  let current: CutawayTarget | null = null, key = '', dirty = false;

  function registerInstanced(mesh: THREE.InstancedMesh, spans: TreeSpan[]) {
    instanced.push({ mesh, spans, original: Float32Array.from(mesh.instanceMatrix.array), hidden: [] });
    dirty = true;
  }
  function hide(object: THREE.Object3D) {
    if (!object.visible) return;
    object.visible = false; hidden.push(object);
  }
  /** Only what this controller hid is shown again; a storey hidden by setFloor stays hidden. */
  function restore() {
    for (const object of hidden) object.visible = true;
    hidden.length = 0;
    for (const entry of instanced) {
      if (!entry.hidden.length) continue;
      const array = entry.mesh.instanceMatrix.array as Float32Array;
      for (const index of entry.hidden) array.set(entry.original.subarray(index * 16, index * 16 + 16), index * 16);
      entry.hidden.length = 0; entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function apply(target: CutawayTarget) {
    if (target.kind === 'interior') {
      hide(target.exterior);
      const quaternion = target.root.getWorldQuaternion(new THREE.Quaternion());
      for (const wall of interiors.get(target.root) ?? []) {
        if (!wall.normal || facesCamera(wall.normal, quaternion, forward)) hide(wall.object);
      }
    }
    const occludes = occlusionTest(target.footprint, view);
    for (const tree of trees) if (occludes(tree.span)) hide(tree.object);
    for (const entry of instanced) {
      const array = entry.mesh.instanceMatrix.array as Float32Array;
      entry.spans.forEach((span, index) => {
        if (!occludes(span)) return;
        // Collapse onto the instance's own position: no fragments, no shadow, and the
        // bounding sphere keeps its extent for frustum culling.
        const offset = index * 16;
        array.fill(0, offset, offset + 12);
        entry.hidden.push(index);
      });
      if (entry.hidden.length) entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  const targetKey = (target: CutawayTarget | null) =>
    !target ? '' : target.kind === 'interior' ? 'interior:' + target.root.uuid : 'outdoor:' + target.id;

  return {
    registerInstanced,
    /** Collects `userData.cutawayTree` parts and `userData.cutawayInstances` batches. */
    registerTrees(root: THREE.Object3D) {
      root.traverse(object => {
        const span = object.userData.cutawayTree as TreeSpan | undefined;
        if (span) trees.push({ object, span });
        const spans = object.userData.cutawayInstances as TreeSpan[] | undefined;
        if (spans && (object as THREE.InstancedMesh).isInstancedMesh) registerInstanced(object as THREE.InstancedMesh, spans);
      });
      dirty = true;
    },
    /** Collects `userData.cutawayNormal` sides and `userData.cutawayPartition` groups. */
    registerInterior(root: THREE.Object3D) {
      const walls: Wall[] = [];
      root.traverse(object => {
        const normal = object.userData.cutawayNormal as number[] | undefined;
        if (normal) walls.push({ object, normal: new THREE.Vector3().fromArray(normal) });
        else if (object.userData.cutawayPartition) walls.push({ object, normal: null });
      });
      interiors.set(root, walls); dirty = true;
    },
    /** Recomputes only when the target, a registration or the camera's orientation changed.
     * OrbitControls re-derives the orientation every update, so compare by angle, not bits. */
    setTarget(target: CutawayTarget | null, camera: THREE.Camera) {
      const next = targetKey(target);
      if (!dirty && next === key && camera.quaternion.angleTo(rotation) < 1e-5) return;
      restore();
      key = next; rotation.copy(camera.quaternion); current = target; dirty = false;
      if (!target) return;
      camera.getWorldDirection(forward); view.copy(camera.matrixWorldInverse);
      apply(target);
    },
    /** Bakes see the whole world; the cutaway is re-applied afterwards even if `fn` throws. */
    suspend<T>(fn: () => T): T {
      restore();
      try { return fn(); } finally { if (current) apply(current); }
    },
    dispose() {
      restore();
      instanced.length = 0; trees.length = 0; interiors.clear(); current = null; key = '';
    },
  };
}
export type Cutaway = ReturnType<typeof createCutaway>;
