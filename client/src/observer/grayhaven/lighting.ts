import * as THREE from "three";
import type { makeForestLayout } from "./forestLayout";

export type LightMode = "afternoon" | "sunset" | "bluehour";

// Art-directed light, in linear rendering space. The hemisphere approximates
// diffuse sky/bounce; this is not a realtime multi-bounce GI solution.
export const lightPresets = {
  afternoon: { sky: 0xbccbd0, sun: 0xffedcf, fill: 0xc2d5e8, bounce: 0xa3b4c8, water: 0x657e83, direct: 4.8, ambient: 1.35, exposure: 1.12, position: [-280, 370, -170], dapple: 0.8, beacon: 90, porch: 0, harbor: 0, glow: 0.45 },
  sunset: { sky: 0xc5b9b5, sun: 0xffbc81, fill: 0xb8c7e1, bounce: 0x9597b0, water: 0x73828b, direct: 3.8, ambient: 1.0, exposure: 1.02, position: [-340, 180, -110], dapple: 0.58, beacon: 650, porch: 45, harbor: 55, glow: 2.2 },
  bluehour: { sky: 0x7e8fa6, sun: 0xbac9e5, fill: 0xacc6e3, bounce: 0x8190aa, water: 0x425b75, direct: 0.48, ambient: 1.0, exposure: 0.92, position: [-280, 370, -170], dapple: 0.12, beacon: 1800, porch: 130, harbor: 160, glow: 4 },
} satisfies Record<LightMode, { sky: number; sun: number; fill: number; bounce: number; water: number; direct: number; ambient: number; exposure: number; position: number[]; dapple: number; beacon: number; porch: number; harbor: number; glow: number }>;

export function projectCanopy(x: number, z: number, height: number, towardSun: THREE.Vector3) {
  const elevation = Math.max(towardSun.y, 0.1);
  return { x: x - towardSun.x / elevation * height, z: z - towardSun.z / elevation * height };
}

/** Curved, sky-facing normals give a painted card a soft crown volume. */
export function lightPaintedFoliage(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `
      #include <normal_fragment_begin>
      vec3 crownUp = normalize((viewMatrix * vec4(0.0,1.0,0.0,0.0)).xyz);
      vec3 crownRight = normalize(cross(crownUp, normal));
      normal = normalize(normal * .8 + crownUp * (.55 + .25*smoothstep(.1,.9,vMapUv.y))
        + crownRight * (vMapUv.x-.5)*1.05);
    `);
  };
  material.customProgramCacheKey = () => "grayhaven-curved-foliage-v1";
}

/** A world-space canopy mask; only modulates sunlight, never lamp or sky light. */
export class CanopySunlight {
  private canvas = document.createElement("canvas");
  readonly texture: THREE.CanvasTexture;
  private trees: ReturnType<typeof makeForestLayout> = [];
  private direction = new THREE.Vector3();
  private uniforms: { uCanopy: { value: THREE.Texture }; uDapple: { value: number } };
  private attached = new WeakSet<THREE.MeshStandardMaterial>();
  private bounds = { x: -430, z: -1100, width: 1550, depth: 2050 };

  constructor() {
    this.canvas.width = this.canvas.height = 1024;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.generateMipmaps = true;
    this.uniforms = { uCanopy: { value: this.texture }, uDapple: { value: 0 } };
  }

  setTrees(trees: ReturnType<typeof makeForestLayout>) { this.trees = trees; }

  update(towardSun: THREE.Vector3, strength: number) {
    this.uniforms.uDapple.value = strength;
    if (this.direction.distanceToSquared(towardSun) < 0.000001) return;
    this.direction.copy(towardSun);
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Cannot draw the canopy lighting mask");
    context.fillStyle = "#000";
    context.fillRect(0, 0, 1024, 1024);
    for (const tree of this.trees) {
      const shadow = projectCanopy(tree.x, tree.z, tree.height * (tree.sequoia ? .82 : .62), towardSun);
      const x = (shadow.x - this.bounds.x) / this.bounds.width * 1024;
      const y = (shadow.z - this.bounds.z) / this.bounds.depth * 1024;
      // Tall-trunk sprites contain wide transparent margins; use the painted
      // crown's width, not the full billboard, for their dapple footprint.
      const radius = (tree.crownWidth ?? tree.width) * 0.52;
      context.save();
      context.translate(x, y);
      context.scale(radius / this.bounds.width * 1024, radius / this.bounds.depth * 1024);
      const gradient = context.createRadialGradient(0, 0, 0.12, 0, 0, 1);
      gradient.addColorStop(0, "rgba(255,255,255,.84)");
      gradient.addColorStop(0.6, "rgba(255,255,255,.6)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(-1, -1, 2, 2);
      context.restore();
    }
    this.texture.needsUpdate = true;
  }

  attach(material: THREE.MeshStandardMaterial) {
    if (this.attached.has(material)) return;
    this.attached.add(material);
    const previous = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = "varying vec3 vCanopyWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
        #include <project_vertex>
        vec4 canopyPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          canopyPosition = instanceMatrix * canopyPosition;
        #endif
        vCanopyWorld = (modelMatrix * canopyPosition).xyz;
      `);
      shader.fragmentShader = `
        varying vec3 vCanopyWorld;
        uniform sampler2D uCanopy;
        uniform float uDapple;
        float canopyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float canopyNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(canopyHash(i),canopyHash(i+vec2(1,0)),f.x),
            mix(canopyHash(i+vec2(0,1)),canopyHash(i+vec2(1,1)),f.x),f.y);
        }
        float canopySunVisibility() {
          vec2 uv = (vCanopyWorld.xz - vec2(-430.0,-1100.0)) / vec2(1550.0,2050.0);
          float inBounds = step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
          float canopy = texture2D(uCanopy, vec2(uv.x,1.0-uv.y)).r * inBounds;
          float patches = canopyNoise(vCanopyWorld.xz * .32) * .7 + canopyNoise(vCanopyWorld.xz * .69) * .3;
          float opening = smoothstep(.49,.68,patches);
          return 1.0 - canopy * uDapple * (1.0 - opening*.94);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>",
        THREE.ShaderChunk.lights_fragment_begin.replace(
          "getDirectionalLightInfo( directionalLight, directLight );",
          "getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= canopySunVisibility();"));
    };
    material.customProgramCacheKey = () => "grayhaven-canopy-sunlight-v1";
    material.needsUpdate = true;
  }
}
