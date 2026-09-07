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
