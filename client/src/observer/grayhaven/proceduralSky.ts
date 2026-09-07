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
