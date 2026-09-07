# Grayhaven 全局光照与阴影 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Grayhaven 正交沙盘加上"世界光照图集"（进入页面时俯视烘焙的天空可见度、地形高度与地面反弹色）、程序化天空环境贴图、PCSS 接触硬化软阴影和低强度高度雾，使三种光照预设有接地、有色阴影和冷暖反弹。

**Architecture:** 所有新逻辑放在 `client/src/observer/grayhaven/` 下的五个新文件：`lightingPatch.ts`（可组合的材质着色器补丁）、`globalIllumination.ts`（每预设的间接光/阴影参数与色调映射开关）、`softShadows.ts`（PCSS 补丁）、`proceduralSky.ts`（渐变天空 → PMREM）、`worldLightAtlas.ts`（烘焙相机、三次烘焙通道、材质补丁）。`GrayhavenWorld.ts` 只在最后一个任务里接入：把补丁挂到所有受光材质、在建场后调用一次静态烘焙、在切换预设时重绘林冠/烘焙反弹/生成天空。

**Tech Stack:** Three.js 0.180（WebGL2）、TypeScript、vitest（node 环境，只测纯函数）。

**Spec:** `docs/superpowers/specs/2026-09-06-grayhaven-lighting-design.md`

## Global Constraints

- 不改 `lighting.ts`、`forestLayout.ts`、`painterlyArt.ts`：另一个会话正在同时编辑它们。`lightPresets`、`lightPaintedFoliage`、`CanopySunlight` 原样保留；新参数放 `globalIllumination.ts`。`GrayhavenWorld.ts` 只在 Task 6 用最小锚点编辑，编辑前必须重新读取。
- 不提交、不运行测试/构建/开发服务器。所有验证放到 Task 7，且只在用户明确说"跑"之后执行。
- 图集范围 x ∈ [−430, 1120]、z ∈ [−1100, 950]；图集 1536 × 2048；地形高度 768 × 1024 RGBA16F；反弹 384 × 512 RGBA16F。纹理坐标约定：`v = 1 − (z − (−1100)) / 2050`，即 v = 1 对应 z = −1100（北），与 `readRenderTargetPixels` 的行序（行 0 = v 0 = 南）一致。
- 每片元新增采样不超过 3 次（图集、地形高度、反弹）。平移缩放不重绘阴影图；`shadowMap.autoUpdate` 保持 `false`。
- 材质补丁只能通过 `patchMaterial` 组合，禁止再直接赋值 `onBeforeCompile` / `customProgramCacheKey`。
- 中文注释/文档，代码标识符英文。不引入 `EffectComposer`、CSM、屏幕空间 AO。

---

### Task 1: 可组合的材质补丁 `lightingPatch.ts`

**Files:**
- Create: `client/src/observer/grayhaven/lightingPatch.ts`
- Test: `client/src/observer/grayhaven/lightingPatch.test.ts`

**Interfaces:**
- Produces: `type ShaderPatch = { key: string; apply: (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void }`；`patchMaterial(material: THREE.Material, patch: ShaderPatch): boolean`（同 key 重复挂载返回 `false`）。

- [ ] **Step 1: 写测试**

