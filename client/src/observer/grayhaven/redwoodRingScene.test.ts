import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import scene from '../../../../testmods/grayhaven/Grayhaven_Scenarios/SCN_redwood_ring.json';
import notes from './redwoodRingScene.generated.json';
import { REDWOOD_RING, REDWOOD_TREES, REDWOOD_VIEW, redwoodDetailLevel } from './redwoodRingLayout';
import { createRedwoodRingScene } from './redwoodRingScene';
import { distanceToRoad, elevation } from './layout';
import { makeForestLayout } from './forestLayout';
import { BAKE_LAYER } from './worldLightAtlas';
import { patchMaterial } from './lightingPatch';

describe('Redwood Ring zoom scene', () => {
  it('preserves underlying props without protecting the trees or losing live lighting uniforms',()=>{
    const day={value:.4};
    const source=new THREE.MeshStandardMaterial();patchMaterial(source,{key:'live-day',apply(shader){shader.uniforms.uDay=day;}});
    const ring=createRedwoodRingScene(()=>source,source,source);
    const trunk=ring.root.getObjectByName('redwood-trunk-0') as THREE.Mesh;
    expect((trunk.material as THREE.Material).userData.revealProtected).not.toBe(true);
    const props=ring.root.getObjectByName('redwood-detail-1')!;
    props.traverse(object=>{if(object instanceof THREE.Mesh){
      const mat=object.material as THREE.Material;
      expect(mat.userData.revealProtected).toBe(true);expect(mat).not.toBe(source);
      const shader={uniforms:{},vertexShader:'',fragmentShader:''};mat.onBeforeCompile(shader as never,{} as never);
      expect((shader.uniforms as any).uDay).toBe(day);
    }});
    expect(source.userData.revealProtected).toBeUndefined();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    ring.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
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
