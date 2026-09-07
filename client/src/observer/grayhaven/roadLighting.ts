import * as THREE from 'three';
import { roadPaths, elevation } from './layout';
import { BAKE_LAYER } from './worldLightAtlas';
import type { Surface } from './painterlyArt';

/** Fixed utility lamps on inhabited routes; forest paths remain unlit. */
export function roadLampLayout() {
  const sites:[string,number,number][]=[
    ['ROAD_main_street',.08,-1],['ROAD_main_street',.34,1],['ROAD_main_street',.62,-1],['ROAD_main_street',.9,1],
    ['ROAD_backstreet',.62,-1],['ROAD_holt_lane',.78,1],['ROAD_old_coast_road',.78,-1],['ROAD_dock_slope',.8,-1],
  ];
  return sites.map(([id,t,side])=>{
    const road=roadPaths.find(r=>r.id===id)!;
    const curve=new THREE.CatmullRomCurve3(road.points.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
    const center=curve.getPointAt(t),tangent=curve.getTangentAt(t),outward=new THREE.Vector3(tangent.z,0,-tangent.x).multiplyScalar(side);
    const paved=id==='ROAD_main_street'||id==='ROAD_old_coast_road';
    const pole=center.clone().addScaledVector(outward,paved?5.4:3.2);pole.y=elevation(pole.x,pole.z);
    const bulb=pole.clone().addScaledVector(outward,-1.5);bulb.y+=6.1;
    center.y=elevation(center.x,center.z)+.25;
    return {roadId:id,pole,bulb,target:center};
  });
}

export function createRoadLighting(material:(color:number,surface?:Surface)=>THREE.Material,haloMap:THREE.Texture) {
  const root=new THREE.Group();root.name='inhabited-road-lamps';
  const lights:THREE.SpotLight[]=[];
  const bulbMaterial=new THREE.MeshStandardMaterial({color:0xeee2bc,emissive:0xffcf87,emissiveIntensity:0,roughness:.55});
  const haloMaterial=new THREE.SpriteMaterial({map:haloMap,color:0xffcf8e,opacity:0,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const metal=material(0x53625c),wood=material(0x756957,'bareWood');
  const add=(geometry:THREE.BufferGeometry,mat:THREE.Material,position:THREE.Vector3,shadow=true)=>{
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.copy(position);mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.layers.enable(BAKE_LAYER.bounce);root.add(mesh);return mesh;
  };
  for(const [index,site] of roadLampLayout().entries()) {
    add(new THREE.CylinderGeometry(.13,.23,6.4,7),wood,site.pole.clone().add(new THREE.Vector3(0,3.2,0)));
    const start=site.pole.clone().add(new THREE.Vector3(0,6.35,0)),end=site.bulb.clone().add(new THREE.Vector3(0,.25,0));
    const delta=end.clone().sub(start);
    const arm=add(new THREE.CylinderGeometry(.08,.08,delta.length(),6),metal,start.clone().add(end).multiplyScalar(.5));
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    add(new THREE.ConeGeometry(.53,.32,10),metal,site.bulb.clone().add(new THREE.Vector3(0,.3,0)),false);
    add(new THREE.SphereGeometry(.24,10,6),bulbMaterial,site.bulb,false);
    const halo=new THREE.Sprite(haloMaterial);halo.position.copy(site.bulb);halo.scale.set(2.6,2.6,1);root.add(halo);
    const light=new THREE.SpotLight(0xffd3a0,0,24,.94,.78,2);
    light.position.copy(site.bulb);light.target.position.copy(site.target);
    // Four shadowed junction lamps share the texture budget with the sun,
    // lighthouse and up to three room lights (WebGL2 guarantees 16 samplers).
    // The remaining downward cones provide bounded fill along open road segments.
    light.castShadow=[0,1,4,5].includes(index);light.shadow.mapSize.set(256,256);light.shadow.camera.near=.2;
    light.shadow.bias=-.0002;light.shadow.normalBias=.07;
    light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;light.layers.enable(BAKE_LAYER.bounce);
    root.add(light,light.target);lights.push(light);
  }
  return {root,lights,setNight(amount:number){const night=THREE.MathUtils.clamp(amount,0,1);for(const light of lights)light.intensity=night*240;bulbMaterial.emissiveIntensity=night*3;haloMaterial.opacity=night*.5;},
    dispose(){for(const light of lights)light.dispose();bulbMaterial.dispose();haloMaterial.dispose();},
  };
}
