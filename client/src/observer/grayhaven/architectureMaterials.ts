import * as THREE from "three";

// World units per tile, independent of the size of an individual building.
// The authored atlas has approximately 12 siding courses and 9 shingle rows.
export const architectureSurfaces = {
  clapboard: [6, 3.6], boardBatten: [4, 5], shingles: [3.6, 3.15],
  metalRoof: [5, 8], tarRoof: [8, 8], bareWood: [5, 2.8],
} as const;
export type ArchitectureSurface = keyof typeof architectureSurfaces;

export function isArchitectureSurface(surface: string | undefined): surface is ArchitectureSurface {
  return !!surface && Object.hasOwn(architectureSurfaces, surface);
}

/** Project in building-local units. Offsets keep courses aligned across storeys. */
export function architecturalUVs(geometry: THREE.BufferGeometry, surface: ArchitectureSurface, offset: readonly number[] = [0, 0, 0]) {
  const [tileWidth, tileHeight] = architectureSurfaces[surface];
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  const roofing = surface === "shingles" || surface === "metalRoof" || surface === "tarRoof";
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (roofing) {
      // Box roof panels rotated after creation declare their local downhill axis.
      const axis = geometry.userData.roofSlopeAxis;
      if (axis === "x") { u = z; v = x; }
      else if (axis === "z" || ny > .999) { u = x; v = z; }
      else if (nx > nz) { u = z; v = -Math.abs(x) / Math.max(ny, .2); }
      else { u = x; v = -Math.abs(z) / Math.max(ny, .2); }
    } else {
      u = nx > nz ? z + offset[2] : x + offset[0];
      v = ny > .9 ? z + offset[2] : y + offset[1];
    }
    uv[i * 2] = u / tileWidth;
    uv[i * 2 + 1] = v / tileHeight;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Broad sky/ground reflection for opaque overview glazing; no interior or scene capture. */
export function createOverviewGlazing(frosted = false) {
  const sky = { value: new THREE.Color(0xc9dedc) };
  const ground = { value: new THREE.Color(0x6f7460) };
  const material = new THREE.MeshStandardMaterial({ color: frosted ? 0x9aaea7 : 0x34474c, roughness: frosted ? .62 : .2 });
  material.onBeforeCompile = shader => {
    shader.uniforms.uGlassSky = sky; shader.uniforms.uGlassGround = ground;
    shader.fragmentShader = "uniform vec3 uGlassSky;\nuniform vec3 uGlassGround;\n" + shader.fragmentShader;
    // Retain diffuse sky illumination, but let the authored reflection below
    // supply the environment specular term. scene.environmentIntensity overrides
    // material.envMapIntensity when the material inherits the scene environment.
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", `
      #include <lights_fragment_maps>
      radiance = vec3(0.0);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      vec3 glassView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
      vec3 glassReflection = inverseTransformDirection(reflect(-glassView, normal), viewMatrix);
      vec3 reflectedSky = mix(uGlassGround * .38, uGlassSky, smoothstep(-.12, .55, glassReflection.y));
      float glassFresnel = .16 + .38 * pow(1.0 - abs(dot(normal, glassView)), 5.0);
      outgoingLight = mix(outgoingLight, reflectedSky, glassFresnel * ${frosted ? ".4" : "1.0"});
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => frosted ? "overview-frosted-v2" : "overview-glass-v2";
  return { material, setLight: (skyColor: THREE.ColorRepresentation, groundColor: THREE.ColorRepresentation) => {
    sky.value.set(skyColor); ground.value.set(groundColor);
  } };
}