```ts
// client/src/observer/grayhaven/lightingPatch.test.ts
import { describe, expect, it } from "vitest";
import { MeshStandardMaterial } from "three";
import { patchMaterial } from "./lightingPatch";

describe("composable shader patches", () => {
  it("concatenates keys and runs patches in order", () => {
    const material = new MeshStandardMaterial();
    const calls: string[] = [];
    expect(patchMaterial(material, { key: "a", apply: () => { calls.push("a"); } })).toBe(true);
    expect(patchMaterial(material, { key: "b", apply: () => { calls.push("b"); } })).toBe(true);
    expect(material.customProgramCacheKey()).toBe("a|b");
    material.onBeforeCompile({} as never, {} as never);
    expect(calls).toEqual(["a", "b"]);
  });

  it("ignores a patch whose key is already present", () => {
    const material = new MeshStandardMaterial();
    patchMaterial(material, { key: "a", apply: () => {} });
    const version = material.version;
    expect(patchMaterial(material, { key: "a", apply: () => {} })).toBe(false);
    expect(material.customProgramCacheKey()).toBe("a");
    expect(material.version).toBe(version);
  });

  it("absorbs an inline onBeforeCompile and its cache key as the first patch", () => {
    const material = new MeshStandardMaterial();
    let ran = 0;
    material.onBeforeCompile = () => { ran++; };
    material.customProgramCacheKey = () => "inline-v1";
    patchMaterial(material, { key: "b", apply: () => {} });
    expect(material.customProgramCacheKey()).toBe("inline-v1|b");
    material.onBeforeCompile({} as never, {} as never);
    expect(ran).toBe(1);
  });

  it("gives an inline patch without a custom key a material-specific key", () => {
    const material = new MeshStandardMaterial();
    material.onBeforeCompile = () => {};
    patchMaterial(material, { key: "b", apply: () => {} });
    expect(material.customProgramCacheKey()).toBe("inline:" + material.uuid + "|b");
  });

  it("bumps the material version so the program recompiles", () => {
    const material = new MeshStandardMaterial();
    const version = material.version;
    patchMaterial(material, { key: "a", apply: () => {} });
    expect(material.version).toBe(version + 1);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// client/src/observer/grayhaven/lightingPatch.ts
import * as THREE from "three";

/** One shader customisation. Materials carrying the same patch keys share a program. */
export type ShaderPatch = {
  /** Stable, versioned identifier, e.g. "grayhaven-pcss-v1". */
  key: string;
  apply: (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void;
};

type PatchedMaterial = THREE.Material & { userData: { shaderPatches?: ShaderPatch[] } };

/**
 * Compose a shader patch onto a material. Patches run in insertion order and
 * their keys concatenate into the program cache key, so two customisations can
 * no longer overwrite each other's `onBeforeCompile` or collide on one key.
 * A pre-existing inline `onBeforeCompile` is absorbed as the first patch.
 */
export function patchMaterial(material: THREE.Material, patch: ShaderPatch): boolean {
  const target = material as PatchedMaterial;
  let patches = target.userData.shaderPatches;
  if (!patches) {
    patches = [];
    if (Object.hasOwn(material, "onBeforeCompile")) {
      const inline = material.onBeforeCompile;
      const key = Object.hasOwn(material, "customProgramCacheKey") ? material.customProgramCacheKey() : "inline:" + material.uuid;
      patches.push({ key, apply: (shader, renderer) => inline.call(material, shader, renderer) });
    }
    target.userData.shaderPatches = patches;
    const list = patches;
    material.onBeforeCompile = (shader, renderer) => { for (const entry of list) entry.apply(shader, renderer); };
    material.customProgramCacheKey = () => list.map(entry => entry.key).join("|");
  }
  if (patches.some(entry => entry.key === patch.key)) return false;
  patches.push(patch);
  material.needsUpdate = true;
  return true;
}
```

---

### Task 2: 间接光参数与色调映射开关 `globalIllumination.ts`

**Files:**
- Create: `client/src/observer/grayhaven/globalIllumination.ts`
- Test: `client/src/observer/grayhaven/globalIllumination.test.ts`

**Interfaces:**
- Consumes: `LightMode` from `./lighting`（类型）。
- Produces: `giPresets: Record<LightMode, GiPreset>`；`type GiPreset`；`toneMappingFromSearch(search: string): THREE.ToneMapping`；`mistStrength(preset: GiPreset, fog: number): number`。

- [ ] **Step 1: 写测试**

