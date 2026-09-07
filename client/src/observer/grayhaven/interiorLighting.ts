import * as THREE from 'three';
import { patchMaterial, type ShaderPatch } from './lightingPatch';
import type { GrayhavenArt, Surface } from './painterlyArt';
/** Room-local daylight fill plus registered, floor-scoped physical lamp sources. */
export function createInteriorLighting(art: GrayhavenArt, inverse: THREE.Matrix4, softShadow?: ShaderPatch, sheriff=false) {
  const uniforms={uRoomInverse:{value:inverse},uRoomDay:{value:1},uRoomSheriff:{value:sheriff?1:0}};
  const patch:ShaderPatch={key:'grayhaven-room-light-v3',apply(shader){
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoomWorld;').replace('#include <project_vertex>','#include <project_vertex>\nvRoomWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoomWorld; uniform mat4 uRoomInverse; uniform float uRoomDay; uniform float uRoomSheriff;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      vec3 rp=(uRoomInverse*vec4(vRoomWorld,1.0)).xyz;
      float fy=uRoomSheriff>.5?.4:rp.y>6.12?6.182:.4;
      float edge=min(7.0-abs(rp.x),min(11.0-rp.z,rp.z+(fy>1.0?2.2:11.0)));
      if(uRoomSheriff>.5) edge=min(7.5-abs(rp.x),6.0-abs(rp.z));
      float contact=mix(.68,1.0,smoothstep(0.0,1.2,max(edge,0.0))+0.0);
      float windowFill=(exp(-max(0.0,11.0-rp.z)*.19)+exp(-max(0.0,rp.x+7.0)*.25)*step(rp.y,6.1)*step(-1.0,rp.z)*.5)*uRoomDay;
      if(uRoomSheriff>.5) windowFill=(exp(-max(0.0,6.0-rp.z)*.3)+exp(-max(0.0,rp.x+7.5)*.35)*.55)*uRoomDay;
      vec3 localWarm=vec3(.14,.10,.055)*(fy>1.0?.8:1.0);
      float pool=exp(-dot(rp.xz-vec2(1.0,4.0),rp.xz-vec2(1.0,4.0))*.027);
      localWarm*=.65+pool*.35;
      reflectedLight.directDiffuse*=.5;
      reflectedLight.indirectDiffuse*=.16;
      reflectedLight.indirectSpecular*=.06;
      totalEmissiveRadiance+=diffuseColor.rgb*contact*(localWarm+vec3(.18,.24,.26)*windowFill);
    `);
  }};
  const cache=new Map<string,THREE.MeshStandardMaterial>();
  const lamps:{light:THREE.PointLight;intensity:number}[]=[];
  let daylight=1;
  const lampGain=()=>.28+(1-daylight)*.72;
  return {
    registerLamp(light:THREE.PointLight,intensity:number){lamps.push({light,intensity});light.intensity=intensity*lampGain();},
    lampMaterial(){
      if(!cache.has('lamp'))cache.set('lamp',new THREE.MeshStandardMaterial({color:0xffedc6,emissive:0xffc879,emissiveIntensity:.3+2*(1-daylight),roughness:.7,side:THREE.DoubleSide}));
      cache.get('lamp')!.userData.revealProtected=true;
      return cache.get('lamp')!;
    },
    material(color:number,surface?:Surface,metal=false,revealOccluder=false){
    const key=`${color}:${surface}:${metal}:${revealOccluder}`; if(cache.has(key))return cache.get(key)!;
    const mat=new THREE.MeshStandardMaterial({color,map:surface?art.surfaces[surface]:null,roughness:metal?.52:.9,metalness:metal?.3:0});
    mat.userData.revealProtected=!revealOccluder;
    patchMaterial(mat,patch); if(softShadow)patchMaterial(mat,softShadow); cache.set(key,mat); return mat;
  }, setDaylight(amount:number){daylight=THREE.MathUtils.clamp(amount,0,1);uniforms.uRoomDay.value=.04+daylight*.96;
    for(const lamp of lamps)lamp.light.intensity=lamp.intensity*lampGain();
    const shade=cache.get('lamp');if(shade)shade.emissiveIntensity=.3+2*(1-daylight);
  }, uniforms };
}
