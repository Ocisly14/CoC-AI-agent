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