```ts
// client/src/observer/grayhaven/globalIllumination.test.ts
import { describe, expect, it } from "vitest";
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from "three";
import { giPresets, mistStrength, toneMappingFromSearch } from "./globalIllumination";

describe("global illumination presets", () => {
  it("reserves the strongest ground bounce for sunset and the least for blue hour", () => {
    expect(giPresets.sunset.bounceStrength).toBeGreaterThan(giPresets.afternoon.bounceStrength);
    expect(giPresets.bluehour.bounceStrength).toBeLessThan(giPresets.afternoon.bounceStrength);
  });

  it("softens the sun as it drops: afternoon < sunset < blue hour penumbra", () => {
    expect(giPresets.afternoon.penumbra).toBeLessThan(giPresets.sunset.penumbra);
    expect(giPresets.sunset.penumbra).toBeLessThan(giPresets.bluehour.penumbra);
  });

  it("keeps the low-lying mist restrained so the main street stays readable", () => {
    for (const preset of Object.values(giPresets)) {
      expect(mistStrength(preset, 0.24)).toBeLessThanOrEqual(0.3);
      expect(mistStrength(preset, 1)).toBeLessThanOrEqual(0.7);
      expect(mistStrength(preset, 0)).toBeGreaterThanOrEqual(0);
      expect(preset.mistTop).toBeGreaterThan(preset.mistFloor);
    }
  });

  it("defaults to ACES and only switches tone mapping on an explicit query", () => {
    expect(toneMappingFromSearch("")).toBe(ACESFilmicToneMapping);
    expect(toneMappingFromSearch("?fog=1")).toBe(ACESFilmicToneMapping);
    expect(toneMappingFromSearch("?tone=agx")).toBe(AgXToneMapping);
    expect(toneMappingFromSearch("?tone=neutral")).toBe(NeutralToneMapping);
    expect(toneMappingFromSearch("?tone=bogus")).toBe(ACESFilmicToneMapping);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// client/src/observer/grayhaven/globalIllumination.ts
import * as THREE from "three";
import type { LightMode } from "./lighting";

/**
 * Indirect light, occlusion, shadow softness and mist per preset. `lightPresets`
 * in lighting.ts keeps the direct sun, lamps and fog colour; nothing here is a
 * measurement from the reference game. Colours are sRGB hex like the palette.
 *
 * Unit notes for tuning:
 * - `envIntensity` scales a PMREM sky whose irradiance enters the shader as
 *   PI * colour * intensity, while a HemisphereLight enters as colour * intensity.
 *   A hemisphere of 1.35 is roughly an environment of 0.43 at the same colour.
 * - `penumbra` is world units of penumbra per 10 units of blocker–receiver
 *   separation (the sun is a parallel light, so width grows linearly).
 * - `contactHeight` is how far up a wall or trunk the ground occlusion fades.
 */
export type GiPreset = {
  zenith: number; ground: number; sunGlow: number; envIntensity: number; ambient: number;
  bounceStrength: number; aoStrength: number; contactHeight: number; penumbra: number;
  mist: number; mistFloor: number; mistTop: number;
};

export const giPresets = {
  afternoon: { zenith: 0x7f9cb8, ground: 0x8e8d7a, sunGlow: 0.35, envIntensity: 0.55, ambient: 0.45, bounceStrength: 0.75, aoStrength: 0.85, contactHeight: 3.5, penumbra: 1.2, mist: 0.16, mistFloor: 2, mistTop: 70 },
  sunset: { zenith: 0x7a8aa8, ground: 0x8a7f72, sunGlow: 1.2, envIntensity: 0.45, ambient: 0.35, bounceStrength: 1.0, aoStrength: 0.9, contactHeight: 3.5, penumbra: 2.0, mist: 0.2, mistFloor: 2, mistTop: 80 },
  bluehour: { zenith: 0x4f6486, ground: 0x4b5566, sunGlow: 0.15, envIntensity: 0.5, ambient: 0.4, bounceStrength: 0.3, aoStrength: 0.9, contactHeight: 3.5, penumbra: 2.8, mist: 0.24, mistFloor: 2, mistTop: 90 },
} satisfies Record<LightMode, GiPreset>;

/** Height fog strength for the preset at the UI fog slider value (0–1). */
export function mistStrength(preset: GiPreset, fog: number) {
  return Math.min(0.7, preset.mist * (0.5 + fog * 2));
}

/** `?tone=agx` / `?tone=neutral` for same-camera A/B screenshots; ACES otherwise. */
export function toneMappingFromSearch(search: string): THREE.ToneMapping {
  const tone = new URLSearchParams(search).get("tone");
  if (tone === "agx") return THREE.AgXToneMapping;
  if (tone === "neutral") return THREE.NeutralToneMapping;
  return THREE.ACESFilmicToneMapping;
}
```

---

### Task 3: PCSS 软阴影补丁 `softShadows.ts`

**Files:**
- Create: `client/src/observer/grayhaven/softShadows.ts`
- Test: `client/src/observer/grayhaven/softShadows.test.ts`

**Interfaces:**
- Consumes: `ShaderPatch` from `./lightingPatch`。
- Produces: `type SoftShadowUniforms = { uPenumbraScale: { value: THREE.Vector2 }; uSearchRadius: { value: THREE.Vector2 } }`；`createSoftShadowUniforms()`；`updateSoftShadowUniforms(uniforms, shadow: THREE.DirectionalLightShadow, penumbraPerTen: number)`；`softShadowPatch(uniforms): ShaderPatch`（key `grayhaven-pcss-v1`）。

- [ ] **Step 1: 写测试**

