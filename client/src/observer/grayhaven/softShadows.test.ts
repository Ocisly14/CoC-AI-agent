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
