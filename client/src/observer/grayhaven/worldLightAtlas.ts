import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { elevation } from "./layout";
import { projectCanopy } from "./lighting";
import type { ShaderPatch } from "./lightingPatch";

// World extent of every baked texture. Square texels at the atlas size.
export const ATLAS_BOUNDS = { minX: -430, minZ: -1100, width: 1550, depth: 2050 } as const;
export const ATLAS_SIZE = { width: 1536, height: 2048 } as const;   // ≈ 1 world unit per texel
export const GROUND_SIZE = { width: 768, height: 1024 } as const;   // terrain height, ≈ 2 units per texel
export const BOUNCE_SIZE = { width: 384, height: 512 } as const;    // blurred ground radiance
export const BAKE_LAYER = { ground: 1, occluder: 2, bounce: 3 } as const;
/** Horizon search radius for sky visibility, in world units. */
export const SKY_SAMPLE_RADIUS = 20;
/** Tree occluder proxy as fractions of the painted crown width / card height. */
export const TREE_PROXY = { radius: 0.3, base: 0.35, top: 0.9 } as const;

export type AtlasTree = { x: number; z: number; height: number; width: number; crownWidth?: number };

/** Texture coordinates of a world XZ point. v = 1 is the north edge (minZ), as rendered by the bake camera. */
export function atlasUv(x: number, z: number): [number, number] {
  return [(x - ATLAS_BOUNDS.minX) / ATLAS_BOUNDS.width, 1 - (z - ATLAS_BOUNDS.minZ) / ATLAS_BOUNDS.depth];
}

/** Canvas pixel of a world XZ point; row 0 is the south edge so getImageData matches readRenderTargetPixels rows. */
export function canopyCanvasPoint(x: number, z: number): [number, number] {
  const [u, v] = atlasUv(x, z);
  return [u * ATLAS_SIZE.width, v * ATLAS_SIZE.height];
}

/** Top-down orthographic camera whose image matches `atlasUv`. */
export function createBakeCamera() {
  const { minX, minZ, width, depth } = ATLAS_BOUNDS;
  // rotation.x = -90° looks down -Y with camera +y = world -z, so the image top is minZ.
  const camera = new THREE.OrthographicCamera(minX, minX + width, -minZ, -(minZ + depth), 1, 1000);
  camera.position.set(0, 500, 0);
  camera.rotation.x = -Math.PI / 2;
  camera.updateMatrixWorld(true);
  return camera;
}

const proxyScale = new THREE.Vector3(), proxyPosition = new THREE.Vector3(), proxyQuaternion = new THREE.Quaternion();
/** An ellipsoid standing in for a painted tree card, which is a line from above. */
export function treeProxyMatrix(tree: AtlasTree, groundY: number, out: THREE.Matrix4) {
  const radius = (tree.crownWidth ?? tree.width) * TREE_PROXY.radius;
  const bottom = groundY + tree.height * TREE_PROXY.base, top = groundY + tree.height * TREE_PROXY.top;
  proxyScale.set(radius, (top - bottom) / 2, radius);
  proxyPosition.set(tree.x, (top + bottom) / 2, tree.z);
  return out.compose(proxyPosition, proxyQuaternion, proxyScale);
}

const HEIGHT_VERTEX = /* glsl */ `
varying float vHeight;
void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  vec4 world = modelMatrix * local;
  vHeight = world.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const HEIGHT_FRAGMENT = /* glsl */ `