```ts
// client/src/observer/grayhaven/softShadows.test.ts
import { describe, expect, it } from "vitest";
import { DirectionalLight } from "three";
import { createSoftShadowUniforms, MAX_BLOCKER_SEPARATION, updateSoftShadowUniforms } from "./softShadows";

function grayhavenSun() {
  const sun = new DirectionalLight();
  Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 780, bottom: -700, near: 1, far: 1800 });
  return sun.shadow;
}

describe("PCSS uniforms for an orthographic sun", () => {
  it("converts penumbra per ten units into shadow-map UV per unit of packed depth", () => {
    const uniforms = createSoftShadowUniforms();
    updateSoftShadowUniforms(uniforms, grayhavenSun(), 1.2);
    // depth range 1799 world units; frustum 1240 wide, 1480 tall.
    expect(uniforms.uPenumbraScale.value.x).toBeCloseTo(0.12 * 1799 / 1240, 5);
    expect(uniforms.uPenumbraScale.value.y).toBeCloseTo(0.12 * 1799 / 1480, 5);
    expect(uniforms.uSearchRadius.value.x).toBeCloseTo(MAX_BLOCKER_SEPARATION * 0.12 / 1240, 6);
    expect(uniforms.uSearchRadius.value.y).toBeCloseTo(MAX_BLOCKER_SEPARATION * 0.12 / 1480, 6);
  });

  it("scales linearly with the preset's penumbra", () => {
    const soft = createSoftShadowUniforms(), softer = createSoftShadowUniforms();
    updateSoftShadowUniforms(soft, grayhavenSun(), 1);
    updateSoftShadowUniforms(softer, grayhavenSun(), 2);
    expect(softer.uPenumbraScale.value.x).toBeCloseTo(soft.uPenumbraScale.value.x * 2, 6);
    expect(softer.uSearchRadius.value.y).toBeCloseTo(soft.uSearchRadius.value.y * 2, 6);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// client/src/observer/grayhaven/softShadows.ts
import * as THREE from "three";
import type { ShaderPatch } from "./lightingPatch";

export type SoftShadowUniforms = {
  uPenumbraScale: { value: THREE.Vector2 };
  uSearchRadius: { value: THREE.Vector2 };
};

/** Largest blocker–receiver separation the blocker search accounts for, in world units. */
export const MAX_BLOCKER_SEPARATION = 40;

export function createSoftShadowUniforms(): SoftShadowUniforms {
  return { uPenumbraScale: { value: new THREE.Vector2() }, uSearchRadius: { value: new THREE.Vector2() } };
}

/**
 * The sun is orthographic, so packed depth is linear in world units and the
 * penumbra grows linearly with separation. `penumbraPerTen` is world units of
 * penumbra per 10 units of separation.
 */
export function updateSoftShadowUniforms(uniforms: SoftShadowUniforms, shadow: THREE.DirectionalLightShadow, penumbraPerTen: number) {
  const camera = shadow.camera;
  const depthRange = camera.far - camera.near;
  const width = camera.right - camera.left, height = camera.top - camera.bottom;
  const ratio = penumbraPerTen / 10;
  uniforms.uPenumbraScale.value.set(ratio * depthRange / width, ratio * depthRange / height);
  uniforms.uSearchRadius.value.set(MAX_BLOCKER_SEPARATION * ratio / width, MAX_BLOCKER_SEPARATION * ratio / height);
}

// Percentage-closer soft shadows for the directional light only. Point lights keep
// three's getPointShadow. The per-fragment rotation is seeded from light-space UV,
// so the sample pattern is anchored to the world and does not swim while panning.
const PCSS_FUNCTIONS = /* glsl */ `
uniform vec2 uPenumbraScale;
uniform vec2 uSearchRadius;
#define GH_PCSS_TAPS 16
vec2 grayhavenTap(int i, float angle) {
  float r = (float(i) + 0.5) / float(GH_PCSS_TAPS);
  float a = angle + float(i) * 2.399963;
  return vec2(cos(a), sin(a)) * sqrt(r);
}
float grayhavenPCSS(sampler2D shadowMap, vec2 shadowMapSize, vec4 shadowCoord) {
  vec2 texel = 1.0 / shadowMapSize;
  float angle = rand(shadowCoord.xy) * 6.2831853;
  float blockerSum = 0.0, blockers = 0.0;
  for (int i = 0; i < GH_PCSS_TAPS; i++) {
    float depth = unpackRGBAToDepth(texture2D(shadowMap, shadowCoord.xy + grayhavenTap(i, angle) * uSearchRadius));
    if (depth < shadowCoord.z) { blockerSum += depth; blockers += 1.0; }
  }
  if (blockers < 0.5) return 1.0;
  float separation = shadowCoord.z - blockerSum / blockers;
  vec2 radius = clamp(separation * uPenumbraScale, texel * 1.5, uSearchRadius);
  float lit = 0.0;
  for (int i = 0; i < GH_PCSS_TAPS; i++) {
    lit += texture2DCompare(shadowMap, shadowCoord.xy + grayhavenTap(i, angle + 0.7) * radius, shadowCoord.z);
  }
  return lit / float(GH_PCSS_TAPS);
}
`;

const GET_SHADOW_SIGNATURE = "float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {";
const PCF_SOFT_BLOCK = /#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)[\s\S]*?#elif defined\( SHADOWMAP_TYPE_VSM \)/;

/** Replace three's PCF-soft directional shadow lookup with contact-hardening PCSS. */
export function softShadowPatch(uniforms: SoftShadowUniforms): ShaderPatch {
  return {
    key: "grayhaven-pcss-v1",
    apply: shader => {
      Object.assign(shader.uniforms, uniforms);
      const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
      if (!chunk.includes(GET_SHADOW_SIGNATURE) || !PCF_SOFT_BLOCK.test(chunk)) {
        throw new Error("three's shadowmap_pars_fragment changed; update softShadows.ts");
      }
      const patched = chunk
        .replace(GET_SHADOW_SIGNATURE, PCSS_FUNCTIONS + "\n" + GET_SHADOW_SIGNATURE)
        .replace(PCF_SOFT_BLOCK, "#elif defined( SHADOWMAP_TYPE_PCF_SOFT )\n\t\t\tshadow = grayhavenPCSS( shadowMap, shadowMapSize, shadowCoord );\n\t\t#elif defined( SHADOWMAP_TYPE_VSM )");
      shader.fragmentShader = shader.fragmentShader.replace("#include <shadowmap_pars_fragment>", patched);
    },
  };
}
```

