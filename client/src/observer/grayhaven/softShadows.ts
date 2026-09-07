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
