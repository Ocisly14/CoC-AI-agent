import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSheriffInterior } from './sheriffInterior';
import { createInteriorLighting } from './interiorLighting';
import { sheriffScenes,buildingForRoom,interiorFrame,CLOSED_INTERIOR } from './buildingInteriors';
import { createSheriffShadowShell,sheriffWalls } from './sheriffShell';
import { GrayhavenWorld } from './GrayhavenWorld';
import type { GrayhavenArt } from './painterlyArt';
const art={surfaces:{bareWood:null}} as unknown as GrayhavenArt;
const make=()=>createSheriffInterior(createInteriorLighting(art,new THREE.Matrix4(),undefined,true));
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

describe('Sheriff authored rooms',()=>{
  it('preserves the exact three module rooms and every item anchor',()=>{
    expect(sheriffScenes).toHaveLength(3);const model=make();
    for(const scene of sheriffScenes){
      expect(scene).toEqual(JSON.parse(readFileSync(`testmods/grayhaven/Grayhaven_Scenarios/${scene.id}.json`,'utf8')));
      expect(buildingForRoom(scene.id)).toBe('sheriff');
    }
    const expected=sheriffScenes.flatMap(s=>s.references.items.map(i=>i.id));
    const items=model.hits.map(h=>h.userData.itemId).filter(Boolean);
    expect(items.sort()).toEqual(expected.sort());
    for(const hit of model.hits){
      expect(hit.userData.floor).toBe(0);
      if(hit.userData.targetId)expect(sheriffScenes.find(s=>s.id===hit.userData.sceneId)!.references.connections.some(c=>c.targetId===hit.userData.targetId)).toBe(true);
    }
    model.dispose();
  });
  it('fits three distinct rooms inside the existing shell and batches furniture',()=>{
    const model=make();let calls=0,triangles=0;
    model.root.traverse(o=>{
      if(!(o instanceof THREE.Mesh) || !(o.material as THREE.Material).visible)return;
      calls++;triangles+=o.geometry.attributes.position.count/3;
      o.geometry.computeBoundingBox();const b=o.geometry.boundingBox!;
      expect(b.min.x).toBeGreaterThanOrEqual(-7.7);expect(b.max.x).toBeLessThanOrEqual(7.7);
      expect(b.min.z).toBeGreaterThanOrEqual(-6.2);expect(b.max.z).toBeLessThanOrEqual(6.2);
      expect(b.max.y).toBeLessThanOrEqual(7.6+.001);
    });
    expect(calls).toBeLessThanOrEqual(18);expect(triangles).toBeLessThan(25000);
    for(const scene of sheriffScenes){
      const frame=interiorFrame({status:'open',building:'sheriff',room:scene.id,item:null,floor:0});
      expect(frame.center.z).toBe(scene.id.endsWith('front')?3.1:-2.5);
    }
    expect(model.lamps).toHaveLength(3);model.dispose();
  });
  it('leaves actual street, office-window and cell-window holes for physical daylight',()=>{
    const shell=createSheriffShadowShell();shell.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(0,2,8),new THREE.Vector3(0,0,-1),0,3);
    expect(ray.intersectObject(shell,true)).toHaveLength(0);
    ray.set(new THREE.Vector3(-9,3,-3),new THREE.Vector3(1,0,0));expect(ray.intersectObject(shell,true)).toHaveLength(0);
    ray.set(new THREE.Vector3(4,5,-8),new THREE.Vector3(0,0,1));expect(ray.intersectObject(shell,true)).toHaveLength(0);
    ray.set(new THREE.Vector3(6.8,2,8),new THREE.Vector3(0,0,-1));expect(ray.intersectObject(shell,true).length).toBeGreaterThan(0);
    for(const piece of sheriffWalls())expect(piece.size.every(n=>n>0)).toBe(true);
    shell.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
  });
  it('opens the new station after an older diner import resolves late, then restores street view',async()=>{
    const world=Object.create(GrayhavenWorld.prototype) as any;
    let dinerDone!:()=>void,sheriffDone!:()=>void;
    const dinerPending=new Promise<void>(yes=>dinerDone=yes),sheriffPending=new Promise<void>(yes=>sheriffDone=yes);
    const diner={root:new THREE.Group(),setFloor:vi.fn()},sheriff={root:new THREE.Group(),setFloor:vi.fn()};
    diner.root.visible=false;sheriff.root.visible=false;
    Object.assign(world,{interiorState:{...CLOSED_INTERIOR},interiorRequest:0,disposed:false,
      options:{onInterior:vi.fn()},host:{dataset:{}},controls:{target:new THREE.Vector3(20,8,9)},camera:{zoom:3.2},
      dinerExterior:new THREE.Group(),sheriffExterior:new THREE.Group(),dinerModel:diner,sheriffModel:sheriff,
      dinerInverse:new THREE.Matrix4(),sheriffInverse:new THREE.Matrix4(),seaMist:{setInterior:vi.fn()},
      streetView:null,loadInterior:vi.fn((id:string)=>id==='sheriff'?sheriffPending:dinerPending),fitInterior:vi.fn()});
    world.openInterior('SCN_bluebird_upstairs');world.openInterior('SCN_sheriff_office');
    dinerDone();await flush();expect(diner.root.visible).toBe(false);expect(world.interiorState.status).toBe('loading');
    sheriffDone();await flush();expect(world.interiorState.status).toBe('open');expect(sheriff.root.visible).toBe(true);
    expect(world.interiorState.building).toBe('sheriff');expect(world.interiorState.floor).toBe(0);
    expect(world.seaMist.setInterior).toHaveBeenLastCalledWith(world.sheriffInverse,true,true);
    world.setInteriorFloor(1);expect(world.interiorState.floor).toBe(0);
    world.returnToBuilding();expect(world.interiorState.building).toBe('sheriff');expect(world.interiorState.room).toBeNull();
    world.returnToStreet();expect(sheriff.root.visible).toBe(false);expect(world.focusTarget.toArray()).toEqual([20,8,9]);
    expect(world.focusZoom).toBe(3.2);
  });
});