---

### Task 4: 程序化天空 `proceduralSky.ts`

**Files:**
- Create: `client/src/observer/grayhaven/proceduralSky.ts`

（需要 WebGL 渲染器，不写单元测试。）

**Interfaces:**
- Produces: `type SkyParams = { zenith, horizon, ground, sunColor: THREE.ColorRepresentation; sunDirection: THREE.Vector3; sunGlow: number }`；`class ProceduralSky { constructor(renderer); update(params): THREE.Texture; readonly estimatedBytes: number; dispose() }`。

- [ ] **Step 1: 实现**

```ts
// client/src/observer/grayhaven/proceduralSky.ts
import * as THREE from "three";

export type SkyParams = {
  zenith: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  ground: THREE.ColorRepresentation;
  sunColor: THREE.ColorRepresentation;
  sunDirection: THREE.Vector3;
  sunGlow: number;
};

const CUBE_SIZE = 64;

/**
 * A gradient sky with a warm lobe on the sun's side, prefiltered into a PMREM
 * environment so indirect diffuse light has a direction and glass, metal and
 * wet sand reflect one consistent sky. The overview camera never sees the sky
 * itself; this exists only as a light source.
 */
export class ProceduralSky {
  private scene = new THREE.Scene();
  private material: THREE.ShaderMaterial;
  private geometry = new THREE.SphereGeometry(50, 32, 16);
  private generator: THREE.PMREMGenerator;
  private target: THREE.WebGLRenderTarget | null = null;
  // PMREM cube-UV layout is 3 × size wide and 4 × size tall, half float.
  readonly estimatedBytes = 3 * CUBE_SIZE * 4 * CUBE_SIZE * 8;

  constructor(renderer: THREE.WebGLRenderer) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() }, uSunDirection: { value: new THREE.Vector3(0, 1, 0) }, uSunGlow: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uHorizon, uGround, uSunColor, uSunDirection;
        uniform float uSunGlow;
        varying vec3 vDirection;
        void main() {
          vec3 d = normalize(vDirection);
          float up = d.y;
          vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, up));
          vec3 below = mix(uHorizon, uGround, smoothstep(0.0, 0.35, -up));
          vec3 color = up >= 0.0 ? sky : below;
          float toSun = max(dot(d, uSunDirection), 0.0);
          // A broad warm lobe low on the sun's side plus a tighter glow; no hard disc.
          float lobe = pow(toSun, 3.0) * (1.0 - smoothstep(0.0, 0.6, abs(up)));
          float glow = pow(toSun, 32.0);
          color += uSunColor * uSunGlow * (lobe * 0.35 + glow * 0.65);
          gl_FragColor = vec4(color, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.generator = new THREE.PMREMGenerator(renderer);
  }

  /** Re-render the sky for a preset; the previous environment is released. */
  update(params: SkyParams): THREE.Texture {
    const u = this.material.uniforms;
    (u.uZenith.value as THREE.Color).set(params.zenith);
    (u.uHorizon.value as THREE.Color).set(params.horizon);
    (u.uGround.value as THREE.Color).set(params.ground);
    (u.uSunColor.value as THREE.Color).set(params.sunColor);
    (u.uSunDirection.value as THREE.Vector3).copy(params.sunDirection).normalize();
    u.uSunGlow.value = params.sunGlow;
    this.target?.dispose();
    this.target = this.generator.fromScene(this.scene, 0, 0.1, 100, { size: CUBE_SIZE });
    return this.target.texture;
  }

  dispose() {
    this.target?.dispose(); this.target = null;
    this.generator.dispose(); this.material.dispose(); this.geometry.dispose();
  }
}
```