varying float vHeight;
void main() { gl_FragColor = vec4(vHeight, 0.0, 0.0, 1.0); }`;

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

// Horizon-based sky visibility of the terrain surface, occluded by everything
// above it. Inside a building footprint the roof sits directly overhead, so the
// ground there reads ≈ 0 and wall bases sampling it darken into a contact band.
const SKY_VISIBILITY_FRAGMENT = /* glsl */ `
uniform sampler2D uGround;
uniform sampler2D uOccluders;
uniform vec2 uWorldSize;
uniform float uRadius;
varying vec2 vUv;
#define GH_AZIMUTHS 12
#define GH_STEPS 8
void main() {
  float h0 = texture2D(uGround, vUv).r;
  float visibility = 0.0;
  for (int i = 0; i < GH_AZIMUTHS; i++) {
    float a = (float(i) + 0.5) / float(GH_AZIMUTHS) * 6.2831853;
    vec2 dir = vec2(cos(a), sin(a));
    float horizon = 0.0;
    for (int k = 1; k <= GH_STEPS; k++) {
      float r = uRadius * pow(float(k) / float(GH_STEPS), 1.4);
      float h = texture2D(uOccluders, vUv + dir * r / uWorldSize).r;
      horizon = max(horizon, (h - h0 - 0.4) / r);
    }
    visibility += 1.0 - horizon / sqrt(1.0 + horizon * horizon);
  }
  gl_FragColor = vec4(vec3(visibility / float(GH_AZIMUTHS)), 1.0);
}`;

const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  float w[5];
  w[0] = 0.227; w[1] = 0.1946; w[2] = 0.1216; w[3] = 0.054; w[4] = 0.016;
  vec3 color = texture2D(uSource, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = uStep * float(i);
    color += (texture2D(uSource, vUv + offset).rgb + texture2D(uSource, vUv - offset).rgb) * w[i];
  }
  gl_FragColor = vec4(color, 1.0);
}`;

// Material patch: samples atlas / ground height / bounce once per fragment.
const ATLAS_HEADER = /* glsl */ `
varying vec3 vAtlasWorld;
uniform sampler2D uAtlas;
uniform sampler2D uGroundHeight;
uniform sampler2D uBounce;
uniform vec2 uAtlasOrigin;
uniform vec2 uAtlasSize;
uniform float uDapple, uAoStrength, uContactHeight, uBounceStrength, uMist, uMistFloor, uMistTop;
vec2 grayhavenAtlasUv(vec2 xz) {
  vec2 uv = (xz - uAtlasOrigin) / uAtlasSize;
  return vec2(uv.x, 1.0 - uv.y);
}
float grayhavenHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float grayhavenNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grayhavenHash(i), grayhavenHash(i + vec2(1, 0)), f.x),
    mix(grayhavenHash(i + vec2(0, 1)), grayhavenHash(i + vec2(1, 1)), f.x), f.y);
}
`;

const ATLAS_SAMPLE = /* glsl */ `
vec2 atlasUv = grayhavenAtlasUv(vAtlasWorld.xz);
float atlasInside = step(0.0, atlasUv.x) * step(atlasUv.x, 1.0) * step(0.0, atlasUv.y) * step(atlasUv.y, 1.0);
vec4 atlasTexel = texture2D(uAtlas, atlasUv);
float atlasGroundY = texture2D(uGroundHeight, atlasUv).r;
// Ground occlusion applies fully at the terrain and fades up walls and trunks.
// One unit of slack absorbs the coarser ground-height texture on slopes.
float atlasLift = clamp((vAtlasWorld.y - atlasGroundY - 1.0) / uContactHeight, 0.0, 1.0);
float atlasSky = mix(1.0, atlasTexel.r, atlasInside);
float atlasOcclusion = 1.0 - (1.0 - mix(atlasSky, 1.0, atlasLift)) * uAoStrength;
float atlasPatches = grayhavenNoise(vAtlasWorld.xz * .32) * .7 + grayhavenNoise(vAtlasWorld.xz * .69) * .3;
float atlasOpening = smoothstep(.49, .68, atlasPatches);
float atlasCanopy = 1.0 - atlasTexel.g * atlasInside * uDapple * (1.0 - atlasOpening * .94);
vec3 atlasWorldNormal = inverseTransformDirection(normal, viewMatrix);
float atlasDownFacing = clamp(0.5 - 0.5 * atlasWorldNormal.y, 0.0, 1.0);
vec3 atlasBounce = texture2D(uBounce, atlasUv).rgb * uBounceStrength * atlasInside;
`;

const ATLAS_OCCLUSION = /* glsl */ `
reflectedLight.indirectDiffuse *= atlasOcclusion;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float atlasDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( atlasDotNV, atlasOcclusion, material.roughness );
#endif
`;

// Linear distance fog combined with a low-lying mist; replaces three's fog_fragment.
const ATLAS_FOG = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  float mistFactor = uMist * (1.0 - smoothstep(uMistFloor, uMistTop, vAtlasWorld.y));
  fogFactor = 1.0 - (1.0 - fogFactor) * (1.0 - mistFactor);
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

