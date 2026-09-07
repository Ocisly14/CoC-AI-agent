import * as THREE from 'three';
import { patchMaterial, type ShaderPatch } from './lightingPatch';
import type { GrayhavenArt, Surface } from './painterlyArt';
/** Room-local fill: no outdoor height atlas, no extra scene-wide point lights. */
export function createInteriorLighting(art: GrayhavenArt, inverse: THREE.Matrix4, softShadow?: ShaderPatch) {
  const uniforms={uRoomInverse:{value:inverse},uRoomDay:{value:1}};
  const patch:ShaderPatch={key:'grayhaven-bluebird-room-light-v1',apply(shader){
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoomWorld;').replace('#include <project_vertex>','#include <project_vertex>\nvRoomWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoomWorld; uniform mat4 uRoomInverse; uniform float uRoomDay;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      vec3 rp=(uRoomInverse*vec4(vRoomWorld,1.0)).xyz;
      float fy=rp.y>6.12?6.182:.4;
      float edge=min(7.0-abs(rp.x),min(11.0-rp.z,rp.z+(fy>1.0?2.2:11.0)));
      float contact=mix(.68,1.0,smoothstep(0.0,1.2,max(edge,0.0))+0.0);
      float windowFill=(exp(-max(0.0,11.0-rp.z)*.19)+exp(-max(0.0,rp.x+7.0)*.25)*step(rp.y,6.1)*step(-1.0,rp.z)*.5)*uRoomDay;
      vec3 localWarm=vec3(.48,.32,.17)*(fy>1.0?.8:1.0);
      float pool=exp(-dot(rp.xz-vec2(1.0,4.0),rp.xz-vec2(1.0,4.0))*.027);
      localWarm*=.65+pool*.35;
      reflectedLight.directDiffuse*=.28;
      reflectedLight.indirectDiffuse*=.16;
      reflectedLight.indirectSpecular*=.06;
      totalEmissiveRadiance+=diffuseColor.rgb*contact*(localWarm+vec3(.18,.24,.26)*windowFill);
    `);
  }};
  const cache=new Map<string,THREE.MeshStandardMaterial>();
  return { material(color:number,surface?:Surface,metal=false){
    const key=`${color}:${surface}:${metal}`; if(cache.has(key))return cache.get(key)!;
    const mat=new THREE.MeshStandardMaterial({color,map:surface?art.surfaces[surface]:null,roughness:metal?.52:.9,metalness:metal?.3:0});
    patchMaterial(mat,patch); if(softShadow)patchMaterial(mat,softShadow); cache.set(key,mat); return mat;
  }, setDaylight(daylight:number){uniforms.uRoomDay.value=.04+THREE.MathUtils.clamp(daylight,0,1)*.96;}, uniforms };
}
