import { INTERIOR_VOLUME_GLSL } from './buildingInteriors';
import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { coastalElevation, elevation, shoreline, waterline } from "./layout";

// Authored sea-to-valley volume; peaks rise above the bank even at full density.
export const MIST_BOUNDS = { minX: -1150, maxX: 750, minZ: -1000, maxZ: 800 };
export function seaMistExtent(amount: number) {
  const density = THREE.MathUtils.clamp(amount, 0, 1);
  return {
    density,
    top: 14 + 216 * THREE.MathUtils.smoothstep(density, .08, 1),
    inland: 50 + 950 * density ** 1.5,
    extinction: .040 - .014 * density,
  };
}

export function mistGroundHeight(x: number, z: number) {
  const coast = waterline(z), back = shoreline(z);
  if (x <= coast) return 0;
  if (x < back) return Math.max(0, coastalElevation(z, (back - x) / (back - coast)));
  return elevation(x, z);
}

/** Envelope without turbulence, also used to check authored landmark coverage. */
export function mistEnvelope(x: number, y: number, z: number, amount: number) {
  const e = seaMistExtent(amount);
  const coast = 1 - THREE.MathUtils.smoothstep(x - waterline(z), e.inland * .38 - 55, e.inland);
  const height = 1 - THREE.MathUtils.smoothstep(y, e.top * .56, e.top);
  const ground = THREE.MathUtils.smoothstep(y - mistGroundHeight(x, z), -.5, 4);
  const edge = THREE.MathUtils.smoothstep(x, -1150, -900)
    * (1 - THREE.MathUtils.smoothstep(x, 550, 750))
    * THREE.MathUtils.smoothstep(z, -1000, -720)
    * (1 - THREE.MathUtils.smoothstep(z, 520, 800));
  return e.density * coast * height * ground * edge;
}