---

### Task 5: 世界光照图集 `worldLightAtlas.ts`

**Files:**
- Create: `client/src/observer/grayhaven/worldLightAtlas.ts`
- Test: `client/src/observer/grayhaven/worldLightAtlas.test.ts`

**Interfaces:**
- Consumes: `ShaderPatch` from `./lightingPatch`；`projectCanopy` from `./lighting`；`elevation` from `./layout`；`FullScreenQuad` from `three/addons/postprocessing/Pass.js`。
- Produces: 常量 `ATLAS_BOUNDS`、`ATLAS_SIZE`、`GROUND_SIZE`、`BOUNCE_SIZE`、`BAKE_LAYER = { ground: 1, occluder: 2 }`、`TREE_PROXY`、`SKY_SAMPLE_RADIUS`；纯函数 `atlasUv(x, z)`、`canopyCanvasPoint(x, z)`、`createBakeCamera()`、`treeProxyMatrix(tree, groundY, out)`；`type AtlasTree = { x: number; z: number; height: number; width: number; crownWidth?: number }`；`class WorldLightAtlas { setTrees(trees: AtlasTree[]); bakeStatic(renderer, scene); updateCanopy(towardSun, dapple); bakeBounce(renderer, scene); applyPreset(values: { aoStrength; contactHeight; bounceStrength; mist; mistFloor; mistTop }); readonly patch: ShaderPatch; readonly estimatedBytes: number; dispose() }`。

- [ ] **Step 1: 写测试**

```ts
// client/src/observer/grayhaven/worldLightAtlas.test.ts
import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { ATLAS_BOUNDS, ATLAS_SIZE, atlasUv, canopyCanvasPoint, createBakeCamera, TREE_PROXY, treeProxyMatrix } from "./worldLightAtlas";

describe("world light atlas mapping", () => {
  it("puts the north-west corner at (0,1) and the south-east corner at (1,0)", () => {
    expect(atlasUv(ATLAS_BOUNDS.minX, ATLAS_BOUNDS.minZ)).toEqual([0, 1]);
    expect(atlasUv(ATLAS_BOUNDS.minX + ATLAS_BOUNDS.width, ATLAS_BOUNDS.minZ + ATLAS_BOUNDS.depth)).toEqual([1, 0]);
  });

  it("projects world points through the bake camera exactly where atlasUv places them", () => {
    const camera = createBakeCamera();
    for (const [x, z] of [[-430, -1100], [1120, 950], [38, -57], [300, 400]] as const) {
      const ndc = new Vector3(x, 12, z).project(camera);
      const [u, v] = atlasUv(x, z);
      expect(ndc.x).toBeCloseTo(u * 2 - 1, 5);
      expect(ndc.y).toBeCloseTo(v * 2 - 1, 5);
      expect(ndc.z).toBeGreaterThan(-1);
      expect(ndc.z).toBeLessThan(1);
    }
  });

  it("keeps terrain heights between -20 and 300 inside the bake camera's depth range", () => {
    const camera = createBakeCamera();
    expect(new Vector3(0, -20, 0).project(camera).z).toBeLessThan(1);
    expect(new Vector3(0, 300, 0).project(camera).z).toBeGreaterThan(-1);
  });

  it("draws the canopy canvas with row 0 at the south edge, matching readback order", () => {
    expect(canopyCanvasPoint(ATLAS_BOUNDS.minX, ATLAS_BOUNDS.minZ + ATLAS_BOUNDS.depth)).toEqual([0, 0]);
    expect(canopyCanvasPoint(ATLAS_BOUNDS.minX + ATLAS_BOUNDS.width, ATLAS_BOUNDS.minZ)).toEqual([ATLAS_SIZE.width, ATLAS_SIZE.height]);
  });

  it("stands a tree proxy on the ground using the painted crown width", () => {
    const matrix = new Matrix4();
    treeProxyMatrix({ x: 10, z: 20, height: 30, width: 20, crownWidth: 12 }, 5, matrix);
    const position = new Vector3(), scale = new Vector3();
    matrix.decompose(position, new Quaternion(), scale);
    expect(scale.x).toBeCloseTo(12 * TREE_PROXY.radius);
    expect(scale.z).toBeCloseTo(12 * TREE_PROXY.radius);
    expect(position.y - scale.y).toBeCloseTo(5 + 30 * TREE_PROXY.base);
    expect(position.y + scale.y).toBeCloseTo(5 + 30 * TREE_PROXY.top);
    treeProxyMatrix({ x: 10, z: 20, height: 30, width: 20 }, 5, matrix);
    matrix.decompose(position, new Quaternion(), scale);
    expect(scale.x).toBeCloseTo(20 * TREE_PROXY.radius);
  });
});
```

