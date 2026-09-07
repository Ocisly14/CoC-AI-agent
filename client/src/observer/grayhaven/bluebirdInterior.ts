import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bluebirdWalls } from './bluebirdShell';
import { BLUEBIRD as B, buildingScenes } from './buildingInteriors';
import type { createInteriorLighting } from './interiorLighting';

export function createBluebirdInterior(light:ReturnType<typeof createInteriorLighting>, view:THREE.Vector3) {
  const root=new THREE.Group(); root.name='bluebird-authored-interior';
  const floors=[new THREE.Group(),new THREE.Group()]; root.add(...floors);
  const hits:THREE.Mesh[]=[];
  const pickMaterial=new THREE.MeshBasicMaterial({visible:false});
  const mat={plaster:light.material(0xd0c6ad),trim:light.material(0x685345,'bareWood'),wood:light.material(0xc9aa7c,'bareWood'),green:light.material(0x426354),red:light.material(0x985b4e),cream:light.material(0xe5decb),steel:light.material(0x899b9a,undefined,true),dark:light.material(0x343d37),tile:light.material(0xb0aea0),paper:light.material(0xdad0b4),brass:light.material(0xbaa16e,undefined,true)};
  const batches=new Map<THREE.Group,Map<THREE.Material,THREE.BufferGeometry[]>>();
  const add=(group:THREE.Group,geo:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>{
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));
    if(!batches.has(group))batches.set(group,new Map()); const b=batches.get(group)!; if(!b.has(m))b.set(m,[]); b.get(m)!.push(geo.index?geo.toNonIndexed():geo); if(geo.index)geo.dispose();
  };
  const box=(g:THREE.Group,w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number,ry=0)=>add(g,new THREE.BoxGeometry(w,h,d),m,x,y,z,0,ry);
  const cyl=(g:THREE.Group,r:number,h:number,m:THREE.Material,x:number,y:number,z:number,rx=0)=>add(g,new THREE.CylinderGeometry(r,r,h,12),m,x,y,z,rx);
  const pick=(floor:0|1,scene:string,item:string|null,at:number[],size:number[],target?:string)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),pickMaterial);m.position.fromArray(at);m.userData={sceneId:scene,itemId:item,targetId:target,floor};floors[floor].add(m);hits.push(m);
  };
  const anchor=(floor:0|1,scene:string,item:string,x:number,y:number,z:number,w=1.1,h=.9,d=1.1)=>pick(floor,scene,`item.bluebird_${scene.split('_').at(-1)}.${item}`,[x,y,z],[w,h,d]);
  // Separate lower-storey support when viewing upstairs; its colour remains exterior siding.
  for(const floor of [0,1] as const) {
    const g=floors[floor], y=floor?B.upper:B.ground;
    for(const p of bluebirdWalls()) {
      if(p.floor>floor)continue;
      if(p.floor<floor) {box(g,...p.size,mat.plaster,...p.at);continue;}
      const near=new THREE.Vector3(...p.normal).dot(view)>.12;
      const lo=p.at[1]-p.size[1]/2, hi=near?Math.min(p.at[1]+p.size[1]/2,y+.95):p.at[1]+p.size[1]/2;
      if(hi>lo)box(g,p.size[0],hi-lo,p.size[2],mat.plaster,p.at[0],(hi+lo)/2,p.at[2]);
      if(near && lo<y+.95 && hi>=y+.95)box(g,p.size[0]+.06,.09,p.size[2]+.06,mat.trim,p.at[0],hi+.04,p.at[2]);
    }
    // Cut walls are solid capped boxes; room floors never share the outdoor GI atlas.
    if(floor===0) {
      box(g,13.7,.25,21.7,mat.tile,0,y-.125,0);
      // Old checkerboard linoleum only in the dining room, with a clear kitchen threshold.
      for(let x=-6;x<=6;x+=1.5)for(let z=-1.3;z<10.5;z+=1.5)if(Math.round((x+6+z+1.3)/1.5)%2===0)box(g,1.48,.012,1.48,mat.cream,x,y+.008,z);
    } else {
      box(g,11.7,.24,13.2,mat.wood,-1.15,y-.12,4.4);box(g,2.3,.24,9.3,mat.wood,5.85,y-.12,6.35);
      for(let x=-6.6;x<6.8;x+=.58)box(g,.018,.012,9.2,mat.trim,x,y+.01,6.3);
      box(g,4.5,.025,4.3,mat.red,-2,y+.02,5.5);
      // Living and bedroom are visual zones of the same SCN, with an open door at z 3.5.
      box(g,.22,1,4.4,mat.plaster,1.5,y+.5,0);box(g,.22,1,5.3,mat.plaster,1.5,y+.5,8.35);
      box(g,.28,.08,4.4,mat.trim,1.5,y+1.04,0);box(g,.28,.08,5.3,mat.trim,1.5,y+1.04,8.35);
      // Stairwell railing: an actual opening, no slab covering the flight.
      for(let z=-1.9;z<1.7;z+=.65)box(g,.1,1,.1,mat.trim,4.72,y+.5,z);
      box(g,.14,.12,4,mat.wood,4.72,y+1,-.2);
      box(g,1.8,.12,.14,mat.wood,5.6,y+1,1.72);
    }
  }
  const d=floors[0], u=floors[1], y=B.ground, uy=B.upper;
  // Dining/kitchen partition with a 2.1 m spring-door opening and serving hatch.
  for(const [x,w] of [[-2.6,8.4],[5.9,1.8]]) {box(d,w,1,.25,mat.plaster,x,y+.5,-2.2);box(d,w,.1,.32,mat.trim,x,y+1.05,-2.2);}
  for(const x of [2.9,4.2]) {box(d,.9,1.35,.1,mat.green,x,y+.68,-2.2,x===2.9?-.5:.5);}
  pick(0,'SCN_bluebird_dining',null,[3.55,1.5,-2.2],[2.2,2.2,.6],'SCN_bluebird_kitchen');
  // Maple counter and red fixed swivel stools, running toward the rear kitchen door.
  box(d,1.65,1.15,8.2,mat.green,1.3,y+.575,3.4);box(d,2,.18,8.6,mat.wood,1.3,y+1.24,3.4);
  for(let z=.1;z<7.5;z+=1.45){cyl(d,.36,.12,mat.steel,-.4,y+.06,z);cyl(d,.09,.75,mat.steel,-.4,y+.42,z);cyl(d,.43,.18,mat.red,-.4,y+.88,z);}
  anchor(0,'SCN_bluebird_dining','lunch_counter',1.3,y+.9,3.4,2,1.7,8.6);
  // Window-side booths: three differently occupied bays; tables have separate legs and tops.
  for(const z of [1,4.35,7.7]) {
    for(const side of [-1,1]) {box(d,2.3,.45,.68,mat.green,-4.7,y+.45,z+side*.9);box(d,2.3,1.18,.2,mat.green,-4.7,y+.75,z+side*1.2);}
    box(d,2.15,.13,1.1,mat.cream,-4.7,y+1.04,z);cyl(d,.12,.95,mat.steel,-4.7,y+.48,z);
    cyl(d,.12,.25,mat.paper,-4.65,y+1.23,z);cyl(d,.075,.2,mat.dark,-4.3,y+1.2,z);
  }
  anchor(0,'SCN_bluebird_dining','booths',-4.7,y+.8,4.35,2.4,1.6,8.9);
  anchor(0,'SCN_bluebird_dining','sugar_shakers',-4.55,y+1.2,4.35,.65,.4,.5);
  const prop=(g:THREE.Group,f:0|1,s:string,id:string,w:number,h:number,depth:number,m:THREE.Material,x:number,py:number,z:number)=>{box(g,w,h,depth,m,x,py,z);anchor(f,s,id,x,py,z,w+.15,h+.15,depth+.15);};
  const ds='SCN_bluebird_dining',ks='SCN_bluebird_kitchen',us='SCN_bluebird_upstairs';
  prop(d,0,ds,'espresso_machine',.9,.75,.65,mat.steel,1.3,y+1.75,6.6);cyl(d,.13,.4,mat.dark,1.3,y+1.6,6.1,Math.PI/2);
  // Pastry case: thin frame + clear open viewing face avoids a large opaque glass block.
  box(d,1.75,.1,1.1,mat.steel,1.3,y+1.4,4.8);box(d,1.75,.06,1.1,mat.cream,1.3,y+2.05,4.8);
  for(const x of [.46,2.14])box(d,.07,.65,1.05,mat.steel,x,y+1.7,4.8);
  for(const x of [.85,1.45,1.9])for(const z of [4.5,5])cyl(d,.17,.1,mat.brass,x,y+1.5,z);
  anchor(0,ds,'pastry_case',1.3,y+1.7,4.8,1.9,.8,1.2);
  prop(d,0,ds,'cash_register',.7,.5,.65,mat.brass,1.3,y+1.58,1.2);
  cyl(d,.16,.35,mat.paper,1.2,y+1.5,1.9);anchor(0,ds,'tip_jar',1.2,y+1.5,1.9,.4,.45,.4);
  prop(d,0,ds,'counter_radio',.8,.48,.4,mat.trim,2,y+1.6,-.1);box(d,.45,.25,.04,mat.dark,2,y+1.6,.12);
  box(d,.12,1.55,.12,mat.trim,5.2,y+.78,-2.2);
  prop(d,0,ds,'menu_board',1.5,1.1,.1,mat.dark,5.2,y+1.5,-2.05);
  for(let i=0;i<4;i++)box(d,.7+i%2*.4,.025,.02,mat.paper,5.2,y+1.8-i*.2,-1.98);
  box(d,1.25,2.9,.12,mat.wood,2,y+1.45,-2.16);
  cyl(d,.43,.12,mat.cream,2,y+2.65,-2.04,Math.PI/2);box(d,.03,.27,.03,mat.dark,2,y+2.74,-1.96);box(d,.22,.03,.03,mat.dark,2.1,y+2.65,-1.96);anchor(0,ds,'wall_clock',2,y+2.65,-2.04);
  prop(d,0,ds,'wall_phone',.4,.65,.2,mat.dark,6.6,y+1.7,0);
  prop(d,0,ds,'newspaper_rack',1,.9,.6,mat.trim,-2.1,y+.45,9.9);box(d,.8,.6,.08,mat.paper,-2.1,y+.8,9.9);
  prop(d,0,ds,'door_sign',.6,.35,.08,mat.wood,-4.05,y+1,10.9);
  // Suspended lamps are kept high and sparse; no roof slab floats over the room.
  for(const x of [-2.7,2.6])for(const z of [2,6.8]) {add(d,new THREE.ConeGeometry(.4,.34,12,1,true),mat.cream,x,y+3.5,z,Math.PI);cyl(d,.025,.7,mat.dark,x,y+4,z);}
  anchor(0,ds,'ceiling_lights',-2.7,y+3.5,6.8);
  // Kitchen: steel preparation run, six burners, oven, open storage and triple sink.
  prop(d,0,ks,'prep_table',1.65,.16,5.8,mat.steel,-2.1,y+1.15,-6.4);
  for(const x of [-2.75,-1.45])for(const z of [-8.8,-4])box(d,.1,1.1,.1,mat.steel,x,y+.55,z);
  prop(d,0,ks,'knife_block',.45,.5,.4,mat.wood,-2.1,y+1.47,-4.6);
  prop(d,0,ks,'range',1.6,1.05,2.4,mat.cream,-5.85,y+.53,-5.5);
  for(const x of [-6.25,-5.5])for(const z of [-6.3,-5.5,-4.7])cyl(d,.25,.06,mat.dark,x,y+1.1,z);
  cyl(d,.38,.5,mat.dark,-6.25,y+1.4,-5.5);anchor(0,ks,'stew_pot',-6.25,y+1.4,-5.5);
  prop(d,0,ks,'old_oven',1.5,1.2,1.8,mat.cream,-5.85,y+.6,-8.25);box(d,.06,.6,1.4,mat.dark,-5.04,y+.55,-8.25);
  prop(d,0,ks,'tart_tray',1,.06,.7,mat.steel,-2.1,y+1.28,-7.5);
  for(let i=0;i<6;i++)cyl(d,.12,.07,mat.brass,-2.4+i%3*.28,y+1.34,-7.7+Math.floor(i/3)*.35);
  prop(d,0,ks,'spice_rack',.5,.12,2,mat.trim,-6.4,y+2.2,-8.25);
  for(let i=0;i<6;i++)cyl(d,.12,.3,i%2?mat.brass:mat.paper,-6.4,y+2.4,-9+i*.3);
  prop(d,0,ks,'cooler',1.5,2.5,1.6,mat.cream,.55,y+1.25,-9.8);box(d,.08,.7,.08,mat.steel,1.22,y+1.5,-8.95);
  prop(d,0,ks,'pantry_shelf',1.4,.16,1.5,mat.trim,2.25,y+1.7,-9.8);
  for(const py of [.4,1,1.7]){box(d,1.4,.12,1.5,mat.trim,2.25,y+py,-9.8);for(let j=0;j<3;j++)cyl(d,.16,.34,mat.paper,1.85+j*.4,y+py+.23,-9.5);}
  // Three open sink bowls made from rims and dark recessed bottoms, not solid cubes.
  for(const z of [-3.7,-4.65,-5.6]) {box(d,1.6,.08,.9,mat.steel,.8,y+1.05,z);box(d,1.2,.02,.65,mat.dark,.8,y+1.1,z);box(d,.06,.5,.06,mat.steel,1.5,y+1.4,z);}
  anchor(0,ks,'dish_sink',.8,y+1.1,-4.65,1.7,.5,2.9);
  cyl(d,.2,.65,mat.red,6.78,y+2,-4.6);anchor(0,ks,'extinguisher',6.78,y+2,-4.6);
  cyl(d,.45,.07,mat.steel,.2,y+1.9,-2.55);anchor(0,ks,'order_wheel',.2,y+1.9,-2.55);
  prop(d,0,ks,'kitchen_radio',.65,.4,.3,mat.trim,-.8,y+1.3,-2.55);
  prop(d,0,ks,'dolores_apron',.6,.9,.04,mat.paper,4.65,y+1.6,-7.8);
  // A single steep flight reaches the upstairs opening, with continuous timber stringers.
  for(let i=0;i<20;i++){const h=(B.upper-y)*(i+1)/20,z=-7.75+i*.5;box(d,1.65,.15,.51,mat.wood,5.6,y+h-.075,z);if(i%2===0)box(d,.07,.9,.07,mat.trim,4.8,y+h+.45,z);}
  pick(0,ks,null,[5.6,2.5,-5.3],[1.9,4.5,6.5],us);pick(1,us,null,[5.6,uy+.05,-.3],[1.8,.3,3.5],ks);
  // Dolores's home: small living area, photo wall and a modest separate sleeping area.
  cyl(u,1.25,.14,mat.paper,-2,uy+1,5.5);cyl(u,.14,.95,mat.trim,-2,uy+.48,5.5);anchor(1,us,'tablecloth',-2,uy+1,5.5,2.5,.3,2.5);
  box(u,1.15,.2,1.2,mat.wood,-3.8,uy+.55,9.4);box(u,1.15,1,.15,mat.wood,-3.8,uy+1,8.9);
  for(const x of [-4.3,-3.3]){box(u,.09,.12,1.7,mat.trim,x,uy+.12,9.4);box(u,.09,.5,.09,mat.trim,x,uy+.35,9.4);box(u,.12,.12,1.1,mat.wood,x,uy+.94,9.4);}
  anchor(1,us,'rocking_chair',-3.8,uy+.85,9.4,1.3,1.5,1.7);
  prop(u,1,us,'dresser',1.9,1.5,.8,mat.trim,-3.8,uy+.75,-1.5);
  for(let i=0;i<5;i++){box(u,1.75,.025,.03,mat.brass,-3.8,uy+.2+i*.27,-1.07);cyl(u,.05,.08,mat.brass,-3.8,uy+.3+i*.27,-1.01,Math.PI/2);}
  prop(u,1,us,'recipe_book',.6,.09,.45,mat.paper,-4.1,uy+1.55,-1.45);prop(u,1,us,'letters',.4,.06,.3,mat.paper,-3.35,uy+1.54,-1.45);
  for(let i=0;i<7;i++){box(u,.65,.8,.08,mat.trim,-6+i*.85,uy+4.75+i%2*.25,10.76);box(u,.51,.65,.02,i===3?mat.steel:mat.paper,-6+i*.85,uy+4.75+i%2*.25,10.70);}
  anchor(1,us,'photo_wall',-3.4,uy+4.9,10.7,6,1.2,.4);
  cyl(u,.13,.5,mat.cream,-5.9,uy+1.7,0);prop(u,1,us,'saint_statue',.55,.1,.5,mat.wood,-5.9,uy+1.4,0);
  prop(u,1,us,'calendar',.45,.65,.04,mat.paper,2.6,uy+1.6,-2.01);
  prop(u,1,us,'bed',2.7,.5,3.8,mat.cream,4.3,uy+.75,7.7);box(u,2.7,.12,2.1,mat.green,4.3,uy+1.06,6.8);box(u,1.2,.18,.6,mat.paper,4.3,uy+1.12,9.1);
  for(const z of [5.65,9.7])for(let x=2.9;x<5.8;x+=.48){cyl(u,.035,1.35,mat.cream,x,uy+.7,z);}for(const z of [5.65,9.7])box(u,2.8,.06,.07,mat.cream,4.3,uy+1.4,z);
  box(u,.8,.75,.8,mat.trim,6.05,uy+.375,8.8);cyl(u,.06,.45,mat.brass,6.05,uy+1,8.8);add(u,new THREE.ConeGeometry(.4,.45,12,1,true),mat.paper,6.05,uy+1.4,8.8);anchor(1,us,'bedside_lamp',6.05,uy+1.25,8.8);
  prop(u,1,us,'wardrobe',1.9,2.6,.85,mat.trim,3.2,uy+1.3,2.55);box(u,.03,2.35,.04,mat.brass,3.2,uy+1.3,3);
  cyl(u,.4,.4,mat.wood,-5.4,uy+.2,9.4);anchor(1,us,'sewing_basket',-5.4,uy+.2,9.4);
  // Floor hits are behind props; the nearest visible item/door wins naturally.
  pick(0,ds,null,[0,y-.03,4.4],[13.6,.05,13]);pick(0,ks,null,[0,y-.03,-6.6],[13.6,.05,8.4]);pick(1,us,null,[-1.15,uy-.04,4.4],[11.7,.05,13.1]);pick(1,us,null,[5.85,uy-.04,6.35],[2.2,.05,9.2]);
  for(const [g,batch]of batches)for(const [material,geos]of batch){const geometry=mergeGeometries(geos);if(!geometry)throw Error('Interior mesh merge failed');for(const geo of geos)geo.dispose();const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;g.add(mesh);}
  // Reject broken source anchors during development/export tests.
  const ids=new Set(buildingScenes.flatMap(s=>s.references.items.map(i=>i.id)));
  for(const hit of hits)if(hit.userData.itemId&&!ids.has(hit.userData.itemId))throw Error(`Unknown room item ${hit.userData.itemId}`);
  return {root,hits,setFloor(floor:0|1){floors.forEach((g,i)=>g.visible=i===floor);}, dispose(){const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if((o as THREE.Mesh).geometry)geometries.add((o as THREE.Mesh).geometry);});geometries.forEach(g=>g.dispose());pickMaterial.dispose();root.removeFromParent();}};
}
export type BluebirdInterior=ReturnType<typeof createBluebirdInterior>;
