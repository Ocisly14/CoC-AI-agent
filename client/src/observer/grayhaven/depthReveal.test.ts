import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDepthReveal, depthRevealCoverage, revealDepthRange, ellipticalRevealCoverage, projectedRevealEllipse } from './depthReveal';
import { patchMaterial } from './lightingPatch';

function compile(material: THREE.Material, fragmentShader = THREE.ShaderLib.standard.fragmentShader) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader };
  material.onBeforeCompile(shader as never, {} as never);
  return { ...shader, uniforms: shader.uniforms as Record<string, { value: any }> };
}

describe('elliptical camera distance reveal', () => {
  it('removes near occluders only inside the ellipse, with monotonic feather coverage', () => {
    const center=new THREE.Vector2(.6,.4),radii=new THREE.Vector2(.25,.2),range=new THREE.Vector2(45,48);
    const coverage=(r:number,depth=10)=>ellipticalRevealCoverage(center.clone().add(new THREE.Vector2(r*radii.x,0)),center,radii,depth,range);
    expect(coverage(0)).toBe(0);expect(coverage(.7)).toBeCloseTo(0);expect(coverage(.85)).toBeCloseTo(.5);
    expect(coverage(1)).toBe(1);expect(coverage(2)).toBe(1);expect(coverage(0,48)).toBe(1);
    expect(coverage(0,46.5)).toBe(.5);
    expect(ellipticalRevealCoverage(center,center,radii,10,range,0)).toBe(1);
    let previous=0;for(let r=.7;r<=1;r+=.01){const value=coverage(r);expect(value).toBeGreaterThanOrEqual(previous);previous=value;}
  });
  it('maintains physical ellipse proportions on wide and portrait viewports and scales with zoom', () => {
    for(const [width,height] of [[1440,900],[621,678],[390,844]]) {
      const camera=new THREE.OrthographicCamera(-40*width/height,40*width/height,40,-40,1,1000);
      camera.position.z=700;camera.lookAt(0,0,0);camera.updateMatrixWorld();
      const target={center:new THREE.Vector3(8,5,0),radii:new THREE.Vector2(18,12),strength:1};
      const a=projectedRevealEllipse(camera,target);
      expect(a.radii.x*width/(a.radii.y*height)).toBeCloseTo(1.5);
      expect(a.center.x).toBeGreaterThan(.5);expect(a.center.y).toBeGreaterThan(.5);
      camera.zoom=2;camera.updateProjectionMatrix();const b=projectedRevealEllipse(camera,target);
      expect(b.radii.x).toBeCloseTo(a.radii.x*2);expect(b.radii.y).toBeCloseTo(a.radii.y*2);
    }
  });
  it('uses the effective field of view for perspective camera zoom',()=>{
    const camera=new THREE.PerspectiveCamera(60,1.6,1,1000);camera.position.z=100;camera.updateMatrixWorld();
    const target={center:new THREE.Vector3(),radii:new THREE.Vector2(12,8),strength:1};
    const a=projectedRevealEllipse(camera,target);camera.zoom=2;camera.updateProjectionMatrix();
    const b=projectedRevealEllipse(camera,target);expect(b.radii.x).toBeCloseTo(a.radii.x*2);
  });
  it('fades any near surface, transitions smoothly and preserves distant surfaces', () => {
    const range=new THREE.Vector2(45,48);
    expect(depthRevealCoverage(10,range)).toBe(0);
    expect(depthRevealCoverage(45,range)).toBe(0);
    expect(depthRevealCoverage(46.5,range)).toBe(.5);
    expect(depthRevealCoverage(48,range)).toBe(1);
    expect(depthRevealCoverage(100,range)).toBe(1);
  });
  it('keeps normal street-scale views solid and approaches the detail plane continuously', () => {
    for(const depth of [500,700,900]){
      const range=revealDepthRange(depth,524/2.35);
      expect(range.y).toBeLessThan(0);
      expect(depthRevealCoverage(1,range)).toBe(1);
    }
    expect(revealDepthRange(700,524/6).y).toBeGreaterThan(690);
    expect(revealDepthRange(700,180).y).toBeCloseTo(revealDepthRange(700,180.001).y,2);
  });
  it('shares a depth boundary within the lens and restores the overview', () => {
    const reveal = createDepthReveal(), scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-40,40,40,-40,1,1000);
    camera.position.set(0,0,700);camera.lookAt(0,0,0);camera.zoom=6;
    const material = new THREE.MeshStandardMaterial();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
    reveal.update(scene,camera,new THREE.Vector3());const shader=compile(material);
    expect(shader.uniforms.uRevealRange.value).toEqual(revealDepthRange(700,80/6));
    for (const x of [-100,0,100]) {
      const view=new THREE.Vector3(x,0,12).applyMatrix4(camera.matrixWorldInverse);
      expect(depthRevealCoverage(-view.z,shader.uniforms.uRevealRange.value)).toBeCloseTo(0);
    }
    expect(depthRevealCoverage(700,shader.uniforms.uRevealRange.value)).toBe(1);
    camera.zoom=1;camera.top=262;camera.bottom=-262;reveal.update(scene,camera,new THREE.Vector3());expect(depthRevealCoverage(100,shader.uniforms.uRevealRange.value)).toBe(1);
  });
  it('preserves the bottom layer even when every surface is inside the fade distance', () => {
    const reveal=createDepthReveal(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-40,40,40,-40,1,1000);
    camera.position.z=500;camera.zoom=5;camera.lookAt(0,0,0);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial());
    const tree=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(tree,ground);
    reveal.update(scene,camera,new THREE.Vector3());const uniforms=compile(tree.material).uniforms;
    const depths=new Map([[ground,480],[tree,470]]);let pixelDepth=1,pixel:THREE.Object3D|null=null,clear=1;
    const renderer={getCurrentViewport:(v:THREE.Vector4)=>v.set(20,30,1200,900),autoClear:true,shadowMap:{autoUpdate:false,needsUpdate:true},state:{buffers:{depth:{setClear:(value:number)=>{clear=value;}}}},render:()=>{
      if(renderer.autoClear){expect(renderer.shadowMap.needsUpdate).toBe(false);pixelDepth=clear*1000;pixel=null;}else{expect(renderer.shadowMap.needsUpdate).toBe(true);}
      for(const object of [tree,ground]) {
        const depth=depths.get(object)!;
        if(uniforms.uRevealEnabled.value && depthRevealCoverage(depth,uniforms.uRevealRange.value)===0)continue;
        if(object.material.depthFunc===THREE.GreaterEqualDepth?depth>=pixelDepth:depth<=pixelDepth){pixelDepth=depth;pixel=object;}
      }
    }};
    const background=new THREE.Color('blue');scene.background=background;
    reveal.render(renderer as never,scene,camera);
    expect(uniforms.uRevealViewport.value.toArray()).toEqual([20,30,1200,900]);
    expect(pixel).toBe(ground);expect(pixelDepth).toBe(480);
    expect(ground.material.depthFunc).toBe(THREE.LessEqualDepth);expect(tree.material.blending).toBe(THREE.NormalBlending);
    expect(tree.visible).toBe(true);expect(ground.visible).toBe(true);expect(scene.background).toBe(background);expect(renderer.autoClear).toBe(true);expect(clear).toBe(1);
    renderer.render=()=>{throw Error('draw failed');};
    expect(()=>reveal.render(renderer as never,scene,camera)).toThrow('draw failed');
    expect(ground.material.depthFunc).toBe(THREE.LessEqualDepth);expect(renderer.autoClear).toBe(true);expect(uniforms.uRevealEnabled.value).toBe(1);
  });
  it('protects room content and disables both rendering and picking for unavailable targets',()=>{
    const reveal=createDepthReveal(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-40,40,40,-40,1,1000);
    camera.position.z=700;camera.updateMatrixWorld();
    const wall=new THREE.MeshStandardMaterial(),floor=new THREE.MeshStandardMaterial();floor.userData.revealProtected=true;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(),wall),new THREE.Mesh(new THREE.PlaneGeometry(),floor));
    reveal.update(scene,camera,new THREE.Vector3());const shader=compile(wall);
    expect(floor.userData.shaderPatches).toBeUndefined();expect(reveal.contains(new THREE.Vector2(.5,.5))).toBe(true);
    expect(reveal.contains(new THREE.Vector2(1,1))).toBe(false);
    reveal.update(scene,camera,new THREE.Vector3(),null);expect(shader.uniforms.uRevealStrength.value).toBe(0);
    expect(reveal.contains(new THREE.Vector2(.5,.5))).toBe(false);
    let calls=0;reveal.render({getCurrentViewport:()=>{},render:()=>calls++} as never,scene,camera);expect(calls).toBe(1);
    const target={center:new THREE.Vector3(),radii:new THREE.Vector2(20,15),strength:1};
    reveal.update(scene,camera,target.center,target,.016);const first=shader.uniforms.uRevealStrength.value;
    expect(first).toBeGreaterThan(0);expect(first).toBeLessThan(.2);
    reveal.update(scene,camera,target.center,target,.016);expect(shader.uniforms.uRevealStrength.value).toBeGreaterThan(first);
  });
  it('automatically includes new rooms, instances and custom shaders without duplicate patches', () => {
    const reveal=createDepthReveal(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const source=new THREE.MeshStandardMaterial();patchMaterial(source,{key:'lighting',apply(shader){shader.uniforms.uPrior={value:7};}});
    const trees=new THREE.InstancedMesh(new THREE.BoxGeometry(),source,2);scene.add(trees);
    reveal.update(scene,camera,new THREE.Vector3());
    const room=new THREE.Group(),furniture=new THREE.Mesh(new THREE.BoxGeometry(),source),custom=new THREE.ShaderMaterial();room.add(furniture,new THREE.Mesh(new THREE.PlaneGeometry(),custom));scene.add(room);
    reveal.update(scene,camera,new THREE.Vector3());reveal.update(scene,camera,new THREE.Vector3());
    expect(source.userData.shaderPatches).toHaveLength(2);expect(furniture.material).toBe(trees.material);
    const shader=compile(source);expect(shader.uniforms.uPrior.value).toBe(7);expect(shader.uniforms.uRevealPerspective.value).toBe(1);
    expect(compile(custom,'void main(void) { gl_FragColor = vec4(1.); }').fragmentShader).toContain('if(uRevealEnabled');
    expect(shader.fragmentShader).toContain('gl_FragCoord.z');expect(source.transparent).toBe(false);expect(source.depthWrite).toBe(true);
    source.emissiveIntensity=2;expect((furniture.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(2);
    expect(() => reveal.withoutReveal(() => {expect(shader.uniforms.uRevealEnabled.value).toBe(0);throw Error('bake');})).toThrow('bake');
    expect(shader.uniforms.uRevealEnabled.value).toBe(1);
  });
});
