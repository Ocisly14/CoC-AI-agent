import * as THREE from 'three';
import { patchMaterial } from './lightingPatch';

/** Keep the inspection surface behind the fade boundary. Distances are world
 * units along the camera view axis, not arbitrary virtual-camera offsets. */
export function revealDepthRange(focusDepth: number, visibleHeight: number) {
  const clearance = Math.max(1.5, visibleHeight * .06);
  const overviewRetreat = focusDepth * THREE.MathUtils.smoothstep(visibleHeight, 120, 180);
  const solid = focusDepth - clearance - overviewRetreat;
  return new THREE.Vector2(solid - Math.max(.35, visibleHeight * .01), solid);
}

export function depthRevealCoverage(depth: number, range: THREE.Vector2) {
  return THREE.MathUtils.smoothstep(depth, range.x, range.y);
}

export const REVEAL_FEATHER = .7;
export type RevealTarget = { center: THREE.Vector3; radii: THREE.Vector2; strength: number };

/** Radius is measured in camera-plane world units, not viewport fractions. */
export function projectedRevealEllipse(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, target: RevealTarget) {
  const center = target.center.clone().project(camera);
  const depth = -target.center.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const height = camera instanceof THREE.OrthographicCamera ? (camera.top-camera.bottom)/camera.zoom
    : 2*depth*Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV())/2);
  const aspect = camera instanceof THREE.OrthographicCamera ? (camera.right-camera.left)/(camera.top-camera.bottom) : camera.aspect;
  return { center: new THREE.Vector2((center.x+1)/2,(center.y+1)/2),
    radii: target.radii.clone().divide(new THREE.Vector2(Math.max(.001,height*aspect),Math.max(.001,height))),
    visible: depth>camera.near && depth<camera.far };
}

export function ellipticalRevealCoverage(uv: THREE.Vector2, center: THREE.Vector2, radii: THREE.Vector2,
  depth: number, range: THREE.Vector2, strength = 1) {
  const distance = uv.clone().sub(center).divide(radii).length();
  const mask = 1-THREE.MathUtils.smoothstep(distance,REVEAL_FEATHER,1);
  return 1-mask*THREE.MathUtils.clamp(strength,0,1)*(1-depthRevealCoverage(depth,range));
}

/** Eligible scene materials use a feathered screen ellipse and a shared depth rule.
 * Fragment depth handles instances, merged meshes and custom water shaders too.
 * Dither coverage preserves depth for fog; shadow/bake passes retain solid geometry. */
