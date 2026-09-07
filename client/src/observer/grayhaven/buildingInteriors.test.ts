import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildingScenes, cutawayDecision, insideBluebird, roomFloor, projectedBuilding } from './buildingInteriors';
import { bluebirdWalls,createBluebirdShadowShell } from './bluebirdShell';
import { createBluebirdInterior } from './bluebirdInterior';
import { createInteriorLighting } from './interiorLighting';
import type { GrayhavenArt } from './painterlyArt';
const art={surfaces:{bareWood:null}} as unknown as GrayhavenArt;
const make=()=>createBluebirdInterior(createInteriorLighting(art,new THREE.Matrix4()),new THREE.Vector3(-.714,.487,-.503));

describe('Bluebird authored cutaway',()=>{
  it('exports the exact module rooms, references and connections without inventing upstairs SCNs',()=>{
    expect(buildingScenes).toHaveLength(3);
    for(const scene of buildingScenes)expect(scene).toEqual(JSON.parse(readFileSync(`testmods/grayhaven/Grayhaven_Scenarios/${scene.id}.json`,'utf8')));
    expect(roomFloor('SCN_bluebird_upstairs')).toBe(1);
  });
  it('has hysteresis and does not open an offscreen building',()=>{
    expect(cutawayDecision(.13,true,false)).toBe('prefetch');expect(cutawayDecision(.23,true,false)).toBe('open');
    expect(cutawayDecision(.19,true,true)).not.toBe('close');expect(cutawayDecision(.15,true,true)).toBe('close');
    expect(cutawayDecision(.9,false,true)).toBe('close');
    const camera=new THREE.OrthographicCamera(-30,30,30,-30,.1,100);camera.position.set(-30,30,30);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    expect(projectedBuilding(camera,new THREE.Matrix4()).inView).toBe(true);
    expect(projectedBuilding(camera,new THREE.Matrix4().makeTranslation(1000,0,0)).inView).toBe(false);
  });
  it('protects both room volumes without clearing the air above the low kitchen roof',()=>{
    expect(insideBluebird(new THREE.Vector3(0,2,-7))).toBe(true);expect(insideBluebird(new THREE.Vector3(0,8,4))).toBe(true);
    expect(insideBluebird(new THREE.Vector3(0,8,-7))).toBe(false);expect(insideBluebird(new THREE.Vector3(8,2,4))).toBe(false);
    expect(insideBluebird(new THREE.Vector3(0,-1,4))).toBe(false);
  });
  it('keeps genuine door/window holes in the physical shadow shell',()=>{
    const shell=createBluebirdShadowShell();shell.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(-4.05,2,15),new THREE.Vector3(0,0,-1),0,5);
    expect(ray.intersectObject(shell,true)).toHaveLength(0);
    ray.set(new THREE.Vector3(-6.7,2,15),new THREE.Vector3(0,0,-1));expect(ray.intersectObject(shell,true).length).toBeGreaterThan(0);
    for(const p of bluebirdWalls())expect(p.size.every(n=>n>0)).toBe(true);
    shell.traverse(o=>{if(o instanceof THREE.Mesh){expect(o.castShadow).toBe(true);expect((o.material as THREE.MeshBasicMaterial).colorWrite).toBe(false);o.geometry.dispose();}});
  });
  it('represents every module item, isolates floor picking and stays within the geometry budget',()=>{
    const model=make();const ids=new Set(model.hits.map(h=>h.userData.itemId).filter(Boolean));
    expect([...ids].sort()).toEqual(buildingScenes.flatMap(s=>s.references.items.map(i=>i.id)).sort());
    let triangles=0,calls=0;model.root.traverse(o=>{if(o instanceof THREE.Mesh && (o.material as THREE.Material).visible){calls++;triangles+=o.geometry.attributes.position.count/3;}});
    expect(calls).toBeLessThanOrEqual(30);expect(triangles).toBeLessThan(50000);
    model.setFloor(1);for(const h of model.hits)expect(h.parent!.visible).toBe(h.userData.floor===1);
    model.dispose();
  });
  it('leaves an upstairs stair opening and a connected landing',()=>{
    const model=make();model.setFloor(1);model.root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(5.6,6.5,0),new THREE.Vector3(0,-1,0),0,.8);
    const meshes:THREE.Mesh[]=[];model.root.traverseVisible(o=>{if(o instanceof THREE.Mesh && (o.material as THREE.Material).visible)meshes.push(o);});
    expect(ray.intersectObjects(meshes,false)).toHaveLength(0);
    ray.set(new THREE.Vector3(5.6,6.5,2.1),new THREE.Vector3(0,-1,0));expect(ray.intersectObjects(meshes,false).length).toBeGreaterThan(0);
    model.dispose();
  });
});
