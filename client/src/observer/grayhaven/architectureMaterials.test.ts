import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { architecturalUVs, architectureSurfaces, createOverviewGlazing } from "./architectureMaterials";
import { patchMaterial } from "./lightingPatch";
import { WorldLightAtlas } from "./worldLightAtlas";

function faceRange(geometry: THREE.BufferGeometry, axis: number, value: number, component: number) {
  const n=geometry.getAttribute("normal"), uv=geometry.getAttribute("uv");
  const values=Array.from({length:n.count},(_,i)=>i).filter(i=>Math.abs(n.getComponent(i,axis)-value)<.001)
    .map(i=>uv.getComponent(i,component));
  return Math.max(...values)-Math.min(...values);
}

describe("architectural material projection", () => {
  it("keeps sky diffuse and ground bounce while replacing environment specular on both glazing variants", () => {
    const atlas = new WorldLightAtlas();
    for (const frosted of [false, true]) {
      const { material } = createOverviewGlazing(frosted);
      patchMaterial(material, atlas.patch);
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      material.onBeforeCompile(shader as never, {} as never);
      const expand = (s: string): string => s.replace(/#include <(\w+)>/g, (_, key) => expand(THREE.ShaderChunk[key as keyof typeof THREE.ShaderChunk]));
      const fragment = expand(shader.fragmentShader);
      // Ordering matters: zero only the accumulated environment radiance after
      // its lookup, before RE_IndirectSpecular consumes it. IBL diffuse survives.
      const envSample = fragment.lastIndexOf("radiance += getIBLRadiance(");
      const reset = fragment.indexOf("radiance = vec3(0.0);");
      const consume = fragment.indexOf("RE_IndirectSpecular( radiance,");
      expect(envSample).toBeGreaterThan(-1);
      expect(reset).toBeGreaterThan(envSample);
      expect(consume).toBeGreaterThan(reset);
      expect(fragment).toContain("iblIrradiance += getIBLIrradiance( geometryNormal );");
      expect(fragment).toContain("irradiance += PI * atlasBounce * atlasDownFacing;");
      expect(fragment).toContain("outgoingLight = mix(outgoingLight, reflectedSky,");
      material.dispose();
    }
    atlas.dispose();
  });
  it("preserves board size on walls with different building dimensions and orientations", () => {
    for (const [width,height,depth] of [[6,5,18],[15,12,12]]) {
      const g=new THREE.BoxGeometry(width,height,depth);
      architecturalUVs(g,"clapboard");
      for (const face of [-1,1]) {
        expect(faceRange(g,2,face,1)).toBeCloseTo(height/architectureSurfaces.clapboard[1]);
        expect(faceRange(g,0,face,1)).toBeCloseTo(height/architectureSurfaces.clapboard[1]);
        expect(faceRange(g,2,face,0)).toBeCloseTo(width/architectureSurfaces.clapboard[0]);
        expect(faceRange(g,0,face,0)).toBeCloseTo(depth/architectureSurfaces.clapboard[0]);
      }
      g.dispose();
    }
  });
  it("aligns siding courses where separately built storeys meet", () => {
    const lower=new THREE.BoxGeometry(14,5,20),upper=new THREE.BoxGeometry(14,7,12);
    architecturalUVs(lower,"clapboard",[0,2.5,0]); architecturalUVs(upper,"clapboard",[0,8.5,0]);
    // Only vertical faces; horizontal cap UVs intentionally use planar coordinates.
    const sideV=(g:THREE.BufferGeometry,y:number)=>{
      const p=g.getAttribute("position"),n=g.getAttribute("normal"),uv=g.getAttribute("uv");
      return Array.from({length:p.count},(_,i)=>i).filter(i=>p.getY(i)===y&&Math.abs(n.getY(i))<.5).map(i=>uv.getY(i));
    };
    for (const v of [...sideV(lower,2.5),...sideV(upper,-3.5)]) expect(v).toBeCloseTo(5/3.6);
    lower.dispose(); upper.dispose();
  });
  it("runs metal ribs downhill instead of along the gable ridge", () => {
    const g=new THREE.BoxGeometry(8,.3,22); g.userData.roofSlopeAxis="x";
    architecturalUVs(g,"metalRoof");
    expect(faceRange(g,1,1,0)).toBeCloseTo(22/5);
    expect(faceRange(g,1,1,1)).toBeCloseTo(8/8);
    g.dispose();
  });
});
