import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import scene from '../../../../testmods/grayhaven/Grayhaven_Scenarios/SCN_redwood_ring.json';
import notes from './redwoodRingScene.generated.json';
import { REDWOOD_RING, REDWOOD_TREES, REDWOOD_VIEW, redwoodDetailLevel } from './redwoodRingLayout';
import { createRedwoodRingScene } from './redwoodRingScene';
import { distanceToRoad, elevation } from './layout';
import { makeForestLayout } from './forestLayout';
import { BAKE_LAYER } from './worldLightAtlas';

describe('Redwood Ring zoom scene', () => {
  it('splits each giant into an untagged stump and a hideable upper trunk and crown, using shared materials',()=>{
    const source=new THREE.MeshStandardMaterial();
    const ring=createRedwoodRingScene(()=>source,source,source);
    const tagged=(name:string,tree:typeof REDWOOD_TREES[number])=>{
      const object=ring.root.getObjectByName(name) as THREE.Mesh;
      expect(object,name).toBeInstanceOf(THREE.Mesh);expect(object.material).toBe(source);
      const span=object.userData.cutawayTree;
      expect(span.height).toBe(tree.height);
      expect(span.base.x).toBe(tree.x);expect(span.base.z).toBe(tree.z);expect(span.base.y).toBe(elevation(tree.x,tree.z));
    };
    for(const tree of REDWOOD_TREES){tagged(`redwood-trunk-${tree.seed}`,tree);tagged(`redwood-crown-${tree.seed}`,tree);}
    const stumps=ring.root.getObjectByName('redwood-trunk-stumps') as THREE.Mesh;
    expect(stumps).toBeInstanceOf(THREE.Mesh);expect((stumps as THREE.InstancedMesh).isInstancedMesh).toBeFalsy();
    expect(stumps.userData.cutawayTree).toBeUndefined();expect(stumps.material).toBe(source);
    // The stump top is the second lathe point: 3 up, or 7.4 above the hollow giant's raised bottom.
    stumps.geometry.computeBoundingBox();
    const top=Math.max(...REDWOOD_TREES.map(tree=>elevation(tree.x,tree.z)+(tree.seed===8?7.4:3)));
    expect(stumps.geometry.boundingBox!.max.y).toBeCloseTo(top,3);
    const untagged=(object:THREE.Object3D)=>{if(object instanceof THREE.Mesh){
      expect(object.userData.cutawayTree).toBeUndefined();expect(object.userData.cutawayInstances).toBeUndefined();expect(object.material).toBe(source);
    }};
    untagged(ring.root.getObjectByName('redwood-clearing-ground')!);
    ring.root.getObjectByName('redwood-detail-1')!.traverse(untagged);
    const instanced:THREE.InstancedMesh[]=[];
    ring.root.getObjectByName('redwood-detail-0')!.traverse(o=>{if((o as THREE.InstancedMesh).isInstancedMesh)instanced.push(o as THREE.InstancedMesh);});
    const batches=instanced.filter(m=>m.userData.cutawayInstances);
    expect(batches).toHaveLength(1);
    const stubs=batches[0];
    expect(stubs.userData.cutawayInstances).toHaveLength(REDWOOD_TREES.length*3);expect(stubs.count).toBe(REDWOOD_TREES.length*3);
    for(const span of stubs.userData.cutawayInstances)expect(REDWOOD_TREES.some(tree=>tree.height===span.height&&span.base.x===tree.x)).toBe(true);
    // Buttress roots share the tier and the material but stay, so they batch separately and carry no spans.
    const buttress=instanced.reduce((a,b)=>b.count>a.count?b:a);
    expect(buttress).not.toBe(stubs);expect(buttress.count).toBeGreaterThan(stubs.count);expect(buttress.userData.cutawayInstances).toBeUndefined();
    const geometries=new Set<THREE.BufferGeometry>();
    ring.root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
    geometries.forEach(g=>g.dispose());source.dispose();
  });
  it('preserves the seven authored objects and leaves the three approach trails open', () => {
    expect(notes.items).toEqual(scene.references.items);
    expect(REDWOOD_TREES.length).toBeGreaterThanOrEqual(12);
    expect(REDWOOD_TREES.length).toBeLessThan(20);
    for (const tree of REDWOOD_TREES) expect(distanceToRoad([tree.x, tree.z])).toBeGreaterThanOrEqual(6);
    for (const tree of makeForestLayout()) {
      expect(Math.hypot(tree.x - REDWOOD_RING.x, tree.z - REDWOOD_RING.z)).toBeGreaterThanOrEqual(REDWOOD_RING.reserveRadius);
    }
  });
  it('reveals details after zooming, with hysteresis and close detail on selection', () => {
    expect(redwoodDetailLevel(1)).toBe(0);
    expect(redwoodDetailLevel(2.5)).toBe(1);
    expect(redwoodDetailLevel(2.3, 1)).toBe(1);
    expect(redwoodDetailLevel(2.2, 1)).toBe(0);
    expect(redwoodDetailLevel(REDWOOD_VIEW.zoom)).toBe(2);
    expect(redwoodDetailLevel(4.4, 2)).toBe(2);
    expect(redwoodDetailLevel(4.3, 2)).toBe(1);
  });
  it('keeps stable grove shadows, finite geometry and bounded draw calls across zoom levels', () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const factory = (color: THREE.ColorRepresentation, surface?: string) => {
      const key = `${color}/${surface}`;
      if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color }));
      return materials.get(key)!;
    };
    const ring = createRedwoodRingScene(factory, factory(0x887766), factory(0x557755));
    const casters = () => {
      const objects: THREE.Object3D[] = [];
      ring.root.traverseVisible(o => { if ((o as THREE.Mesh).castShadow || o.layers.isEnabled(BAKE_LAYER.bounce)) objects.push(o); });
      return objects;
    };
    ring.update(1); const overview = casters();
    expect(overview.length).toBeGreaterThan(20);
    ring.update(REDWOOD_VIEW.zoom);
    ring.root.updateMatrixWorld(true);
    const ground=ring.root.getObjectByName('redwood-clearing-ground')!;
    for(let x=-12;x<=12;x+=4)for(let z=-12;z<=12;z+=4) {
      if(Math.hypot(x,z)>15)continue;
      const wx=REDWOOD_RING.x+x,wz=REDWOOD_RING.z+z,y=elevation(wx,wz);
      const hit=new THREE.Raycaster(new THREE.Vector3(wx,y+2,wz),new THREE.Vector3(0,-1,0)).intersectObject(ground)[0];
      expect(hit).toBeDefined();expect(hit.point.y-y).toBeGreaterThan(0);expect(hit.point.y-y).toBeLessThan(.3);
    }
    expect(casters()).toEqual(overview);
    expect(ring.root.getObjectByName('redwood-detail-2')!.visible).toBe(true);
    let drawCalls = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    for (const item of notes.items) expect(ring.root.getObjectByName(item.id)).toBeDefined();
    ring.root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      drawCalls++; geometries.add(mesh.geometry);
      expect(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      const instanced = mesh as THREE.InstancedMesh;
      if (instanced.isInstancedMesh) expect(Array.from(instanced.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    });
    expect(drawCalls).toBeLessThan(80);
    ring.update(1);
    expect(ring.root.getObjectByName('redwood-detail-1')!.visible).toBe(false);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  });
});
