import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sheriffScenes } from './buildingInteriors';
import { sheriffWalls } from './sheriffShell';
import type { createInteriorLighting } from './interiorLighting';

/** Authored 1985 small-town station; furniture positions are visual staging. */
export function createSheriffInterior(light:ReturnType<typeof createInteriorLighting>){
  const root=new THREE.Group();root.name='sheriff-authored-interior';
  const floor=new THREE.Group();root.add(floor);
  // High outer walls go into one group per outward normal (userData.cutawayNormal: hidden when facing the camera); full-height partitions share one group tagged cutawayPartition (hidden whenever the cutaway is on).
  const sides=new Map<string,THREE.Group>();
  const side=(normal:number[])=>{const key=normal.join(',');if(!sides.has(key)){const g=new THREE.Group();g.name=`sheriff-wall-${key}`;g.userData.cutawayNormal=[...normal];floor.add(g);sides.set(key,g);}return sides.get(key)!;};
  const partitions=new THREE.Group();partitions.name='sheriff-partitions';partitions.userData.cutawayPartition=true;floor.add(partitions);
  const hits:THREE.Mesh[]=[],lamps:THREE.PointLight[]=[];
  const pickMaterial=new THREE.MeshBasicMaterial({visible:false});
  const m={plaster:light.material(0xc6c3ad),
    green:light.material(0x788779),wood:light.material(0xa58865,'bareWood'),trim:light.material(0x60503f,'bareWood'),
    metal:light.material(0x677775,undefined,true),dark:light.material(0x303c3b),paper:light.material(0xe5d9b9),
    brass:light.material(0xb6a065,undefined,true),cloth:light.material(0x727d5c),tile:light.material(0xa9ac9c),
    porcelain:light.material(0xd2d4c7),cork:light.material(0x96734e),red:light.material(0x984c3e),shade:light.lampMaterial()};
  const batches=new Map<THREE.Group,Map<THREE.Material,THREE.BufferGeometry[]>>();
  function add(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0,g=floor){
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));
    if(!batches.has(g))batches.set(g,new Map());const b=batches.get(g)!;if(!b.has(mat))b.set(mat,[]);
    b.get(mat)!.push(geo.index?geo.toNonIndexed():geo);if(geo.index)geo.dispose();
  }
  const box=(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,ry=0,g=floor)=>add(new THREE.BoxGeometry(w,h,d),mat,x,y,z,0,ry,0,g);
  const cyl=(r:number,h:number,mat:THREE.Material,x:number,y:number,z:number,rx=0)=>add(new THREE.CylinderGeometry(r,r,h,12),mat,x,y,z,rx);
  function pick(scene:string,item:string|null,x:number,y:number,z:number,w:number,h:number,d:number,targetId?:string){
    const hit=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),pickMaterial);hit.position.set(x,y,z);
    hit.userData={sceneId:scene,itemId:item?`item.${scene.slice(4)}.${item}`:null,floor:0,targetId};floor.add(hit);hits.push(hit);
  }
  const F='SCN_sheriff_front',O='SCN_sheriff_office',C='SCN_sheriff_cell';
  // Floors, paint skirting and true window holes; only the tagged high walls and partitions are ever cut away.
  box(14.8,.22,11.8,m.tile,0,.29,0);
  for(let x=-6.6;x<7;x+=1.1)for(let z=-4.95;z<5;z+=1.1){
    if(z<.9 && x<0)continue;
    box(1.08,.012,1.08,(Math.round((x+7+z+5.5)/1.1)%2)?m.tile:m.plaster,x,.408,z);
  }
  box(7.1,.035,6.5,m.wood,-3.75,.423,-2.55);
  for(let x=-7;x<-.4;x+=.55)box(.016,.012,6.45,m.trim,x,.448,-2.55);
  for(const p of sheriffWalls()){
    const lo=p.at[1]-p.size[1]/2,hi=p.at[1]+p.size[1]/2,split=1.65;
    if(lo<split)box(p.size[0],Math.min(hi,split)-lo,p.size[2],m.green,p.at[0],(lo+Math.min(hi,split))/2,p.at[2]);
    if(hi>split)box(p.size[0],hi-Math.max(lo,split),p.size[2],m.plaster,p.at[0],(hi+Math.max(lo,split))/2,p.at[2],0,side(p.normal));
  }
  for(const x of [-7.3,7.3])box(.12,.17,11.7,m.trim,x,.52,0);
  // Rear office to the left, corridor and cell to the right. Doorways stay clear.
  function partition(x:number,w:number){box(w,1.2,.22,m.green,x,1,.9);box(w,.08,.27,m.trim,x,1.64,.9);box(w,4.7,.22,m.plaster,x,4,.9,0,partitions);}
  partition(-6,2.7);partition(-1.6,2.95);partition(6.25,2.2);
  box(.24,1.2,6.8,m.green,0,1,-2.55);box(.24,4.7,6.8,m.plaster,0,4,-2.55,0,partitions);
  // Open office door, swung inward; lintel does not block the walk-through.
  box(1.6,3.25,.14,m.trim,-4.1,2.025,.25,.8);box(1.15,1.3,.04,m.green,-4.06,2.35,.31,.8);
  pick(F,null,-3.75,1.8,.9,1.65,2.7,.4,O);pick(O,null,-3.75,1.8,1.16,1.65,2.7,.25,F);
  pick(F,null,1.3,1.7,.9,1.8,2.6,.35,C);pick(C,null,1.3,1.7,1.17,1.8,2.6,.2,F);
  function desk(scene:string,id:string,x:number,z:number){
    box(3.2,.18,1.55,m.wood,x,1.95,z);
    for(const dx of [-1.14,1.14]){box(.78,1.42,1.2,m.trim,x+dx,1.12,z);for(let i=0;i<3;i++){box(.72,.39,.07,m.wood,x+dx,.67+i*.43,z+.63);box(.24,.045,.065,m.brass,x+dx,.76+i*.43,z+.68);}}
    pick(scene,id,x,1.25,z,3.3,1.65,1.6);
  }
  function chair(x:number,z:number,upholstery=m.green){
    box(.95,.16,.9,upholstery,x,1.07,z);box(.95,.85,.15,upholstery,x,1.55,z-.4);
    for(const dx of [-.36,.36])for(const dz of [-.32,.32])box(.09,.65,.09,m.metal,x+dx,.73,z+dz);
  }
  function paper(scene:string,id:string,x:number,z:number,y=2.07,stack=.035){
    box(.72,stack,.52,m.paper,x,y,z,.08);for(let i=0;i<4;i++)box(.45,.008,.013,m.trim,x,y+stack/2+.008,z-.16+i*.09,.08);
    pick(scene,id,x,y+.04,z,.75,.14,.55);
  }
  function phone(scene:string,x:number,z:number){
    box(.61,.16,.46,m.dark,x,2.1,z);cyl(.16,.018,m.brass,x,2.193,z+.02);
    for(let i=0;i<10;i++){const a=i*Math.PI/5;cyl(.025,.02,m.dark,x+Math.sin(a)*.115,2.21,z+.02+Math.cos(a)*.115);}
    box(.72,.1,.14,m.dark,x,2.31,z-.15);for(const dx of [-.26,.26])box(.18,.17,.23,m.dark,x+dx,2.27,z-.15);
    pick(scene,'telephone',x,2.2,z,.76,.38,.52);
  }
  function cabinet(scene:string,id:string,x:number,z:number,w=1.25,h=2.65){
    box(w,h,.7,m.metal,x,.4+h/2,z);for(let i=0;i<4;i++){const y=.42+(i+.5)*h/4;box(w-.09,h/4-.055,.055,m.green,x,y,z+.375);box(w*.35,.12,.02,m.paper,x,y+.13,z+.414);box(w*.25,.05,.07,m.dark,x,y-.07,z+.43);}
    pick(scene,id,x,.4+h/2,z,w+.08,h,.85);
  }
  function board(scene:string,id:string,x:number,y:number,z:number,w:number,h:number){
    box(w+.16,h+.16,.12,m.trim,x,y,z);box(w,h,.025,m.cork,x,y,z-.08);
    for(let i=0;i<7;i++){const px=x+(i%4-1.5)*w*.22,py=y+(i<4?.18:-.26)*h;box(w*.18,h*.35,.016,i===2?m.red:m.paper,px,py,z-.104);box(w*.11,.025,.008,m.trim,px,py+.07,z-.12);cyl(.027,.018,m.brass,px,py+h*.14,z-.13,Math.PI/2);}
    pick(scene,id,x,y,z,w+.16,h+.16,.3);
  }
  // Cole's disciplined public desk and radio dispatch station.
  desk(F,'cole_desk',-3,3);chair(-3,1.65);
  box(.85,.18,.65,m.dark,-3.15,2.13,3);box(.85,.32,.28,m.metal,-3.15,2.33,2.75);
  add(new THREE.CylinderGeometry(.08,.08,.95,12),m.dark,-3.15,2.43,2.77,0,0,Math.PI/2); // Roller below the standing report form.
  box(.65,.47,.025,m.paper,-3.15,2.58,2.82);
  for(let row=0;row<3;row++)for(let col=0;col<8;col++)cyl(.026,.025,m.paper,-3.46+col*.087,2.235,2.94+row*.09);
  pick(F,'typewriter',-3.15,2.4,2.95,1,.85,.8);phone(F,-1.9,3.25);
  box(2.8,1.25,.7,m.trim,-6.5,1.025,1.8,Math.PI/2);
  box(.65,.7,1.2,m.metal,-6.5,2.02,1.8);for(let i=0;i<6;i++)box(.02,.035,.58,m.dark,-6.15,1.83+i*.075,1.62);
  cyl(.05,.15,m.brass,-6.12,1.98,2.17,Math.PI/2);box(.025,1.1,.025,m.dark,-6.5,2.9,1.5);
  pick(F,'dispatch_radio',-6.45,2.25,1.8,.95,1.2,1.3);paper(F,'duty_log',-6.35,3,1.68);
  box(1.1,1.1,.9,m.trim,5.95,.95,2.1);cyl(.28,.5,m.metal,5.95,1.78,2.1);cyl(.3,.05,m.dark,5.95,2.05,2.1);
  box(.1,.3,.18,m.dark,6.27,1.8,2.1);pick(F,'coffee_pot',5.95,1.8,2.1,.9,.7,.8);
  cabinet(F,'incident_files',-6.3,4.95,1.3,2.65);
  // Street wall noticeboard and worn visitor bench, kept inside the glazing.
  board(F,'bulletin_board',3.6,3.55,5.62,2.3,1.35);
  box(3.3,.16,.72,m.wood,3.7,1.03,5.12);box(3.3,.73,.12,m.wood,3.7,1.52,5.43);
  for(const dx of [-1.3,1.3])box(.18,.62,.5,m.trim,3.7+dx,.71,5.12);
  pick(F,'visitor_bench',3.7,1.15,5.15,3.5,1.6,.9);
  box(.5,1.2,.15,m.cloth,6.55,2.6,5.55);for(const dx of [-.33,.33])box(.23,.75,.15,m.cloth,6.55+dx,2.82,5.55);
  pick(F,'spare_uniform',6.55,2.7,5.55,1,1.45,.35);
  cyl(.43,.09,m.trim,1.6,3.9,5.64,Math.PI/2);cyl(.37,.1,m.paper,1.6,3.9,5.57,Math.PI/2);
  box(.025,.26,.04,m.dark,1.6,4.01,5.49);box(.22,.025,.04,m.dark,1.49,3.9,5.49);pick(F,'wall_clock',1.6,3.9,5.6,.9,.9,.3);
  // Map over an open-frame locked gun cabinet; no opaque glass hides its contents.
  box(.11,1.55,2.1,m.trim,7.22,3.45,3.4);box(.025,1.37,1.9,m.paper,7.14,3.45,3.4);
  for(let i=0;i<5;i++)box(.014,.025,1.5,m.green,7.11,3+i*.22,3.4);
  box(.012,1.17,.045,m.red,7.1,3.45,3.22);pick(F,'town_map',7.15,3.45,3.4,.32,1.6,2.15);
  box(.75,1.8,1.9,m.trim,6.85,1.3,3.6);box(.06,1.6,1.65,m.dark,6.43,1.33,3.6);
  for(const z of [2.68,4.52])box(.12,1.8,.1,m.brass,6.32,1.3,z);
  box(.13,.09,1.85,m.brass,6.32,2.18,3.6);pick(F,'gun_cabinet',6.8,1.3,3.6,1,1.9,2);
  box(.09,1.1,.08,m.metal,6.28,1.48,3.62);box(.12,.45,.21,m.wood,6.28,.8,3.62);
  pick(F,'shotgun',6.25,1.3,3.62,.2,1.65,.27);
  box(.12,.95,.65,m.wood,7.16,2.4,1.35);for(let i=0;i<4;i++){cyl(.05,.025,m.brass,7.06,2.57-i*.17,1.28,Math.PI/2);box(.055,.15,.045,m.brass,7.02,2.49-i*.17,1.28);}
  pick(F,'key_board',7.13,2.4,1.35,.35,1,.75);
  // Ray's office: sun-striped wood floor, personal fishing objects and old records.
  desk(O,'ray_desk',-3.7,-2.5);chair(-3.7,-3.85,m.trim);pick(O,'desk_chair',-3.7,1.35,-3.85,1.05,1.8,1.1);
  paper(O,'crossword',-3.95,-2.3);for(let i=0;i<5;i++)for(let j=0;j<5;j++)if((i*3+j)%4===0)box(.065,.009,.065,m.dark,-4.2+i*.1,2.102,-2.5+j*.1);
  paper(O,'patrol_logs',-2.5,-2.25,2.13,.16);phone(O,-4.75,-2.55);
  cyl(.16,.28,m.paper,-3,2.18,-2.65);cyl(.125,.012,m.trim,-3,2.325,-2.65);pick(O,'coffee_mug',-3,2.2,-2.65,.4,.4,.4);
  cyl(.2,.065,m.metal,-3.4,2.09,-2.9);box(.18,.035,.035,m.paper,-3.42,2.14,-2.89);pick(O,'ashtray',-3.4,2.12,-2.9,.45,.15,.45);
  cabinet(O,'old_case_cabinet',-5.5,-5.42,1.65,2.85);cabinet(O,'evidence_locker',-1,-.1,1.05,3.1);
  // Blinds on the side window, with a sill-mounted trophy.
  for(let i=0;i<12;i++)box(.16,.12,3.45,m.paper,-7.32,2+i*.215,-3.2);
  box(.5,.12,3.6,m.wood,-7.13,1.8,-3.2);pick(O,'blinds',-7.3,3.2,-3.2,.4,2.7,3.55);
  box(.5,.09,.45,m.trim,-6.95,1.91,-3.7);cyl(.045,.35,m.brass,-6.95,2.12,-3.7);
  add(new THREE.ConeGeometry(.25,.34,12),m.brass,-6.95,2.43,-3.7,Math.PI);pick(O,'fishing_trophy',-6.95,2.22,-3.7,.65,.9,.6);
  box(.045,3.5,.045,m.trim,-6.88,2.18,-5.15,-.1);cyl(.14,.09,m.metal,-6.85,.95,-5.11,Math.PI/2);pick(O,'fishing_rod',-6.86,2.2,-5.13,.3,3.7,.3);
  box(1.25,.95,.1,m.trim,-3.2,3.15,-5.77);box(1.08,.78,.025,m.paper,-3.2,3.15,-5.7);
  for(let i=0;i<4;i++){cyl(.08,.1,m.wood,-3.57+i*.24,3.29,-5.66,Math.PI/2);box(.15,.3,.025,m.metal,-3.57+i*.24,3.08,-5.65);}pick(O,'wall_photo',-3.2,3.15,-5.7,1.35,1.05,.3);
  // Cell: corridor outside an actual barred gate, bunk, plumbing and stored parade boxes.
  for(let x=2.6;x<7.3;x+=.3)cyl(.038,3.35,m.metal,x,2.08,-.35);
  for(const y of [.5,1.8,3.7])box(4.9,.08,.09,m.metal,4.9,y,-.35);
  for(const z of [-.3,-1.1,-1.9,-2.7,-3.5,-4.3,-5.1,-5.7])cyl(.035,3.35,m.metal,2.6,2.08,z);
  for(const y of [.5,3.7])box(.09,.09,5.45,m.metal,2.6,y,-3);
  box(.2,.28,.12,m.brass,2.79,1.95,-.26);pick(C,'cell_bars',4.9,2,-.35,4.95,3.5,.16);
  box(1.6,.18,3,m.metal,6.13,1.07,-3.4);box(1.53,.22,2.92,m.paper,6.13,1.27,-3.4);
  for(const x of [5.45,6.82])for(const z of [-4.72,-2.08])box(.08,.75,.08,m.metal,x,.8,z);
  pick(C,'bunk',6.13,1.06,-3.4,1.7,1.1,3.1);box(1.48,.19,1.25,m.cloth,6.13,1.47,-4.1);pick(C,'wool_blanket',6.13,1.49,-4.1,1.5,.22,1.3);
  cyl(.24,.65,m.porcelain,3.55,.76,-5.04);add(new THREE.SphereGeometry(.4,12,8),m.porcelain,3.55,1.05,-5.02);
  cyl(.25,.04,m.dark,3.55,1.39,-5.02);box(.65,.78,.3,m.porcelain,3.55,1.35,-5.55);pick(C,'toilet',3.55,1.15,-5.13,.9,1.5,1.2);
  box(.85,.22,.66,m.porcelain,4.72,1.72,-5.42);box(.59,.03,.44,m.metal,4.72,1.84,-5.37);box(.05,.25,.05,m.metal,4.72,1.99,-5.61);pick(C,'sink',4.72,1.8,-5.42,.9,.65,.8);
  for(let i=0;i<8;i++)box(.025,.22+(i%3)*.06,.025,m.trim,5.75+i*.12,2.1,-5.78);pick(C,'wall_scratches',6.16,2.2,-5.78,1.2,.55,.2);
  for(let x=3.2;x<5.3;x+=.32)cyl(.035,1.4,m.metal,x,5.1,-5.99);box(2.2,.1,.4,m.plaster,4.15,4.38,-5.92);
  pick(C,'barred_window',4.15,5.1,-5.99,2.3,1.55,.4);
  for(const [x,z,w,h] of [[3.5,-1.3,1,.7],[4.45,-1.25,.7,.9],[3.55,-2.2,.8,.6]]){
    box(w,h,.72,m.cork,x,.4+h/2,z);box(w,.04,.74,m.paper,x,.4+h+.02,z);box(.04,h,.015,m.trim,x,.4+h/2,z+.37);
  }pick(C,'storage_boxes',3.9,1,-1.65,2.1,1.25,1.8);
  function lamp(x:number,y:number,z:number,intensity:number,color:number){
    const source=new THREE.PointLight(color,0,12,2);source.position.set(x,y,z);source.castShadow=true;
    source.shadow.mapSize.set(256,256);source.shadow.camera.near=.08;source.shadow.normalBias=.025;
    source.shadow.bias=-.00015;source.shadow.autoUpdate=false;source.shadow.needsUpdate=true;
    floor.add(source);lamps.push(source);light.registerLamp(source,intensity);
  }
  for(const [x,z] of [[-2.8,3.1],[-3.7,-2.6]]){
    box(.04,2.6,.04,m.dark,x,6.05,z);add(new THREE.ConeGeometry(.65,.35,16,1,true),m.green,x,4.65,z);
    cyl(.45,.06,m.shade,x,4.49,z);lamp(x,4.3,z,105,0xffd8a2);
  }
  cyl(.33,.18,m.shade,4.3,4.05,-3.4);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;box(.025,.4,.025,m.metal,4.3+Math.cos(a)*.35,4.08,-3.4+Math.sin(a)*.35);}
  box(.025,1.5,.025,m.dark,4.6,3.38,-3.4);pick(C,'caged_light',4.3,4.08,-3.4,.8,.55,.8);lamp(4.3,3.83,-3.4,65,0xdee8d1);
  pick(F,null,0,.37,3.4,14.6,.035,4.7);pick(O,null,-3.75,.4,-2.5,7.15,.035,6.5);pick(C,null,3.75,.37,-2.5,7.15,.035,6.5);
  for(const [g,batch] of batches)for(const [material,geos] of batch){
    const geometry=mergeGeometries(geos);geos.forEach(geo=>geo.dispose());if(!geometry)throw Error('Sheriff mesh merge failed');
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=material!==m.shade;mesh.receiveShadow=true;g.add(mesh);
  }
  const expected=new Set(sheriffScenes.flatMap(s=>s.references.items.map(i=>i.id)));
  const actual=new Set(hits.map(h=>h.userData.itemId).filter(Boolean));
  if(expected.size!==actual.size || [...actual].some(id=>!expected.has(id)))throw Error('Sheriff item anchors differ from module');
  return {root,hits,lamps,needsShadowUpdate(){return root.visible&&lamps.some(l=>l.shadow.needsUpdate);},
    setFloor(_floor:0|1){floor.visible=true;lamps.forEach(l=>l.shadow.needsUpdate=true);},
    dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});pickMaterial.dispose();lamps.forEach(l=>l.dispose());root.removeFromParent();}};
}
