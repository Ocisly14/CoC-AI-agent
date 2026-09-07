import * as THREE from 'three';
import { BLUEBIRD as B } from './buildingInteriors';

/** Exterior siding has no horizontal caps: the authored floor owns its surface.
 * Box caps at B.upper would otherwise z-fight with the upstairs wooden floor. */
export function exteriorWallGeometry(width:number,height:number,depth:number) {
  const geometry=new THREE.BoxGeometry(width,height,depth);
  const indices=Array.from(geometry.index!.array);
  geometry.setIndex(geometry.groups.filter(group=>group.materialIndex!==2 && group.materialIndex!==3)
    .flatMap(group=>indices.slice(group.start,group.start+group.count)));
  geometry.clearGroups();
  return geometry;
}
export type WallPiece = { size: [number,number,number]; at: [number,number,number]; normal: [number,number,number]; floor: 0|1 };
/** Actual window/door gaps shared by the view shell and the physical shadow shell. */
export function bluebirdWalls(): WallPiece[] {
  const parts: WallPiece[]=[];
  const add=(size: WallPiece['size'],at: WallPiece['at'],normal: WallPiece['normal'],floor: 0|1)=>parts.push({size,at,normal,floor});
  for (const floor of [0,1] as const) {
    const y=floor?B.upper:B.ground, end=floor?B.top:B.upper, back=floor?B.divider:-11, height=end-y;
    add([.32,height,11-back],[7,y+height/2,(11+back)/2],[1,0,0],floor);
    // Three side windows directly beside the dining booths; upstairs has its street windows.
    if(floor) add([.32,height,11-back],[-7,y+height/2,(11+back)/2],[-1,0,0],floor);
    else {
      let start=back;
      for(const z of [1,4.35,7.7]) {
        const a=z-1.2,b=z+1.2;
        add([.32,height,a-start],[-7,y+height/2,(a+start)/2],[-1,0,0],floor);
        add([.32,1.3,b-a],[-7,y+.65,z],[-1,0,0],floor);
        add([.32,height-3.8,b-a],[-7,y+(height+3.8)/2,z],[-1,0,0],floor);start=b;
      }
      add([.32,height,11-start],[-7,y+height/2,(11+start)/2],[-1,0,0],floor);
    }
    // Rear: two kitchen windows below (the module lists no back door), sash windows above.
    const rearGaps=floor?[[-4.6,-2,1.5,3.8],[2,4.4,1.5,3.8],[4.7,6.5,0,3.2]]:[[-4.6,-1.5,1.6,3.5],[2.9,4.8,1.6,3.5]];
    const frontGaps=floor?[[-5.9,-3.1,1.5,3.8],[-1.4,1.4,1.5,3.8],[3.1,5.9,1.5,3.8]]:[[-5.05,-3.05,0,4.1],[-.5,5.55,1.05,4.4]];
    for (const [z,gaps,normal] of [[11,frontGaps,[0,0,1]],[back,rearGaps,[0,0,-1]]] as const) {
      let start=-7;
      for (const [a,b,bottom,top] of gaps) {
        if(a>start) add([a-start,height,.32],[(a+start)/2,y+height/2,z],[...normal],floor);
        if(bottom>0) add([b-a,bottom,.32],[(a+b)/2,y+bottom/2,z],[...normal],floor);
        add([b-a,height-top,.32],[(a+b)/2,y+(height+top)/2,z],[...normal],floor); start=b;
      }
      add([7-start,height,.32],[(7+start)/2,y+height/2,z],[...normal],floor);
    }
  }
  return parts;
}
export function createBluebirdShadowShell() {
  const root=new THREE.Group(); root.name='bluebird-physical-shadow-shell';
  const mat=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide});
  const add=(size:number[],at:number[])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),mat);m.position.fromArray(at);m.castShadow=true;root.add(m);};
  for(const p of bluebirdWalls()) add(p.size,p.at);
  add([14.7,.35,9.2],[0,6.5,-6.6]);
  // Two roof slopes, matching the original gable, stay physically present when peeled.
  for(const side of [-1,1]) {const m=new THREE.Mesh(new THREE.BoxGeometry(7.65,.25,14.2),mat);m.position.set(side*3.7,13.1,4.4);m.rotation.z=-side*Math.atan2(1.8,7.4);m.castShadow=true;root.add(m);}
  // Upper floor with a real rear stair opening (x 4.7..6.5, z -2.2..1.7).
  add([11.7,.25,13.2],[-1.15,6.05,4.4]); add([2.3,.25,9.3],[5.85,6.05,6.35]);
  root.userData.pickable=false;
  return root;
}
