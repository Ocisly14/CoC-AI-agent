import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { GrayhavenWorld } from './GrayhavenWorld';
import { CLOSED_INTERIOR, interiorRevealTarget, roomCenter } from './buildingInteriors';
import { projectedRevealEllipse } from './depthReveal';

// Exercise the real controller methods without a browser or a WebGL renderer.
function controller() {
  const world=Object.create(GrayhavenWorld.prototype) as any;
  let resolve!:()=>void,reject!:(error:Error)=>void;
  const pending=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
  const model={root:new THREE.Group(),setFloor:vi.fn()};model.root.visible=false;
  Object.assign(world,{interiorState:{...CLOSED_INTERIOR},interiorRequest:0,disposed:false,
    options:{onInterior:vi.fn()},host:{dataset:{}},controls:{target:new THREE.Vector3(20,8,9)},camera:{zoom:3.2},
    dinerExterior:new THREE.Group(),dinerModel:model,dinerInverse:new THREE.Matrix4(),seaMist:{setInterior:vi.fn()},
    streetView:null,loadInterior:vi.fn(()=>pending),fitInterior:vi.fn()});
  return {world,resolve,reject,model};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('cutaway navigation and lazy-load races',()=>{
  it('does not expose a closed, loading, failed or exterior-only building',()=>{
    const {world}=controller();
    for(const status of ['closed','loading','error']) {
      world.interiorState.status=status;world.selectedId='SCN_bluebird_dining';
      expect(world.revealTarget()).toBeNull();
      expect(interiorRevealTarget(world.camera,new THREE.Matrix4(),world.interiorState)).toBeNull();
    }
    world.interiorState.status='closed';world.selectedId='SCN_grocery';expect(world.revealTarget()).toBeNull();
    world.selectedId='SCN_redwood_ring';expect(world.revealTarget()?.strength).toBeGreaterThan(0);
  });
  it('does not reopen after returning to the street during loading',async()=>{
    const {world,resolve,model}=controller();world.openInterior('SCN_bluebird_dining');world.returnToStreet();resolve();await flush();
    expect(world.interiorState.status).toBe('closed');expect(model.root.visible).toBe(false);expect(world.dinerExterior.visible).toBe(true);
    expect(world.focusTarget.toArray()).toEqual([20,8,9]);expect(world.focusZoom).toBe(3.2);
  });
  it('honours a newer room/floor selection during the same load and saves street view only once',async()=>{
    const {world,resolve,model}=controller();world.openInterior('SCN_bluebird_dining');world.openInterior('SCN_bluebird_upstairs');
    resolve();await flush();expect(world.loadInterior).toHaveBeenCalledTimes(1);expect(world.interiorState.floor).toBe(1);
    expect(world.dinerExterior.visible).toBe(true);
    expect(model.setFloor).toHaveBeenLastCalledWith(1);expect(world.fitInterior).toHaveBeenLastCalledWith('SCN_bluebird_upstairs');
    world.controls.target.set(1,2,3);world.openInterior('SCN_bluebird_kitchen');expect(world.streetView.target.toArray()).toEqual([20,8,9]);
  });
  it('ignores completion after disposal and leaves a failed import retryable',async()=>{
    const a=controller();a.world.openInterior('SCN_bluebird_dining');a.world.disposed=true;a.resolve();await flush();expect(a.model.root.visible).toBe(false);
    const b=controller();const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    b.world.openInterior('SCN_bluebird_dining');b.reject(Error('network'));await flush();expect(b.world.interiorState.status).toBe('error');expect(b.world.dinerExterior.visible).toBe(true);
    b.world.loadInterior=vi.fn(()=>Promise.resolve());b.world.retryInterior();await flush();expect(b.world.interiorState.status).toBe('open');log.mockRestore();
  });
  it('floor switching clears stale room/item selection while notes closing preserves the shell',async()=>{
    const {world,resolve,model}=controller();world.openInterior('SCN_bluebird_dining');resolve();await flush();
    world.interiorState.item='item.bluebird_dining.booths';world.setInteriorFloor(1);
    expect(world.interiorState.room).toBeNull();expect(world.interiorState.item).toBeNull();expect(model.root.visible).toBe(true);
    world.ring={visible:false};world.labels=[];world.select(null,false);expect(world.interiorState.status).toBe('open');
  });
  it('fits a full-height room beside desktop notes and above mobile notes without rotating',()=>{
    for(const [width,height,panelTop,panelRight,toolbarBottom] of [[1440,900,175,350,230],[390,844,455,318,172]]) {
      const world=Object.create(GrayhavenWorld.prototype) as any;
      const camera=new THREE.OrthographicCamera(-262*width/height,262*width/height,262,-262,1,2200);
      camera.position.set(-398,351,487);camera.lookAt(0,0,0);camera.updateMatrixWorld();
      const before=camera.quaternion.clone(), exterior=new THREE.Group();exterior.rotation.y=1.4988;exterior.updateMatrixWorld();
      const panel={top:panelTop,right:panelRight},toolbar={bottom:toolbarBottom};
      Object.assign(world,{camera,controls:{minZoom:.72},canvasSize:{width,height},interiorState:{status:'open',floor:0,room:'SCN_bluebird_dining'},dinerExterior:exterior,
        host:{getBoundingClientRect:()=>({top:0,left:0,bottom:height}),parentElement:{querySelector:(s:string)=>({getBoundingClientRect:()=>s==='.gh-place'?panel:toolbar})}}});
      world.fitInterior('SCN_bluebird_dining');
      camera.position.add(world.focusTarget);camera.zoom=world.focusZoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();
      const reveal=interiorRevealTarget(camera,exterior.matrixWorld,world.interiorState)!;
      const actualRoom=roomCenter('SCN_bluebird_dining').applyMatrix4(exterior.matrixWorld);
      expect(reveal.center.distanceTo(actualRoom)).toBeLessThan(.0001);
      const ellipse=projectedRevealEllipse(camera,reveal),projectedRoom=actualRoom.project(camera);
      expect(ellipse.center.x).toBeCloseTo((projectedRoom.x+1)/2);
      expect(ellipse.center.y).toBeCloseTo((projectedRoom.y+1)/2);
      expect(reveal.strength).toBeGreaterThan(0);
      expect(world.revealTarget().strength).toBe(1);
      expect(camera.quaternion.equals(before)).toBe(true);
      for(const x of [-7.4,7.4])for(const y of [.2,6.4])for(const z of [-2.8,11.2]) {
        const p=new THREE.Vector3(x,y,z).applyMatrix4(exterior.matrixWorld).project(camera);
        const px=(p.x+1)*width/2,py=(1-p.y)*height/2;
        expect(px).toBeGreaterThan(width>650?panelRight+25:30);expect(px).toBeLessThan(width-80);
        expect(py).toBeGreaterThan(toolbarBottom+15);expect(py).toBeLessThan(width>650?height-120:panelTop-20);
      }
    }
  });

});