- [ ] **Step 2: 实现**

```ts
// client/src/observer/grayhaven/worldLightAtlas.ts
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
export const BAKE_LAYER = { ground: 1, occluder: 2 } as const;
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
    for (let i = 3; i < this.atlasData.length; i += 4) this.atlasData[i] = 255;
    for (let i = 0; i < this.atlasData.length; i += 4) this.atlasData[i] = 255;
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
    camera.layers.set(0);
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
```

---

### Task 6: 接入 `GrayhavenWorld.ts`、`waterDynamics.ts`、文档

**Files:**
- Modify: `client/src/observer/grayhaven/GrayhavenWorld.ts`（先重新读取整份文件；另一会话在改它）
- Modify: `client/src/observer/grayhaven/waterDynamics.ts`（加 `uMist`）
- Modify: `client/src/observer/grayhaven/README.md`、`docs/superpowers/specs/2026-09-06-grayhaven-lighting-design.md`（状态行）

**Interfaces:**
- Consumes: Task 1–5 的全部导出。

- [ ] **Step 1: 导入与字段**

在 `GrayhavenWorld.ts` 顶部把 `import { CanopySunlight, lightPaintedFoliage, lightPresets, type LightMode } from "./lighting";` 改为 `import { lightPaintedFoliage, lightPresets, type LightMode } from "./lighting";`，并新增：

```ts
import { patchMaterial } from "./lightingPatch";
import { giPresets, mistStrength, toneMappingFromSearch } from "./globalIllumination";
import { createSoftShadowUniforms, softShadowPatch, updateSoftShadowUniforms } from "./softShadows";
import { ProceduralSky } from "./proceduralSky";
import { BAKE_LAYER, WorldLightAtlas } from "./worldLightAtlas";
```

字段：删除 `private canopySunlight = new CanopySunlight();`，新增：

```ts
  private lightAtlas = new WorldLightAtlas();
  private sky!: ProceduralSky;
  private softShadowUniforms = createSoftShadowUniforms();
  private softShadow = softShadowPatch(this.softShadowUniforms);
  // PCSS only where the 3072 map is used; narrow screens keep three's PCF-soft lookup.
  private softShadows = window.innerWidth >= 900;
```

- [ ] **Step 2: 构造函数**

删除 `this.textures.add(this.canopySunlight.texture);`。`this.renderer.toneMapping = THREE.ACESFilmicToneMapping;` 改为 `this.renderer.toneMapping = toneMappingFromSearch(window.location.search);`。`this.sun.shadow.intensity = 0.88;` 改为 `this.sun.shadow.intensity = 1;`（阴影颜色来自天空与反弹，不再漏太阳）。在 `host.appendChild(this.renderer.domElement);` 之后加 `this.sky = new ProceduralSky(this.renderer);`。在 `this.buildLabels();` 之后、`this.ring = ...` 之前加：

```ts
    // Static occlusion bake needs every building, rock, pier and tree proxy in place.
    this.lightAtlas.bakeStatic(this.renderer, this.scene);
```

- [ ] **Step 3: 统一挂补丁**

新增方法，并在 `material()` 创建新材质后（`this.materialCache.set` 之前）调用 `this.attachLighting(material)`：

```ts
  /** Every lit surface reads the world light atlas; shadow receivers get PCSS. */
  private attachLighting(material: THREE.MeshStandardMaterial) {
    patchMaterial(material, this.lightAtlas.patch);
    if (this.softShadows) patchMaterial(material, this.softShadow);
    return material;
  }
```

在 `mesh()` 里 `object.receiveShadow = true;` 之后加 `object.layers.enable(BAKE_LAYER.occluder);`。

`buildLandscape`：`groundMaterial.onBeforeCompile = shader => {...}` 保留，把其后的 `this.canopySunlight.attach(groundMaterial);` 改为 `this.attachLighting(groundMaterial);`；`const ground = this.mesh(...)` 后加 `ground.layers.enable(BAKE_LAYER.ground);`。`cliffMat.onBeforeCompile` 之后加 `this.attachLighting(cliffMat);`；`cliff.castShadow = false;` 改为 `cliff.castShadow = true; cliff.layers.enable(BAKE_LAYER.ground);`。`rocks` 与 `buildBeachDetails` 里每个 `InstancedMesh` 在 `this.scene.add` 前加 `.layers.enable(BAKE_LAYER.occluder)`（它们的材质来自 `material()`，已挂补丁）。

