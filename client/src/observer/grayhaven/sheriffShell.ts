import * as THREE from 'three';
import type { WallPiece } from './bluebirdShell';
import { SHERIFF as S } from './buildingInteriors';

/** Door and window openings in local coordinates; +Z faces Main Street. */
export function sheriffWalls(): WallPiece[] {
  const parts:WallPiece[]=[];
  const wall=(axis:'x'|'z',at:number,from:number,to:number,gaps:number[][])=>{
    const add=(a:number,b:number,lo:number,hi:number)=>{
      if(b<=a || hi<=lo)return;
      parts.push({floor:0,size:axis==='z'?[b-a,hi-lo,.28]:[.28,hi-lo,b-a],
        at:axis==='z'?[(a+b)/2,(lo+hi)/2,at]:[at,(lo+hi)/2,(a+b)/2],normal:axis==='z'?[0,0,Math.sign(at)]:[Math.sign(at),0,0]});
    };
    let start=from;
    for(const [a,b,lo,hi] of gaps){add(start,a,S.ground,S.top);add(a,b,S.ground,lo);add(a,b,hi,S.top);start=b;}
    add(start,to,S.ground,S.top);
  };
  wall('z',6,-7.5,7.5,[[-6.08,-2.92,1.85,4.25],[-.98,.98,.4,4.45],[2.92,6.08,1.85,4.25]]);
  wall('z',-6,-7.5,7.5,[[-4.95,-1.65,2.07,3.93],[3.1,5.2,4.4,5.8]]);
  wall('x',-7.5,-6,6,[[-4.9,-1.5,1.85,4.55]]);
  wall('x',7.5,-6,6,[]);
  return parts;
}
export function createSheriffShadowShell(){
  const root=new THREE.Group();root.name='sheriff-physical-shadow-shell';
  const material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide});
  for(const p of [...sheriffWalls(),{size:[15.7,.5,12.7],at:[0,7.85,0]}]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...p.size as [number,number,number]),material);
    mesh.position.fromArray(p.at);mesh.castShadow=true;root.add(mesh);
  }
  return root;
}