type AtlasUniforms = {
  uAtlas: { value: THREE.Texture }; uGroundHeight: { value: THREE.Texture }; uBounce: { value: THREE.Texture };
  uAtlasOrigin: { value: THREE.Vector2 }; uAtlasSize: { value: THREE.Vector2 };
  uDapple: { value: number }; uAoStrength: { value: number }; uContactHeight: { value: number }; uBounceStrength: { value: number };
  uMist: { value: number }; uMistFloor: { value: number }; uMistTop: { value: number };
};

/**
 * World-space light atlas baked from a top-down camera: R = sky visibility of
 * the terrain (static), G = canopy sun mask (per preset); plus a terrain height
 * field and a blurred, lit ground radiance used as spatially varying bounce.
 * A 2.5D approximation: one height per XZ, so overhangs cast no occlusion.
 */
export class WorldLightAtlas {
  readonly uniforms: AtlasUniforms;
  readonly patch: ShaderPatch;
  readonly estimatedBytes =
    ATLAS_SIZE.width * ATLAS_SIZE.height * 4 * 4 / 3 +           // RGBA8 + mips
    GROUND_SIZE.width * GROUND_SIZE.height * 8 +                  // RGBA16F
    BOUNCE_SIZE.width * BOUNCE_SIZE.height * 8 * 2;               // RGBA16F, ping-pong
  private atlasData = new Uint8Array(ATLAS_SIZE.width * ATLAS_SIZE.height * 4);
  private atlas: THREE.DataTexture;
  private groundHeight: THREE.WebGLRenderTarget;
  private bounce: THREE.WebGLRenderTarget;
  private bounceScratch: THREE.WebGLRenderTarget;
  private placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  private canopyCanvas: HTMLCanvasElement | null = null;
  private trees: AtlasTree[] = [];
  private direction = new THREE.Vector3();
  private baked = false;