`roadSurface`：`this.canopySunlight.attach(surface);` 改为 `this.attachLighting(surface);`（`material()` 已挂过，重复调用返回 false，无副作用）。

`buildForest`：`this.canopySunlight.setTrees(trees);` 改为 `this.lightAtlas.setTrees(trees);`；两处 `lightPaintedFoliage(material)` / `lightPaintedFoliage(mat)` 之后各加 `this.attachLighting(material)` / `this.attachLighting(mat)`；`edgeTrees.castShadow = true;` 改为 `edgeTrees.castShadow = true; edgeTrees.receiveShadow = true;`。树牌不进入烘焙层。

玻璃：在字段初始化后（构造函数开头）加：

```ts
    for (const glass of [this.glazing.material, this.frostedGlazing.material]) {
      glass.envMapIntensity = 0; // keeps the authored broad sky reflection instead of a second one
      this.attachLighting(glass);
    }
    this.attachLighting(this.litWindowMaterial);
```

- [ ] **Step 4: `setAtmosphere`**

把 `this.ambient.intensity = p.ambient;` 改为 `this.ambient.intensity = gi.ambient;`，在函数开头 `const p = lightPresets[mode];` 后加 `const gi = giPresets[mode];`。把 `this.canopySunlight.update(towardSun, p.dapple * (1 - fog * 0.55));` 改为：

```ts
    const mist = mistStrength(gi, fog);
    this.lightAtlas.applyPreset({ aoStrength: gi.aoStrength, contactHeight: gi.contactHeight, bounceStrength: gi.bounceStrength, mist, mistFloor: gi.mistFloor, mistTop: gi.mistTop });
    this.lightAtlas.updateCanopy(towardSun, p.dapple * (1 - fog * 0.55));
    this.water.uniforms.uMist.value = mist;
```

把末尾的

```ts
    if (this.lightMode !== mode) this.renderer.shadowMap.needsUpdate = true;
    this.lightMode = mode;
```

改为：

```ts
    if (this.lightMode !== mode) {
      // Order matters: the bounce bake's render refreshes the sun shadow map first.
      this.renderer.shadowMap.needsUpdate = true;
      updateSoftShadowUniforms(this.softShadowUniforms, this.sun.shadow, gi.penumbra);
      this.lightAtlas.bakeBounce(this.renderer, this.scene);
      this.scene.environment = this.sky.update({ zenith: gi.zenith, horizon: p.sky, ground: gi.ground, sunColor: p.sun, sunDirection: towardSun, sunGlow: gi.sunGlow });
      this.scene.environmentIntensity = gi.envIntensity;
    }
    this.lightMode = mode;
```

- [ ] **Step 5: 统计与释放**

`textureMiBEstimate` 中把 `(1024*1024 + 64*64)*4*4/3` 改为 `64*64*4*4/3 + this.lightAtlas.estimatedBytes + this.sky.estimatedBytes`。`dispose()` 中在 `this.sun.dispose();` 前加 `this.lightAtlas.dispose(); this.sky.dispose();`。

- [ ] **Step 6: `waterDynamics.ts`**

uniforms 里加 `uMist: { value: 0 }`；片元着色器的 uniform 声明加 `uniform float uMist;`；在 `color=mix(color,uLight,distant*.4);` 之后加 `color=mix(color,uLight,uMist);`。

- [ ] **Step 7: 文档**

README 的光照条目更新为：世界光照图集（一次俯视烘焙：地形高度、天空可见度；每预设：林冠遮罩、反弹色）、程序化天空 PMREM、PCSS、高度雾、`?tone=agx` A/B 开关、纹理预算（图集约 16.8 MiB、地形高度 6.3 MiB、反弹 3.1 MiB、天空约 0.4 MiB）、反弹烘焙会让每个材质多编译一套渲染目标程序变体、2.5D 限制、本轮未做浏览器验证。设计文档状态行改为"设计提案，已实现待验证"。

---

### Task 7: 验证（等用户说"跑"）

- [ ] `pnpm exec vitest run client/src/observer/grayhaven`
- [ ] `pnpm --dir client exec tsc --noEmit`
- [ ] `pnpm --dir client build`
- [ ] 浏览器同机位截图：三预设 × 100% / 235%，`?tone=agx` 对照；检查建筑接地、崖壁投影、无抖动；读取 `data-render-stats`。