// A repeatable, smoothly interpolated 3D field, generated once (128 KiB).
// Periodic lattice indices avoid a seam when wind advects beyond the texture bounds.
export function makeMistNoise(size = 32) {
  const data = new Uint8Array(size ** 3 * 4);
  const hash = (x: number, y: number, z: number, seed: number) => {
    let n = Math.imul(x + seed * 31, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const value = (x: number, y: number, z: number, period: number, seed: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const smooth = (v: number) => v*v*(3-2*v);
    const fx = smooth(x-ix), fy = smooth(y-iy), fz = smooth(z-iz);
    let result = 0;
    for (let k=0;k<2;k++) for (let j=0;j<2;j++) for (let i=0;i<2;i++) {
      result += hash((ix+i)%period, (iy+j)%period, (iz+k)%period, seed)
        * (i ? fx : 1-fx) * (j ? fy : 1-fy) * (k ? fz : 1-fz);
    }
    return result;
  };
  let index = 0;
  for (let z=0;z<size;z++) for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    for (let channel=0;channel<3;channel++) {
      data[index++] = Math.round(255 * (.72*value((x+.5)/size*4,(y+.5)/size*4,(z+.5)/size*4,4,channel+7)
        + .28*value((x+.5)/size*8,(y+.5)/size*8,(z+.5)/size*8,8,channel+19)));
    }
    data[index++] = 255;
  }
  return data;
}

export const MIST_VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const MIST_FRAGMENT = `
  precision highp sampler3D;
  varying vec2 vUv;
  uniform sampler2D uDepth, uTerrain;
  uniform sampler3D uNoise;
  uniform mat4 uInverseProjection, uCameraWorld;
  uniform float uTime, uAmount, uTop, uInland, uExtinction;
  uniform vec3 uColor, uSunColor, uSunDirection;
  vec3 worldAt(float depth) {
    vec4 p = uInverseProjection * vec4(vUv*2.0-1.0, depth*2.0-1.0, 1.0);
    return (uCameraWorld * vec4(p.xyz/p.w, 1.0)).xyz;
  }
  float coastAt(float z) {
    float beach = exp(-pow(z/190.0, 4.0));
    return -335.0+270.0*exp(-pow(z/210.0,2.0))+3.0*sin(z*.026)-14.0-beach*72.0;
  }
  vec3 puffSeed(vec2 cell) {
    vec3 h = fract(vec3(cell.x,cell.y,cell.x)*vec3(.1031,.1030,.0973));
    h += dot(h,h.yxz+33.33);
    return fract((h.xxy+h.yzz)*h.zyx);
  }
  float puffAt(vec3 p, float ground, vec2 offset, float scale, float phase) {
    // Sparse ellipsoids have genuinely empty space between them. Cell margins
    // exceed center jitter + radius, so each puff fades out before a cell seam.
    vec2 wind = vec2(uTime*(2.4+phase*.35),uTime*.48);
    vec2 field = (p.xz-wind+offset)/vec2(175.0,145.0)/scale;
    vec2 cell = floor(field);
    vec3 seed = puffSeed(cell+phase*37.0);
    vec2 local = fract(field)-.5-(seed.xy-.5)*.12;
    float age = uTime*(.11+seed.z*.05)+seed.x*6.283+phase;
    float swell = .91+.09*sin(age*.73);
    vec2 radius = vec2(.34+seed.x*.07,.32+seed.y*.08)*swell;
    float center = ground+8.0+uAmount*14.0+seed.z*10.0+sin(age*.62)*4.0;
    float vertical = (p.y-center)/(8.0+uAmount*22.0);
    float r = length(vec3(local/radius,vertical));
    // Zero outside, soft feathered edges, translucent center with a slow life cycle.
    float feather = 1.0-smoothstep(.12,1.0,r);
    float breath = .48+.52*(.5+.5*sin(age));
    return feather*breath;
  }
  ${INTERIOR_VOLUME_GLSL}
  float densityAt(vec3 p) {
    if(inInterior(p))return 0.0;
    vec2 terrainUv = (p.xz-vec2(-1150,-1000))/vec2(1900,1800);
    float ground = texture2D(uTerrain,terrainUv).r*320.0;
    vec3 q = p*vec3(.003,.005,.003) - vec3(uTime*.006,uTime*.0009,uTime*.0012);
    vec3 warp = texture(uNoise,q*.61+vec3(0.0,uTime*.0013,0.0)).rgb-.5;
    float fine = texture(uNoise,q*2.13+warp*.3).g;
    // Warp only the horizontal outline; vertical support follows the actual terrain.
    vec3 drifting = p+vec3(warp.x*14.0,0.0,warp.z*14.0);
    float puffs = puffAt(drifting,ground,vec2(0),1.0,0.0)
      + puffAt(drifting,ground,vec2(89,157),1.27,1.7)*.85;
    float seaToLand = 1.0-smoothstep(uInland*.38-55.0,uInland,p.x-coastAt(p.z));
    float height = 1.0-smoothstep(uTop*.72,uTop+12.0,p.y);
    float aboveGround = smoothstep(-.5,4.0,p.y-ground);
    float edge = smoothstep(-1150.0,-900.0,p.x)*(1.0-smoothstep(550.0,750.0,p.x))
      * smoothstep(-1000.0,-720.0,p.z)*(1.0-smoothstep(520.0,800.0,p.z));
    // No baseline haze: gaps stay transparent, even with the amount slider at 100%.
    return uAmount * seaToLand * height * aboveGround * edge * puffs * (.65+fine*.65);
  }
  void main() {
    // Reconstruct near/surface points: works with the existing orthographic pan/zoom.
    vec3 origin = worldAt(0.0);
    vec3 end = worldAt(texture2D(uDepth,vUv).r);
    vec3 delta = end-origin;
    float sceneDistance = length(delta);
    vec3 direction = delta/max(sceneDistance,.0001);
    vec3 safeDirection = vec3(
      abs(direction.x)<.00001 ? .00001 : direction.x,
      abs(direction.y)<.00001 ? .00001 : direction.y,
      abs(direction.z)<.00001 ? .00001 : direction.z);
    vec3 a = (vec3(-1150,-1,-1000)-origin)/safeDirection;
    vec3 b = (vec3(750,uTop+24.0,800)-origin)/safeDirection;
    vec3 lo = min(a,b), hi = max(a,b);
    float start = max(0.0,max(lo.x,max(lo.y,lo.z)));
    // Stop at the visible scene surface: no fog accumulated behind ridges/buildings.
    float finish = min(sceneDistance,min(hi.x,min(hi.y,hi.z)));
    if (finish <= start || uAmount <= 0.0) { gl_FragColor=vec4(0); return; }
    float stepLength = (finish-start)/40.0;
    // Stable spatial dither avoids horizontal bands without temporal flicker.
    float jitter = fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
    float transmittance = 1.0;
    vec3 scattering = vec3(0);
    float forward = pow(max(dot(direction,uSunDirection),0.0),4.0);
    for (int i=0;i<40;i++) {
      vec3 p = origin+direction*(start+(float(i)+jitter)*stepLength);
      float density = densityAt(p);
      float alpha = 1.0-exp(-density*uExtinction*stepLength);
      float daylight = .82+.22*smoothstep(0.0,uTop,p.y)-density*.13;
      vec3 light = uColor*daylight + uSunColor*(.025+forward*.07);
      scattering += transmittance*alpha*light;
      transmittance *= 1.0-alpha;
      if (transmittance<.025) break;
    }
    gl_FragColor = vec4(scattering,1.0-transmittance);
  }
`;

export const MIST_COMPOSITE_FRAGMENT = `
  varying vec2 vUv;
  uniform sampler2D uScene, uDepth, uMist;
  uniform vec2 uMistSize;
  uniform float uCameraRange;
  uniform mat4 uInverseProjection, uCameraWorld;
  ${INTERIOR_VOLUME_GLSL}
  void main() {
    float centerDepth = texture2D(uDepth,vUv).r;
    vec2 grid = vUv*uMistSize-.5;
    vec2 base = floor(grid), f = fract(grid);
    vec4 fog = vec4(0.0), closestFog=vec4(0.0);
    float total = 0.0, closestDelta=1e10;
    // Joint bilateral upsampling keeps soft mist off foreground roof/tree edges.
    for (int y=0;y<2;y++) for (int x=0;x<2;x++) {
      vec2 uv = (base+vec2(float(x),float(y))+.5)/uMistSize;
      float delta = abs(texture2D(uDepth,uv).r-centerDepth)*uCameraRange;
      vec4 sampleFog = texture2D(uMist,uv);
      if (delta<closestDelta) { closestDelta=delta; closestFog=sampleFog; }
      float spatial = (x==0 ? 1.0-f.x : f.x)*(y==0 ? 1.0-f.y : f.y);
      float weight = spatial*exp(-delta*.25);
      fog += sampleFog*weight; total += weight;
    }
    fog = total>.0001 ? fog/total : closestFog;
    vec4 endpoint=uInverseProjection*vec4(vUv*2.0-1.0,centerDepth*2.0-1.0,1.0);
    vec3 endpointWorld=(uCameraWorld*vec4(endpoint.xyz/endpoint.w,1.0)).xyz;
    // Art-directed room readability, classified at full resolution after upsampling.
    if(inInterior(endpointWorld))fog*=min(1.0,.10/max(fog.a,.00001));
    vec3 scene = texture2D(uScene,vUv).rgb;
    gl_FragColor = vec4(scene*(1.0-fog.a)+fog.rgb,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Half-resolution, depth-clipped volume raymarch, then edge-aware HDR composition. */
export function createSeaMist() {
  const noise = new THREE.Data3DTexture(makeMistNoise(),32,32,32);
  noise.format = THREE.RGBAFormat;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.unpackAlignment = 1; noise.needsUpdate = true;
  const terrainSize = 192, terrainData = new Uint8Array(terrainSize*terrainSize*4);
  for (let z=0;z<terrainSize;z++) for (let x=0;x<terrainSize;x++) {
    const i=(z*terrainSize+x)*4;
    terrainData[i]=Math.round(Math.min(1,mistGroundHeight(-1150+(x+.5)/terrainSize*1900,-1000+(z+.5)/terrainSize*1800)/320)*255);
    terrainData[i+3]=255;
  }
  const terrain = new THREE.DataTexture(terrainData,terrainSize,terrainSize);
  terrain.minFilter = terrain.magFilter = THREE.LinearFilter; terrain.needsUpdate = true;
  const sceneTarget = new THREE.WebGLRenderTarget(1,1, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1,1,THREE.UnsignedIntType),
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: 2,
  });
  const fogTarget = new THREE.WebGLRenderTarget(1,1, {
    type: THREE.HalfFloatType, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  const indoorUniforms={uInteriorActive:{value:0},uInteriorInverse:{value:new THREE.Matrix4()}};
  const uniforms = {
    ...indoorUniforms,
    uDepth: { value: sceneTarget.depthTexture }, uTerrain: { value: terrain }, uNoise: { value: noise },
    uInverseProjection: { value: new THREE.Matrix4() }, uCameraWorld: { value: new THREE.Matrix4() },
    uTime: { value: 0 }, uAmount: { value: 0 }, uTop: { value: 14 }, uInland: { value: 50 }, uExtinction: { value: .006 },
    uColor: { value: new THREE.Color(0xcbd5d0) }, uSunColor: { value: new THREE.Color(0xffe0ad) },
    uSunDirection: { value: new THREE.Vector3(-.5,.7,.4).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: MIST_VERTEX, fragmentShader: MIST_FRAGMENT,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const composeUniforms = {
    ...indoorUniforms,uInverseProjection:uniforms.uInverseProjection,uCameraWorld:uniforms.uCameraWorld,
    uScene: { value: sceneTarget.texture }, uDepth: { value: sceneTarget.depthTexture }, uMist: { value: fogTarget.texture },
    uMistSize: { value: new THREE.Vector2(1,1) }, uCameraRange: { value: 2199 },
  };
  const composite = new THREE.ShaderMaterial({
    uniforms: composeUniforms, vertexShader: MIST_VERTEX, fragmentShader: MIST_COMPOSITE_FRAGMENT,
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(material), output = new FullScreenQuad(composite);
  const size = new THREE.Vector2();
  let width=0, height=0;
  return {
    // Excludes driver overhead: HDR/depth + 2x MSAA attachment storage + fog buffer.
    get estimatedBytes() { return noise.image.data.byteLength+terrainData.byteLength+width*height*36+fogTarget.width*fogTarget.height*8; },
    setInterior(inverse:THREE.Matrix4,active:boolean){indoorUniforms.uInteriorInverse.value.copy(inverse);indoorUniforms.uInteriorActive.value=active?1:0;},
    update(time: number) { uniforms.uTime.value = time; },
    setAtmosphere(amount: number, sky: THREE.ColorRepresentation, daylight=1) {
      const e = seaMistExtent(amount);
      uniforms.uAmount.value=e.density; uniforms.uTop.value=e.top;
      uniforms.uInland.value=e.inland; uniforms.uExtinction.value=e.extinction;
      uniforms.uColor.value.set(sky).lerp(new THREE.Color(0xdce3dd),.22*THREE.MathUtils.clamp(daylight,0,1));
    },
    setSun(direction: THREE.Vector3, color: THREE.ColorRepresentation) {
      uniforms.uSunDirection.value.copy(direction); uniforms.uSunColor.value.set(color);
    },
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera) {
      if (uniforms.uAmount.value===0) { renderer.render(scene,camera); return; }
      renderer.getDrawingBufferSize(size);
      if (width!==size.x || height!==size.y) {
        width=size.x; height=size.y;
        sceneTarget.setSize(width,height);
        const scale=Math.min(.5,960/Math.max(width,height));
        fogTarget.setSize(Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale)));
        composeUniforms.uMistSize.value.set(fogTarget.width,fogTarget.height);
      }
      const previous = renderer.getRenderTarget(), reset=renderer.info.autoReset;
      renderer.info.autoReset=false; renderer.info.reset();
      try {
        renderer.setRenderTarget(sceneTarget); renderer.render(scene,camera);
        uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
        uniforms.uCameraWorld.value.copy(camera.matrixWorld);
        composeUniforms.uCameraRange.value=camera.far-camera.near;
        renderer.setRenderTarget(fogTarget); quad.render(renderer);
        renderer.setRenderTarget(previous); output.render(renderer);
      } finally { renderer.setRenderTarget(previous); renderer.info.autoReset=reset; }
    },
    dispose() {
      noise.dispose(); terrain.dispose(); sceneTarget.dispose(); fogTarget.dispose();
      material.dispose(); composite.dispose(); quad.dispose(); output.dispose();
    },
  };
}
