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
