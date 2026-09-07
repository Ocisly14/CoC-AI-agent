import * as THREE from 'three';
import notes from './buildingScenes.generated.json';
import sheriffNotes from './sheriffScenes.generated.json';

export const buildingScenes = notes;
export const sheriffScenes = sheriffNotes;
export const allInteriorScenes = [...notes, ...sheriffNotes];
export type BuildingId = 'bluebird' | 'sheriff';
export const SHERIFF = { width: 15, depth: 12, ground: .4, top: 7.6 };
export const buildingForRoom = (id: string | null): BuildingId | null =>
  notes.some(s=>s.id===id)?'bluebird':sheriffNotes.some(s=>s.id===id)?'sheriff':null;
export const interiorBuilding = (state: InteriorState): BuildingId => state.building ?? buildingForRoom(state.room) ?? 'bluebird';
export function interiorFrame(state: InteriorState, room: string | null = state.room) {
  if(interiorBuilding(state)==='sheriff') {
    const center=room?roomCenter(room):new THREE.Vector3(0,3.5,0);
    return {center,halfWidth:room && room!=='SCN_sheriff_front'?3.8:7.7,halfDepth:room?3.6:6.3,halfHeight:3.3};
  }
  return {center:room?roomCenter(room):new THREE.Vector3(0,state.floor?9.2:3.3,state.floor?4.4:0),
    halfWidth:7.4,halfDepth:room?(room==='SCN_bluebird_kitchen'?4.8:7):state.floor?7:11.5,halfHeight:3.1};
}
export type InteriorState = { status: 'closed' | 'loading' | 'open' | 'error'; building?: BuildingId; floor: 0 | 1; room: string | null; item: string | null };
export const CLOSED_INTERIOR: InteriorState = { status: 'closed', floor: 0, room: null, item: null };
export const BLUEBIRD = { width: 14, depth: 22, ground: .4, upper: 6.182, top: 12.2, divider: -2.2 };
export const isBluebird = (id: string | null) => buildingScenes.some(scene => scene.id === id);
export const cleanSceneText = (text: string) => text.replace(/\s*\[[^\]]+\]/g, '');
export const roomFloor = (id: string): 0 | 1 => id === 'SCN_bluebird_upstairs' ? 1 : 0;
export const roomCenter = (id: string) => id==='SCN_sheriff_front'?new THREE.Vector3(0,3.5,3.1)
  :id==='SCN_sheriff_office'?new THREE.Vector3(-3.75,3.5,-2.5)
  :id==='SCN_sheriff_cell'?new THREE.Vector3(3.75,3.5,-2.5)
  :new THREE.Vector3(0, roomFloor(id) ? 9.2 : 3.3, id === 'SCN_bluebird_kitchen' ? -6.5 : 4.2);

/** Screen footprint, not absolute zoom: this remains usable on portrait screens. */
export function projectedBuilding(camera: THREE.OrthographicCamera, transform: THREE.Matrix4, width = 14, depth = 22) {
  const points = [-1,1].flatMap(x => [-1,1].map(z => new THREE.Vector3(x*width/2, .4, z*depth/2).applyMatrix4(transform).project(camera)));
  const minX=Math.min(...points.map(p=>p.x)), maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)), maxY=Math.max(...points.map(p=>p.y));
  return { size: Math.min(maxX-minX,maxY-minY)/2, inView: minX<.85 && maxX>-.85 && minY<.8 && maxY>-.8 };
}
export function cutawayDecision(size: number, inView: boolean, open: boolean) {
  if (!inView || size < .16 && open) return 'close';
  if (size >= .22) return 'open';
  if (size >= .12) return 'prefetch';
  return 'idle';
}

/** Shared local-space volume predicate for fog and its CPU regression probes. */
export function insideBluebird(p: THREE.Vector3) {
  return Math.abs(p.x)<=7.2 && p.y>=.15 && p.z>=-11.2 && p.z<=11.2
    && (p.y<=6.25 || p.y<=12.3 && p.z>=-2.4);
}
export const INTERIOR_VOLUME_GLSL = `
  uniform float uInteriorActive;
  uniform mat4 uInteriorInverse;
  uniform float uInteriorSheriff;
  bool inInterior(vec3 world) {
    vec3 p=(uInteriorInverse*vec4(world,1.0)).xyz;
    if(uInteriorSheriff>.5) return uInteriorActive>.5 && abs(p.x)<=7.7 && abs(p.z)<=6.2 && p.y>=.15 && p.y<=7.7;
    return uInteriorActive>.5 && abs(p.x)<=7.2 && p.y>=.15 && p.z>=-11.2 && p.z<=11.2
      && (p.y<=6.25 || (p.y<=12.3 && p.z>=-2.4));
  }
`;
