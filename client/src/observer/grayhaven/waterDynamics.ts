import * as THREE from "three";
import { coastalElevation, coastWidth, waterline } from "./layout";

export const WAVE_COUNT = 6;
export const WAVE_INTERVAL = 5.3;
const random = (id: number, salt: number) => { const n = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Deterministic wave events: approach, decelerating run-up, then slower backwash. */
export function sampleShoreWave(id: number, time: number) {
  const birth = id * WAVE_INTERVAL + random(id, 1) * 1.7;
  const duration = 22 + random(id, 2) * 5;
  const age = (time - birth) / duration;
  const runup = 7 + random(id, 3) * 6;
  let front: number;
  if (age < .55) front = 72 * (1 - age / .55);
  else if (age < .72) front = -runup * Math.sin(Math.max(0, (age - .55) / .17) * Math.PI / 2);
  else front = -runup + (runup + 8) * smooth((age - .72) / .28);
  const envelope = smooth(age / .09) * (1 - smooth((age - .73) / .27));
  return {
    id, birth, duration, age, front,
    strength: (.65 + random(id, 4) * .85) * envelope,
    width: 3.2 + random(id, 5) * 2.8,
    tilt: (random(id, 6) - .5) * .07,
    seed: random(id, 7) * 40,
  };
}

// One shared surface carries both displacement and foam: no intersecting ocean/foam layers.
export function createCoastalWater() {
  const waves = Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4());
  const shapes = Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4());
  const uniforms = {
    uTime: { value: 0 }, uFog: { value: .24 },
    uColor: { value: new THREE.Color(0x577f80) }, uLight: { value: new THREE.Color(0xb4c4b9) },
    uSunDirection: { value: new THREE.Vector3(-.6, .7, .4).normalize() },
    uSunColor: { value: new THREE.Color(0xffe0ad) },
    uWaves: { value: waves }, uShapes: { value: shapes },
  };
  const common = `
    uniform float uTime;
    uniform vec4 uWaves[6]; // front, strength, age, seed
    uniform vec4 uShapes[6]; // width, obliqueness, reserved, reserved
    float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float frontAt(float z, vec4 wave, vec4 shape) {
      return wave.x + sin(z*.039+wave.w)*2.6 + sin(z*.083+wave.w*1.7)*1.1
        + z*shape.y;
    }
    float waveGap(float z, float seed) {
      return smoothstep(.18,.64,noise(vec2(z*.029,seed)));
    }
    float beach(float z) { return exp(-pow(abs(z)/190.,4.)); }
  `;
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, side: THREE.DoubleSide,
    vertexShader: common + `
      attribute float shoreSlope;
      varying vec2 vShore; varying vec3 vWorld; varying vec3 vNormal;
      varying float vHeight;
      void main() {
        float d=uv.x, z=uv.y;
        float sand=beach(z), h=0.; vec2 gradient=vec2(0.);
        // Four non-harmonic swells with slowly changing wave-group strength.
        for(int i=0;i<4;i++) {
          float fi=float(i);
          float k=.064+fi*.037, direction=-.28+fi*.19;
          float speed=.71+fi*.193;
          float phase=d*k+z*k*direction+uTime*speed+fi*2.13;
          float group=.72+.28*sin(d*.009+z*.005-uTime*.17+fi*1.8);
          float amp=(.72-fi*.145)*group;
          h+=sin(phase)*amp;
          gradient+=cos(phase)*amp*k*vec2(1.,direction);
        }
        float shoreFade=smoothstep(0.,32.,d);
        float farFade=1.-smoothstep(180.,420.,d);
        h*=shoreFade*farFade; gradient*=shoreFade*farFade;
        for(int i=0;i<6;i++) {
          vec4 wave=uWaves[i], shape=uShapes[i];
          float front=frontAt(z,wave,shape), r=d-front;
          float breaking=1.-smoothstep(6.,42.,front);
          float width=mix(shape.x*1.7,shape.x*.75,breaking);
          float gap=.45+.55*waveGap(z,wave.w);
          float height=exp(-r*r/(width*width))*wave.y*(1.1+breaking*.75)*gap;
          height*=smoothstep(-3.,9.,front)*(.5+.5*sand);
          h+=height;
          float dd=-2.*r/(width*width)*height;
          float dz=cos(z*.039+wave.w)*.1014+cos(z*.083+wave.w*1.7)*.0913+shape.y;
          gradient+=vec2(dd,-dd*dz);
        }
        vec3 p=position;
        // Only displace water; the run-up film follows the authored beach slope.
        float waterMask=smoothstep(-1.,4.,d);
        p.y+=h*waterMask;
        vHeight=h;
        vNormal=normalize(vec3(gradient.x,1.,-gradient.y-gradient.x*shoreSlope));
        vWorld=(modelMatrix*vec4(p,1.)).xyz; vShore=uv;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }
    `,
    fragmentShader: common + `
      uniform float uFog; uniform vec3 uColor; uniform vec3 uLight;
      uniform vec3 uSunDirection; uniform vec3 uSunColor;
      varying vec2 vShore; varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
      void main() {
        float d=vShore.x, z=vShore.y, sand=beach(z);
        vec2 p=vWorld.xz;
        // Two advected scales stretch and erode the foam, rather than flashing noise.
        vec2 flow=vec2(z*.13+sin(d*.18-uTime*.3)*.6,d*.28+uTime*.56);
        float broad=noise(flow);
        float fine=noise(flow*2.7+vec2(uTime*.08,-uTime*.15));
        float lace=smoothstep(.22,.71,broad*.65+fine*.35);
        float foam=0., film=0., wetness=0.;
        for(int i=0;i<6;i++) {
          vec4 wave=uWaves[i], shape=uShapes[i];
          float front=frontAt(z,wave,shape);
          float r=d-front+(broad-.5)*2.6;
          float breaking=1.-smoothstep(10.,48.,front);
          float gap=waveGap(z,wave.w);
          float crest=1.-smoothstep(.4,1.5+lace*1.7,abs(r));
          float tail=smoothstep(-.5,2.,r)*(1.-smoothstep(3.,12.+breaking*7.,r));
          float coastFade=smoothstep(-18.,-10.,d);
          // The front becomes patchy whitewater, leaving a broad dissolving wake.
          foam+=(crest*(.4+.6*lace)+tail*lace*.46)*wave.y*breaking*(.15+.85*gap)*coastFade;
          float covered=smoothstep(-1.5,2.,r)*(1.-smoothstep(-1.,14.,d));
          film=max(film,covered*wave.y*.58);
          float remnant=(1.-smoothstep(-2.,6.,d))*smoothstep(-18.,-10.,d);
          wetness=max(wetness,remnant*wave.y*smoothstep(.5,.72,wave.z)*.2);
        }
        foam=clamp(foam*(.45+.55*sand),0.,1.);
        vec3 n=normalize(vNormal+vec3(
          sin(p.x*.47+p.y*.31+uTime*1.1)*.045,
          0.,sin(p.y*.39-p.x*.18-uTime*.91)*.04));
        vec3 view=normalize(cameraPosition-vWorld);
        float fresnel=.08+.35*pow(1.-max(dot(n,view),0.),4.);
        float direct=max(dot(n,uSunDirection),0.);
        float spec=pow(max(dot(n,normalize(view+uSunDirection)),0.),42.);
        float pigment=noise(p*vec2(.018,.035));
        vec3 color=uColor*(.76+direct*.25+pigment*.12);
        color=mix(color,uLight,fresnel);
        color+=uSunColor*spec*.22;
        color=mix(color,uLight*.94,smoothstep(.5,2.5,vHeight)*.1);
        color=mix(color,uColor*.76,wetness);
        color=mix(color,uLight*1.13,foam*.85);
        float distant=smoothstep(550.,1800.-uFog*750.,distance(vWorld,cameraPosition));
        color=mix(color,uLight,distant*.4);
        float shoreAlpha=max(max(foam*.82,film),wetness);
        float alpha=mix(shoreAlpha,1.,smoothstep(-.5,.6,d));
        alpha*=smoothstep(mix(-1.4,-20.,sand),mix(-.5,-17.,sand),d);
        if(alpha<.005) discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const positions: number[] = [], uv: number[] = [], slopes: number[] = [], indices: number[] = [];
  const segments = 600, rows = 160;
  for (let j = 0; j <= segments; j++) {
    const z = -1600 + j / segments * 3200;
    const edge = waterline(z), slope = (waterline(z + .5) - waterline(z - .5));
    for (let k = 0; k <= rows; k++) {
      // Spend vertices in the surf, then progressively widen the offshore cells.
      const d = k <= 96 ? -20 + k / 96 * 140 : 120 + Math.pow((k - 96) / 64, 1.5) * 2600;
      const t = THREE.MathUtils.clamp(1 + d / coastWidth(z), 0, 1);
      const y = d < 0 ? Math.max(-.5, coastalElevation(z, t)) + .065 : -.435;
      positions.push(edge - d, y, z); uv.push(d, z); slopes.push(slope);
      if (j < segments && k < rows) {
        const a = j * (rows + 1) + k, b = a + rows + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("shoreSlope", new THREE.Float32BufferAttribute(slopes, 1));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  // Include the shader displacement in the CPU culling bounds.
  geometry.computeBoundingBox(); geometry.boundingBox!.max.y += 16;
  geometry.boundingBox!.min.y -= 3;
  geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  const update = (time: number) => {
    uniforms.uTime.value = time;
    const newest = Math.floor(time / WAVE_INTERVAL);
    for (let i = 0; i < WAVE_COUNT; i++) {
      const wave = sampleShoreWave(newest - i, time);
      waves[i].set(wave.front, wave.strength, wave.age, wave.seed);
      shapes[i].set(wave.width, wave.tilt, 0, 0);
    }
  };
  update(0);
  return { mesh, material, update };
}