  constructor() {
    // Fully visible sky and opaque alpha until the bake runs.
    for (let i = 0; i < this.atlasData.length; i += 4) { this.atlasData[i] = 255; this.atlasData[i + 3] = 255; }
    this.atlas = new THREE.DataTexture(this.atlasData, ATLAS_SIZE.width, ATLAS_SIZE.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.atlas.colorSpace = THREE.NoColorSpace;
    this.atlas.minFilter = THREE.LinearMipmapLinearFilter; this.atlas.magFilter = THREE.LinearFilter;
    this.atlas.generateMipmaps = true; this.atlas.needsUpdate = true;
    this.placeholder.needsUpdate = true;
    const field = (size: { width: number; height: number }, depthBuffer: boolean) => new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer, generateMipmaps: false, colorSpace: THREE.NoColorSpace,
    });
    this.groundHeight = field(GROUND_SIZE, true);
    this.bounce = field(BOUNCE_SIZE, true);
    this.bounceScratch = field(BOUNCE_SIZE, false);
    this.uniforms = {
      uAtlas: { value: this.atlas }, uGroundHeight: { value: this.groundHeight.texture }, uBounce: { value: this.placeholder },
      uAtlasOrigin: { value: new THREE.Vector2(ATLAS_BOUNDS.minX, ATLAS_BOUNDS.minZ) },
      uAtlasSize: { value: new THREE.Vector2(ATLAS_BOUNDS.width, ATLAS_BOUNDS.depth) },
      uDapple: { value: 0 }, uAoStrength: { value: 0.85 }, uContactHeight: { value: 3.5 }, uBounceStrength: { value: 0.7 },
      uMist: { value: 0 }, uMistFloor: { value: 2 }, uMistTop: { value: 70 },
    };
    this.patch = {
      key: "grayhaven-world-light-atlas-v1",
      apply: shader => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = "varying vec3 vAtlasWorld;\n" + shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
          vec4 atlasPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            atlasPosition = instanceMatrix * atlasPosition;
          #endif
          vAtlasWorld = (modelMatrix * atlasPosition).xyz;`);
        shader.fragmentShader = ATLAS_HEADER + shader.fragmentShader
          .replace("#include <lights_fragment_begin>", ATLAS_SAMPLE + THREE.ShaderChunk.lights_fragment_begin.replace(
            "getDirectionalLightInfo( directionalLight, directLight );",
            "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= atlasCanopy;"))
          .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\n\tirradiance += PI * atlasBounce * atlasDownFacing;")
          .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n" + ATLAS_OCCLUSION)
          .replace("#include <fog_fragment>", ATLAS_FOG);
      },
    };
  }

  setTrees(trees: AtlasTree[]) { this.trees = trees; }

  applyPreset(values: { aoStrength: number; contactHeight: number; bounceStrength: number; mist: number; mistFloor: number; mistTop: number }) {
    this.uniforms.uAoStrength.value = values.aoStrength;
    this.uniforms.uContactHeight.value = values.contactHeight;
    this.uniforms.uBounceStrength.value = values.bounceStrength;
    this.uniforms.uMist.value = values.mist;
    this.uniforms.uMistFloor.value = values.mistFloor;
    this.uniforms.uMistTop.value = values.mistTop;
  }

  /** Static bake: terrain height, occluder height, sky visibility → atlas R. Run once after the static scene exists. */
  bakeStatic(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const camera = createBakeCamera();
    const previous = this.enterBake(renderer, scene);
    const proxies = this.createProxies();
    scene.add(proxies);
    const heightMaterial = new THREE.ShaderMaterial({ vertexShader: HEIGHT_VERTEX, fragmentShader: HEIGHT_FRAGMENT, side: THREE.DoubleSide });
    scene.overrideMaterial = heightMaterial;
    camera.layers.set(BAKE_LAYER.ground);
    renderer.setRenderTarget(this.groundHeight); renderer.clear(); renderer.render(scene, camera);
    const occluders = new THREE.WebGLRenderTarget(ATLAS_SIZE.width, ATLAS_SIZE.height, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, generateMipmaps: false, colorSpace: THREE.NoColorSpace,
    });
    camera.layers.set(BAKE_LAYER.occluder);
    renderer.setRenderTarget(occluders); renderer.clear(); renderer.render(scene, camera);
    scene.overrideMaterial = previous.override;
    scene.remove(proxies); proxies.geometry.dispose(); (proxies.material as THREE.Material).dispose(); proxies.dispose();

    const visibility = new THREE.WebGLRenderTarget(ATLAS_SIZE.width, ATLAS_SIZE.height, { depthBuffer: false, generateMipmaps: false });
    const quad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader: SKY_VISIBILITY_FRAGMENT, depthTest: false, depthWrite: false,
      uniforms: {
        uGround: { value: this.groundHeight.texture }, uOccluders: { value: occluders.texture },
        uWorldSize: { value: new THREE.Vector2(ATLAS_BOUNDS.width, ATLAS_BOUNDS.depth) }, uRadius: { value: SKY_SAMPLE_RADIUS },
      },
    }));
    renderer.setRenderTarget(visibility); quad.render(renderer);
    const pixels = new Uint8Array(ATLAS_SIZE.width * ATLAS_SIZE.height * 4);
    renderer.readRenderTargetPixels(visibility, 0, 0, ATLAS_SIZE.width, ATLAS_SIZE.height, pixels);
    for (let i = 0; i < pixels.length; i += 4) this.atlasData[i] = pixels[i];
    this.atlas.needsUpdate = true;
    (quad.material as THREE.Material).dispose(); quad.dispose(); heightMaterial.dispose();
    occluders.dispose(); visibility.dispose();
    this.leaveBake(renderer, scene, previous);
    this.baked = true;
  }

  /** Per preset: redraw the sun-projected canopy mask into atlas G and upload. */
  updateCanopy(towardSun: THREE.Vector3, dapple: number) {
    this.uniforms.uDapple.value = dapple;
    if (dapple <= .001) return;
    if (this.direction.distanceToSquared(towardSun) < 0.000001) return;
    this.direction.copy(towardSun);
    const { width, height } = ATLAS_SIZE;
    if (!this.canopyCanvas) { this.canopyCanvas = document.createElement("canvas"); this.canopyCanvas.width = width; this.canopyCanvas.height = height; }
    const context = this.canopyCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Cannot draw the canopy lighting mask");
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#000"; context.fillRect(0, 0, width, height);
    const scaleX = width / ATLAS_BOUNDS.width, scaleY = height / ATLAS_BOUNDS.depth;
    for (const tree of this.trees) {
      const shadow = projectCanopy(tree.x, tree.z, tree.height * 0.62, towardSun);
      const [x, y] = canopyCanvasPoint(shadow.x, shadow.z);
      // Tall-trunk cards carry wide transparent margins; use the painted crown's width.
      const radius = (tree.crownWidth ?? tree.width) * 0.52;
      context.save();
      context.translate(x, y);
      context.scale(radius * scaleX, radius * scaleY);
      const gradient = context.createRadialGradient(0, 0, 0.12, 0, 0, 1);
      gradient.addColorStop(0, "rgba(255,255,255,.84)");
      gradient.addColorStop(0.6, "rgba(255,255,255,.6)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(-1, -1, 2, 2);
      context.restore();
    }
    const mask = context.getImageData(0, 0, width, height).data;
    for (let i = 0; i < mask.length; i += 4) this.atlasData[i + 1] = mask[i];
    this.atlas.needsUpdate = true;
  }

  /** Per preset, after the sun moved: lit ground radiance from above, blurred to a bounce field. */
  bakeBounce(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    if (!this.baked) throw new Error("bakeStatic must run before bakeBounce");
    const camera = createBakeCamera();
    // Physical surfaces and lights opt in. UI rings, route guides and halo
    // sprites remain on the display layer and never become indirect light.
    camera.layers.set(BAKE_LAYER.bounce);
    const previous = this.enterBake(renderer, scene);
    // The bounce is a single indirect step: never read the previous bounce while writing it.
    const mist = this.uniforms.uMist.value;
    this.uniforms.uBounce.value = this.placeholder; this.uniforms.uMist.value = 0;
    renderer.setRenderTarget(this.bounce); renderer.clear(); renderer.render(scene, camera);
    const blur = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader: BLUR_FRAGMENT, depthTest: false, depthWrite: false,
      uniforms: { uSource: { value: this.bounce.texture }, uStep: { value: new THREE.Vector2(1 / BOUNCE_SIZE.width, 0) } },
    }));
    renderer.setRenderTarget(this.bounceScratch); blur.render(renderer);
    (blur.material as THREE.ShaderMaterial).uniforms.uSource.value = this.bounceScratch.texture;
    (blur.material as THREE.ShaderMaterial).uniforms.uStep.value.set(0, 1 / BOUNCE_SIZE.height);
    renderer.setRenderTarget(this.bounce); blur.render(renderer);
    (blur.material as THREE.Material).dispose(); blur.dispose();
    this.uniforms.uBounce.value = this.bounce.texture; this.uniforms.uMist.value = mist;
    this.leaveBake(renderer, scene, previous);
  }

  dispose() {
    this.atlas.dispose(); this.placeholder.dispose();
    this.groundHeight.dispose(); this.bounce.dispose(); this.bounceScratch.dispose();
    this.canopyCanvas = null;
  }

  private createProxies() {
    const geometry = new THREE.SphereGeometry(1, 10, 7);
    const proxies = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), Math.max(1, this.trees.length));
    proxies.layers.set(BAKE_LAYER.occluder);
    const matrix = new THREE.Matrix4();
    this.trees.forEach((tree, i) => proxies.setMatrixAt(i, treeProxyMatrix(tree, elevation(tree.x, tree.z), matrix)));
    if (!this.trees.length) proxies.setMatrixAt(0, matrix.makeScale(0, 0, 0));
    proxies.instanceMatrix.needsUpdate = true;
    return proxies;
  }

  private enterBake(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const previous = {
      target: renderer.getRenderTarget(), background: scene.background, override: scene.overrideMaterial,
      clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
    };
    // Keep scene.fog and scene.environment untouched: toggling them recompiles every program.
    scene.background = null;
    renderer.setClearColor(0x000000, 1);
    return previous;
  }

  private leaveBake(renderer: THREE.WebGLRenderer, scene: THREE.Scene, previous: ReturnType<WorldLightAtlas["enterBake"]>) {
    scene.background = previous.background; scene.overrideMaterial = previous.override;
    renderer.setClearColor(previous.clearColor, previous.clearAlpha);
    renderer.setRenderTarget(previous.target);
  }
}
