import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createRoadLighting,roadLampLayout} from './roadLighting';
import {createInteriorLighting} from './interiorLighting';
import {createBluebirdInterior} from './bluebirdInterior';
import {elevation,shoreline} from './layout';
import type {GrayhavenArt} from './painterlyArt';

describe('nighttime room and road fixtures',()=>{
  it('places eight lamps beside inhabited roads, above dry ground, aimed at the route',()=>{
    const sites=roadLampLayout();expect(sites).toHaveLength(8);
    for(const s of sites){expect(s.pole.x).toBeGreaterThan(shoreline(s.pole.z));expect(s.bulb.y-elevation(s.pole.x,s.pole.z)).toBeCloseTo(6.1);
      expect(s.target.y).toBeLessThan(s.bulb.y);expect(s.roadId).not.toMatch(/forest|trail/);}
    const metal=new THREE.MeshStandardMaterial(),texture=new THREE.Texture();
    const model=createRoadLighting(()=>metal,texture);
    expect(model.lights.filter(l=>l.castShadow)).toHaveLength(4);
    model.setNight(0);expect(model.lights.every(l=>l.intensity===0)).toBe(true);
    model.setNight(.5);expect(model.lights.every(l=>l.intensity===120)).toBe(true);
    model.setNight(1);expect(model.lights.every(l=>l.intensity===240&&l.distance===24)).toBe(true);
    expect(model.lights.every(l=>!l.shadow.autoUpdate)).toBe(true);
    model.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});model.dispose();metal.dispose();texture.dispose();
  });
  it('starts late-loaded fixtures at the current night level and gives each visible floor real light sources',()=>{
    const lighting=createInteriorLighting({surfaces:{bareWood:null}} as unknown as GrayhavenArt,new THREE.Matrix4());
    lighting.setDaylight(0);const model=createBluebirdInterior(lighting);
    model.setFloor(0);let active:THREE.PointLight[]=[];model.root.traverseVisible(o=>{if(o instanceof THREE.PointLight)active.push(o);});
    expect(active).toHaveLength(3);expect(active.map(l=>l.intensity)).toEqual([90,90,105]);
    expect(model.needsShadowUpdate()).toBe(true);for(const l of active)l.shadow.needsUpdate=false;expect(model.needsShadowUpdate()).toBe(false);
    model.setFloor(1);active=[];model.root.traverseVisible(o=>{if(o instanceof THREE.PointLight)active.push(o);});
    expect(active).toHaveLength(2);expect(active.map(l=>l.intensity)).toEqual([70,25]);expect(model.needsShadowUpdate()).toBe(true);
    lighting.setDaylight(1);expect(active[1].intensity).toBeCloseTo(7);expect(lighting.lampMaterial().emissiveIntensity).toBeCloseTo(.3);
    for(const lamp of model.lamps){expect(lamp.castShadow).toBe(true);expect(lamp.shadow.autoUpdate).toBe(false);expect(lamp.distance).toBeLessThanOrEqual(10);}
    model.dispose();
  });
});