export function createDepthReveal() {
  const shared = {
    uRevealEnabled: { value: 1 },
    uRevealRange: { value: new THREE.Vector2(-1, 0) }, uRevealNearFar: { value: new THREE.Vector2(1, 2200) },
    uRevealPerspective: { value: 0 },
    uRevealCenter: { value: new THREE.Vector2(.5,.5) },
    uRevealRadii: { value: new THREE.Vector2(.3,.3) },
    uRevealViewport: { value: new THREE.Vector4(0,0,1,1) },
    uRevealStrength: { value: 0 },
  };
  const patched = new WeakSet<THREE.Material>();
  function register(root: THREE.Object3D) {
    root.traverse(object => {
      const materials = (object as THREE.Mesh).material;
      if (!materials) return;
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        if (material.userData.revealProtected) continue;
        if (patched.has(material)) continue;
        patched.add(material);
        patchMaterial(material, { key: 'grayhaven-elliptical-reveal-v4', apply(shader) {
          Object.assign(shader.uniforms, shared);
          shader.fragmentShader = `uniform float uRevealEnabled, uRevealPerspective, uRevealStrength;
            uniform vec2 uRevealNearFar, uRevealRange, uRevealCenter, uRevealRadii;
            uniform vec4 uRevealViewport;\n` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(/void\s+main\s*\(\s*(?:void)?\s*\)\s*\{/, `$&
            float revealNear = uRevealNearFar.x, revealFar = uRevealNearFar.y;
            float revealDepth = mix(revealNear + gl_FragCoord.z * (revealFar - revealNear),
              revealNear * revealFar / (revealFar - gl_FragCoord.z * (revealFar - revealNear)), uRevealPerspective);
            vec2 revealUv = (gl_FragCoord.xy-uRevealViewport.xy)/uRevealViewport.zw;
            float revealDistance = length((revealUv-uRevealCenter)/max(uRevealRadii,vec2(.00001)));
            float revealMask = 1.0-smoothstep(${REVEAL_FEATHER},1.0,revealDistance);
            float revealCoverage = 1.0-revealMask*uRevealStrength*(1.0-smoothstep(uRevealRange.x,uRevealRange.y,revealDepth));
            float revealNoise = fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
            if(uRevealEnabled>.5 && (revealCoverage<=0.0 || revealNoise>revealCoverage)) discard;
          `);
        } });
      }
    });
  }
  return {
    register,
    update(scene: THREE.Scene, camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, focus: THREE.Vector3,
      target: RevealTarget | null = {center:focus,radii:new THREE.Vector2(28,22),strength:1}, dt = 1) {
      register(scene);
      camera.updateMatrixWorld();
      const orthographic = camera instanceof THREE.OrthographicCamera;
      shared.uRevealNearFar.value.set(camera.near, camera.far);
      shared.uRevealPerspective.value = orthographic ? 0 : 1;
      const focusDepth = -(target?.center??focus).clone().applyMatrix4(camera.matrixWorldInverse).z;
      const visibleHeight = orthographic ? (camera.top-camera.bottom)/camera.zoom : 2*focusDepth*Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV())/2);
      shared.uRevealRange.value.copy(revealDepthRange(focusDepth,visibleHeight));
      if (!target) { shared.uRevealStrength.value=0; return; }
      const ellipse = projectedRevealEllipse(camera,target);
      shared.uRevealCenter.value.copy(ellipse.center);
      shared.uRevealRadii.value.copy(ellipse.radii);
      const strength = ellipse.visible ? THREE.MathUtils.clamp(target.strength,0,1) : 0;
      shared.uRevealStrength.value = THREE.MathUtils.damp(shared.uRevealStrength.value,strength,10,dt);
      if(Math.abs(shared.uRevealStrength.value-strength)<.001)shared.uRevealStrength.value=strength;
    },
    /** Avoid selecting interior objects through the opaque exterior outside the lens. */
    contains(uv: THREE.Vector2) {
      return shared.uRevealStrength.value>.05 && uv.clone().sub(shared.uRevealCenter.value).divide(shared.uRevealRadii.value).length()<.9;
    },
    /** Seed each pixel with its deepest real surface. The normal near-to-far
     * render then reveals closer layers over it. A lone ground/floor pixel can
     * never become a hole, and no neighbour/object visibility is changed. */
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
      renderer.getCurrentViewport(shared.uRevealViewport.value);
      if (shared.uRevealStrength.value<=.001 || shared.uRevealRange.value.y <= shared.uRevealNearFar.value.x) { renderer.render(scene,camera); return; }
      const saved = new Map<THREE.Material, { depthFunc: THREE.DepthModes; depthWrite: boolean; depthTest: boolean; blending: THREE.Blending }>();
      scene.traverse(object => {
        const material=(object as THREE.Mesh).material;
        if(!material)return;
        for(const m of Array.isArray(material)?material:[material]) {
          if(saved.has(m) || !m.visible || !m.colorWrite)continue;
          saved.set(m,{depthFunc:m.depthFunc,depthWrite:m.depthWrite,depthTest:m.depthTest,blending:m.blending});
          m.depthFunc=THREE.GreaterEqualDepth;m.depthWrite=true;m.depthTest=true;m.blending=THREE.NoBlending;
        }
      });
      const enabled=shared.uRevealEnabled.value,autoClear=renderer.autoClear,background=scene.background;
      const shadowAuto=renderer.shadowMap.autoUpdate,shadowUpdate=renderer.shadowMap.needsUpdate;
      let drawingBase=true;
      try {
        shared.uRevealEnabled.value=0;
        // A reversed-depth colour pass must never clear physical shadow maps to 0.
        renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
        renderer.state.buffers.depth.setClear(0);
        renderer.autoClear=true;
        renderer.render(scene,camera);
        saved.forEach((state,material)=>Object.assign(material,state));
        renderer.state.buffers.depth.setClear(1);
        shared.uRevealEnabled.value=enabled;
        renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowUpdate;drawingBase=false;
        scene.background=null;renderer.autoClear=false;
        renderer.render(scene,camera);
      } finally {
        saved.forEach((state,material)=>Object.assign(material,state));
        renderer.state.buffers.depth.setClear(1);
        shared.uRevealEnabled.value=enabled;renderer.autoClear=autoClear;scene.background=background;
        renderer.shadowMap.autoUpdate=shadowAuto;if(drawingBase)renderer.shadowMap.needsUpdate=shadowUpdate;
      }
    },
    withoutReveal<T>(work: () => T): T {
      const previous = shared.uRevealEnabled.value; shared.uRevealEnabled.value = 0;
      try { return work(); } finally { shared.uRevealEnabled.value = previous; }
    },
  };
}
