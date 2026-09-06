import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { beachAmount, coastalElevation, coastWidth, distanceToRoad, elevation, landmarks, locations, roadPaths, seededRandom, shoreline, waterline } from "./layout";
import type { Point } from "./layout";
import type { GrayhavenArt, Surface } from "./painterlyArt";
import { forestDensity, makeForestLayout } from "./forestLayout";
import { CanopySunlight, lightPaintedFoliage, lightPresets, type LightMode } from "./lighting";

import { createCoastalWater } from "./waterDynamics";

export type { LightMode } from "./lighting";
export type WorldOptions = { onSelect: (id: string) => void; onZoom: (zoom: number) => void; onError: (message: string) => void };

/** A fixed, authored visual interpretation of Grayhaven; no simulation or model calls. */
export class GrayhavenWorld {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-340, 340, 260, -260, 1, 2200);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private abort = new AbortController();
  private frame = 0;
  private disposed = false;
  private lastTime = 0;
  private textures = new Set<THREE.Texture>();
  private sun = new THREE.DirectionalLight(0xffe0ad, 3.0);
  private ambient = new THREE.HemisphereLight(0xc9dedc, 0x6f7460, 2.2);
  private canopySunlight = new CanopySunlight();
  private beacon = new THREE.PointLight(0xffdf9d, 0, 100, 2);
  private porchLight = new THREE.PointLight(0xffcd8b, 0, 26, 2);
  private harborLight = new THREE.PointLight(0xffd9a3, 0, 32, 2);
  private beaconGlass = new THREE.MeshStandardMaterial({ color: 0xc9d7d2, emissive: 0xffdc91, emissiveIntensity: 0.45, roughness: 0.38 });
  private lampGlass = new THREE.MeshStandardMaterial({ color: 0xe9dbc1, emissive: 0xffd49a, emissiveIntensity: 0, roughness: 0.5 });
  private beaconHalo!: THREE.SpriteMaterial;
  private water!: THREE.ShaderMaterial;
  private updateWater!: (time: number) => void;
  private labels: { id: string; button: HTMLButtonElement; point: THREE.Vector3; major: boolean }[] = [];
  private hits: THREE.Object3D[] = [];
  private roadOverlay = new THREE.Group();
  private windowMaterial = new THREE.MeshStandardMaterial({ color: 0x607478, roughness: 0.48 });
  private litWindowMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9f8f, emissive: 0xffc985, emissiveIntensity: 0, roughness: 0.55 });
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private buildingFootprints: { x: number; z: number; radius: number }[] = [];
  private metricsStart = 0;
  private metricFrames = 0;
  private metricFrameTimes: number[] = [];
  private ring!: THREE.Mesh;
  private focusTarget: THREE.Vector3 | null = null;
  private focusZoom: number | null = null;
  private labelVisible = true;
  private selectedId: string | null = null;
  private fogAmount = 0.24;
  private lightMode: LightMode | null = null;
  private progress = 0;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private raycaster = new THREE.Raycaster();
  private pointerStart = { x: 0, y: 0 };
  private canvasSize = { width: 1, height: 1 };

  constructor(private host: HTMLDivElement, private labelHost: HTMLDivElement, private options: WorldOptions, private art: GrayhavenArt) {
    for (const texture of art.textures) this.textures.add(texture);
    this.textures.add(this.canopySunlight.texture);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute("aria-label", "灰港镇三维全局地图，可拖动和缩放");
    this.renderer.domElement.setAttribute("role", "img");
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xb9c8c4);
    this.scene.fog = new THREE.Fog(0xb9c8c4, 430, 1400);
    this.camera.position.set(-360, 360, 430);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(38, 9, -57);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.72;
    this.controls.maxZoom = 3.4;
    this.controls.minPolarAngle = Math.PI / 5;
    this.controls.maxPolarAngle = Math.PI / 2.75;
    this.controls.enableRotate = false;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = THREE.TOUCH.PAN;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.addEventListener("start", this.cancelFocus);
    this.sun.position.set(-210, 290, 170);
    this.sun.target.position.set(30, 0, -65);
    this.sun.castShadow = true;
    const shadowSize = Math.min(window.innerWidth < 900 ? 2048 : 3072, this.renderer.capabilities.maxTextureSize);
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(this.sun.shadow.camera, { left: -620, right: 620, top: 780, bottom: -700, near: 1, far: 1800 });
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.28;
    this.sun.shadow.intensity = 0.88;
    this.scene.add(this.sun, this.sun.target, this.ambient);
    this.buildLandscape();
    this.buildRoads();
    this.buildTown();
    this.buildLandmarks();
    this.buildForest();
    this.buildLabels();
    this.ring = new THREE.Mesh(new THREE.RingGeometry(10.5, 11.1, 64), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.host.addEventListener("pointerdown", this.pointerDown, { signal: this.abort.signal });
    this.host.addEventListener("pointerup", this.pointerUp, { signal: this.abort.signal });
    this.host.addEventListener("webglcontextlost", this.contextLost, { capture: true, signal: this.abort.signal });
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.controls.update();
    this.setAtmosphere("afternoon", this.fogAmount);
    this.animate(0);
  }

  private material(color: THREE.ColorRepresentation, surface?: Surface) {
    const key = String(color) + ":" + (surface ?? "plain");
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({
      color, map: surface ? this.art.surfaces[surface] : null,
      roughness: surface === "roof" ? 0.88 : 0.95, metalness: 0,
      // Non-luminous surfaces receive their fill from the cool hemisphere.
      emissiveIntensity: 0,
    });
    this.materialCache.set(key, material);
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], parent: THREE.Object3D = this.scene) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(position[0], position[1], position[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  private buildLandscape() {
    const width = 250, height = 330;
    const geometry = new THREE.PlaneGeometry(1, 1, width, height);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    for (let j = 0; j <= height; j++) for (let i = 0; i <= width; i++) {
      const index = j * (width + 1) + i;
      const z = -1300 + j / height * 2400;
      const edge = shoreline(z);
      const x = edge + i / width * (1400 - edge);
      const y = elevation(x, z);
      positions.setXYZ(index, x, y, z);
      const forest = Math.max(0, Math.min(1, (y - 35) / 155));
      color.set(0xb6bc98).lerp(new THREE.Color(0x769186), forest * 0.76);
      const meadow = (Math.sin(x * 0.027 + Math.cos(z * 0.015) * 2) + Math.cos(z * 0.034 - x * 0.013)) * 0.5;
      color.lerp(new THREE.Color(meadow > 0 ? 0xe3d1b4 : 0xa9bca7), Math.abs(meadow) * 0.3);
      const woodland = Math.max(THREE.MathUtils.smoothstep(x, 100, 220), 1 - THREE.MathUtils.smoothstep(z, -200, -100));
      color.lerp(new THREE.Color(0x849c92), forestDensity(x, z) * woodland * 0.22);
      if (x - edge < 22) color.lerp(new THREE.Color(0xd8cabc), 0.65);
      geometry.attributes.uv.setXY(index, x / 160, z / 160);
      colors.set([color.r, color.g, color.b], index * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.art.surfaces.ground, roughness: 1 });
    // Let authored meadow colours lead; the brush texture is a quiet underpainting.
    groundMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          vec4 brush = texture2D(map, vMapUv);
          diffuseColor *= vec4(mix(vec3(1.0), brush.rgb, 0.66), brush.a);
        #endif
      `);
    };
    this.canopySunlight.attach(groundMaterial);
    const ground = this.mesh(geometry, groundMaterial, [0, 0, 0]);
    ground.castShadow = true;

    // Layered sloping rock and sand meet the water; no uniform vertical cutout.
    const cliffPositions: number[] = [], cliffColors: number[] = [], cliffUvs: number[] = [], cliffIndices: number[] = [], sandWeights: number[] = [];
    const segments = 600, rows = 24;
    for (let j = 0; j <= segments; j++) {
      const z = -1300 + j / segments * 2400, edge = shoreline(z);
      const top = elevation(edge, z);
      const beach = beachAmount(z);
      const breadth = coastWidth(z);
      for (let k = 0; k <= rows; k++) {
        const t = k / rows;
        const x = edge - breadth * t;
        const ledge = Math.sin(t * Math.PI * 3 + z * 0.039) * Math.sin(t * Math.PI) * (1 - beach) * 1.3;
        const y = coastalElevation(z, t) + ledge;
        cliffPositions.push(x, y, z);
        const c = new THREE.Color(0xc5c0b4).lerp(new THREE.Color(0x929b9e), t * 0.52);
        const tideMark = t + Math.sin(z * .075) * .018 + Math.sin(z * .19) * .009;
        const sand = new THREE.Color(0xe5d5b1).lerp(new THREE.Color(0xaca99b), THREE.MathUtils.smoothstep(tideMark, 0.64, 0.96));
        c.lerp(sand, beach); sandWeights.push(beach);
        cliffColors.push(c.r, c.g, c.b); cliffUvs.push(z / 48, t * Math.max(1, top / 12));
        if (j < segments && k < rows) {
          const a = j * (rows + 1) + k, b = a + rows + 1;
          cliffIndices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const cliffs = new THREE.BufferGeometry();
    cliffs.setAttribute("position", new THREE.Float32BufferAttribute(cliffPositions, 3));
    cliffs.setAttribute("color", new THREE.Float32BufferAttribute(cliffColors, 3));
    cliffs.setAttribute("uv", new THREE.Float32BufferAttribute(cliffUvs, 2));
    cliffs.setAttribute("sandWeight", new THREE.Float32BufferAttribute(sandWeights, 1));
    cliffs.setIndex(cliffIndices); cliffs.computeVertexNormals();
    const cliffMat = new THREE.MeshStandardMaterial({ map: this.art.surfaces.rock, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    cliffMat.onBeforeCompile = shader => {
      shader.vertexShader = "attribute float sandWeight; varying float vSandWeight; varying vec2 vBeachPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vSandWeight = sandWeight; vBeachPosition = position.xz;");
      shader.fragmentShader = "varying float vSandWeight; varying vec2 vBeachPosition;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          // Broad pigment variation plus shallow, broken wind ripples in the sand.
          float pigment = sin(vBeachPosition.x*.16 + sin(vBeachPosition.y*.09)*2.0)
                        * sin(vBeachPosition.y*.23 - vBeachPosition.x*.07);
          float ripples = pow(.5+.5*sin(vBeachPosition.x*2.4 + sin(vBeachPosition.y*.31)*1.8), 5.0);
          vec3 sandPaint = vec3(.97 + pigment*.045 - ripples*.035);
          diffuseColor *= vec4(mix(texture2D(map,vMapUv).rgb,sandPaint,vSandWeight),1.0);
        #endif
      `);
    };
    const cliff = this.mesh(cliffs, cliffMat, [0, 0, 0]);
    cliff.castShadow = false;

    const water = createCoastalWater();
    this.water = water.material;
    this.updateWater = water.update;
    this.scene.add(water.mesh);
    const random = seededRandom(71);
    const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
    const rocks = new THREE.InstancedMesh(rockGeometry, this.material(0xc3bfb3, "rock"), 125);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 125; i++) {
      const centres = [-315, -265, 238, 290, 350];
      const z = centres[i % centres.length] + (random() - 0.5) * 44;
      const x = waterline(z) - 4 - random() * 18;
      const size = 1.2 + random() * 4;
      dummy.position.set(x, size * 0.08, z);
      dummy.scale.set(size, size * (0.7 + random()), size * 0.8);
      dummy.rotation.set(random(), random() * 6, random());
      dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = true; rocks.receiveShadow = true; this.scene.add(rocks);
    this.buildBeachDetails();
  }

  /** Static shore dressing is instanced; only the surf's shared time uniform animates. */
  private buildBeachDetails() {
    const random = seededRandom(1985);
    const dummy = new THREE.Object3D();
    const surface = (z: number, t: number) => new THREE.Vector3(shoreline(z) - coastWidth(z) * t, coastalElevation(z, t), z);
    const addInstances = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, place: (i: number) => void) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      for (let i = 0; i < count; i++) {
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        place(i); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    // Leave a clear passage around the single pier and its landward approach.
    const beachZ = () => { const z = -166 + random() * 332; return z > 119 && z < 146 ? z - 32 : z; };
    addInstances(new THREE.DodecahedronGeometry(1, 0), this.material(0xb6af9b, "rock"), 210, () => {
      const z = beachZ(), t = .4 + random() * .43;
      const size = .22 + Math.pow(random(), 3) * 1.3;
      dummy.position.copy(surface(z, t)); dummy.position.y += size * .16;
      dummy.scale.set(size * 1.4, size * .5, size);
      dummy.rotation.y = random() * Math.PI;
    });
    // Dark seaweed fragments trace the last high-water mark, with generous gaps.
    addInstances(new THREE.DodecahedronGeometry(1, 0), this.material(0x646b50), 115, () => {
      const z = beachZ(), t = .71 + Math.sin(z * .07) * .045 + random() * .05;
      dummy.position.copy(surface(z, t)); dummy.position.y += .08;
      dummy.scale.set(.25 + random() * .45, .08, .45 + random() * 1.3);
      dummy.rotation.y = random() * 2;
    });
    // Bleached driftwood settles to the beach slope instead of floating above it.
    addInstances(new THREE.CylinderGeometry(.65, 1, 1, 7), this.material(0xb1a28a, "wood"), 18, () => {
      const z = beachZ(), t = .35 + random() * .28;
      const position = surface(z, t), length = 4 + random() * 7, angle = random() * Math.PI;
      const endX = position.x + Math.cos(angle) * length * .5, endZ = z + Math.sin(angle) * length * .5;
      const endT = THREE.MathUtils.clamp((shoreline(endZ) - endX) / coastWidth(endZ), 0, 1);
      const slope = (coastalElevation(endZ, endT) - position.y) / (length * .5);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(angle), slope, Math.sin(angle)).normalize());
      dummy.position.copy(position); dummy.position.y += .35;
      dummy.scale.set(.4 + random() * .35, length, .45);
    });
    // Sparse tufts only on the dry upper beach, never on the breaking surf.
    addInstances(new THREE.ConeGeometry(.65, 2.6, 3), this.material(0x929873), 240, i => {
      const cluster = Math.floor(i / 3), z = -172 + cluster / 80 * 340 + random() * 3;
      const t = .08 + .045 * Math.sin(cluster * 2.7) + random() * .035;
      dummy.position.copy(surface(z, t)); dummy.position.y += .65;
      dummy.scale.set(.5 + random() * .55, .45 + random() * .5, .6);
      dummy.rotation.set(0, random() * Math.PI, (random() - .5) * .4);
    });
  }

  private curve(points: Point[]) {
    return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  }

  private roadSurface(points: Point[], width: number, color: number) {
    const curve = this.curve(points);
    const vertices: number[] = [], indices: number[] = [];
    const n = Math.max(30, Math.ceil(curve.getLength() / 2));
    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n), tangent = curve.getTangent(i / n);
      for (const sign of [-1, 1]) {
        const edgeWidth = width * (0.97 + Math.sin(i * 0.47) * 0.045);
        const x = p.x - tangent.z * edgeWidth * sign / 2, z = p.z + tangent.x * edgeWidth * sign / 2;
        vertices.push(x, elevation(x, z) + 0.17, z);
      }
      if (i < n) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const surface = this.material(color); surface.side = THREE.DoubleSide;
    this.canopySunlight.attach(surface);
    const road = this.mesh(geo, surface, [0, 0, 0]); road.castShadow = false;
    return curve;
  }

  private buildRoads() {
    this.scene.add(this.roadOverlay);
    for (const road of roadPaths) {
      const paved = road.id === "ROAD_main_street" || road.id === "ROAD_old_coast_road";
      const drive = road.id.includes("station_") || road.id === "ROAD_holt_lane";
      const width = paved ? 8 : drive ? 5 : 2.3;
      const curve = this.roadSurface(road.points, width, paved ? 0x8a9090 : drive ? 0xa9aa96 : 0x969f86);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(120).map(p => new THREE.Vector3(p.x, elevation(p.x, p.z) + 0.7, p.z))), new THREE.LineDashedMaterial({ color: 0xf2d8a1, dashSize: 2.4, gapSize: 2, transparent: true, opacity: 0.85 }));
      line.computeLineDistances(); this.roadOverlay.add(line);
      if (paved) {
        const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.03, 2.2), this.material(0xcbbd8e), 16);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < 16; i++) {
          const p = curve.getPoint((i + 0.5) / 16), t = curve.getTangent((i + 0.5) / 16);
          dummy.position.set(p.x, elevation(p.x, p.z) + 0.22, p.z); dummy.rotation.y = Math.atan2(t.x, t.z); dummy.updateMatrix(); stripes.setMatrixAt(i, dummy.matrix);
        }
        this.scene.add(stripes);
      }
    }
    this.roadOverlay.visible = false;
    this.roadSurface([[135, -135], [118, -108], [107, -83], [98, -66], [84, -42]], 2.7, 0x718e85);
  }

  private building(x: number, z: number, width: number, depth: number, height: number, color: number, roofColor: number, angle = 0, gable = true) {
    const group = new THREE.Group();
    const samples = [-1,1].flatMap(sx => [-1,1].map(sz => {
      const dx=sx*width/2, dz=sz*depth/2;
      return elevation(x+dx*Math.cos(angle)+dz*Math.sin(angle),z-dx*Math.sin(angle)+dz*Math.cos(angle));
    }));
    const base = Math.max(elevation(x,z), ...samples);
    group.position.set(x, base, z); group.rotation.y = angle; this.scene.add(group);
    this.buildingFootprints.push({ x,z,radius:Math.hypot(width,depth)/2 });
    const footing = base - Math.min(...samples) + 0.9;
    this.mesh(new THREE.BoxGeometry(width + 0.7, footing, depth + 0.7), this.material(0xb9b7b2, "rock"), [0, 0.4-footing/2, 0], group);
    const paint = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.14);
    this.mesh(new THREE.BoxGeometry(width, height, depth), this.material(paint.getHex(), "wood"), [0, height / 2 + 0.4, 0], group);
    const roofPaint = new THREE.Color(roofColor).lerp(new THREE.Color(0xffffff), 0.32);
    const roofMat = this.material(roofPaint.getHex(), "roof");
    if (gable) {
      const rise = width * 0.29, half = width / 2 + 0.7;
      const slope = Math.atan2(rise, half), length = Math.hypot(rise,half);
      for (const side of [-1,1]) {
        const panel=this.mesh(new THREE.BoxGeometry(length,0.32,depth+1.5),roofMat,[side*half/2,height+0.6+rise/2,0],group);
        panel.rotation.z=-side*slope;
      }
      const shape=new THREE.Shape(); shape.moveTo(-width/2,0); shape.lineTo(width/2,0); shape.lineTo(0,rise); shape.closePath();
      const face=new THREE.ShapeGeometry(shape);
      const uv=face.attributes.uv;
      for(let i=0;i<uv.count;i++) uv.setXY(i,(uv.getX(i)+width/2)/width,uv.getY(i)/rise);
      for(const side of [-1,1]) {
        const cap=this.mesh(face,this.material(paint.getHex(),"wood"),[0,height+.4,side*depth/2],group);
        if(side<0) cap.rotation.y=Math.PI;
      }
    } else {
      this.mesh(new THREE.BoxGeometry(width+1.3,.65,depth+1.3),roofMat,[0,height+.75,0],group);
      // False storefront parapet breaks the repeated gable-house silhouette.
      this.mesh(new THREE.BoxGeometry(width,.95,.7),this.material(paint.getHex(),"wood"),[0,height+1.25,depth/2-.3],group);
    }
    const trim=this.material(0xd1cbbc);
    const lighted=Math.abs(Math.round(x*3+z))%4===0;
    for(const side of [-1,1]) {
      // Windows read as grouped painted openings, with only a few lights at night.
      for(const col of [-1,1]) {
        this.mesh(new THREE.BoxGeometry(width*.23,height*.22,.1),lighted&&side===1?this.litWindowMaterial:this.windowMaterial,[col*width*.23,height*.57,side*(depth/2+.08)],group);
      }
      this.mesh(new THREE.BoxGeometry(width+.25,.24,.34),trim,[0,height*.39,side*(depth/2+.12)],group);
      this.mesh(new THREE.BoxGeometry(width+.5,.25,.5),trim,[0,height+.15,side*(depth/2+.05)],group);
    }
    if(width<19 && depth<18 && Math.abs(Math.round(x+z))%3===0) {
      this.mesh(new THREE.BoxGeometry(1.3,2.3,1.6),this.material(0xb6a693,"rock"),[width*.25,height+width*.2+1,0],group);
    }
    return group;
  }

  private buildTown() {
    const random = seededRandom(1889);
    const palette = [0xc5bda5, 0xa9b2a4, 0x819496, 0xcac4b4, 0xb49a8b, 0x91a5ac];
    const roofs = [0x9a9188, 0xa66f58, 0x839395, 0x85888e];
    const main = this.curve(roadPaths.find(r => r.id === "ROAD_main_street")!.points);
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
      const p = main.getPoint((i + 0.4) / 7);
      this.building(p.x + side * 15, p.z, 13, 9 + random() * 4, 6 + random() * 5, palette[(i + (side + 1)) % palette.length], roofs[i % roofs.length], 0.12, i % 3 !== 0);
      const sidewalk = this.mesh(new THREE.BoxGeometry(4, 0.2, 13), this.material(0xb1b0a0), [p.x + side * 6.6, elevation(p.x + side * 6.6, p.z) + 0.18, p.z]); sidewalk.castShadow = false;
    }
    for (let i = 0; i < 16; i++) {
      const x = 40 + (i % 4) * 18, z = 15 + Math.floor(i / 4) * 24;
      this.building(x, z, 8 + random() * 3, 9 + random() * 3, 5 + random() * 3, palette[i % palette.length], roofs[i % roofs.length], -0.05, true);
    }
    for (let i = 0; i < 10; i++) {
      const x = -46 - random() * 15, z = 10 + i * 9;
      if (x > shoreline(z) + 20) this.building(x, z, 8, 7, 5 + random() * 2, palette[i % palette.length], roofs[i % roofs.length], 0.16);
    }
    this.building(72, -18, 16, 12, 7, 0xc0b69b, 0x727b77, -0.12);
    this.building(38, 109, 11, 10, 6, 0x98acac, 0x767673, 0.1);
    this.building(-99, 155, 9, 7, 4.7, 0xb6b09c, 0x747976, -0.3);
    // Roadside motel and its long, low roof; the pool remains an overview shape.
    this.building(-34, -99, 10, 35, 5, 0xbfb093, 0x8f7164, -0.16, false);
    this.building(-16, -116, 23, 9, 5, 0xbfb093, 0x8f7164, -0.16, false);
    this.mesh(new THREE.BoxGeometry(10, 0.18, 17), this.material(0x869d98), [-14, elevation(-14, -97) + 0.25, -97]);
    const poleMat = this.material(0x696857);
    for (let i = 0; i < 9; i++) {
      const p = main.getPoint(i / 9), y = elevation(p.x + 8, p.z);
      this.mesh(new THREE.CylinderGeometry(0.18, 0.24, 12, 5), poleMat, [p.x + 8, y + 6, p.z]);
      this.mesh(new THREE.BoxGeometry(3.2, 0.25, 0.25), poleMat, [p.x + 8, y + 11.5, p.z]);
      if (i > 0) {
        const prev = main.getPoint((i - 1) / 9);
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(prev.x + 8, elevation(prev.x + 8, prev.z) + 11.5, prev.z), new THREE.Vector3((prev.x + p.x) / 2 + 8, y + 10, (prev.z + p.z) / 2), new THREE.Vector3(p.x + 8, y + 11.5, p.z));
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(10)), new THREE.LineBasicMaterial({ color: 0x5d645c, transparent: true, opacity: 0.65 })));
      }
    }
  }

  private buildLandmarks() {
    const wood = this.material(0xc0b6a3, "wood");
    const z = 132, start = shoreline(z) + 7;
    const length = coastWidth(z) + 45, deck = elevation(start, z) + 1.2;
    // One continuous pier, with a modest wider landing at its seaward end.
    this.mesh(new THREE.BoxGeometry(length, 1.1, 6), wood, [start - length / 2, deck, z]);
    this.mesh(new THREE.BoxGeometry(12, 1.1, 9), wood, [start - length + 6, deck, z]);
    for (let j = 0; j < 12; j++) for (const side of [-1, 1]) {
      const x = start - length + 3 + j * (length - 6) / 11;
      this.mesh(new THREE.CylinderGeometry(.35, .45, deck + 3.6, 5), wood, [x, (deck - .4) / 2, z + side * 2.9]);
    }
    for (const side of [-1, 1]) this.mesh(new THREE.BoxGeometry(length - 14, .25, .25), wood, [start - (length - 14) / 2, deck + 1.65, z + side * 2.9]);
    const seams: THREE.Vector3[] = [];
    for (let x = start - length + .7; x < start; x += 1.25) {
      const halfWidth = x < start - length + 12 ? 4.4 : 2.9;
      seams.push(new THREE.Vector3(x, deck + .56, z - halfWidth), new THREE.Vector3(x, deck + .56, z + halfWidth));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seams), new THREE.LineBasicMaterial({color: 0x827e70, transparent: true, opacity: .4})));
    for (const side of [-1, 1]) {
      const boatX = start - length + 12 + (side + 1) * 5;
      const boat = this.mesh(new THREE.SphereGeometry(1, 8, 5), this.material(side > 0 ? 0xb4a08c : 0xd2c8aa), [boatX, .3, z + side * 8]);
      boat.scale.set(5.8, 1.4, 1.8);
      this.mesh(new THREE.BoxGeometry(2.8, 2, 2), this.material(0xc1bca6), [boatX + 1, 1.4, z + side * 8]);
    }
    const [dx, dz] = landmarks.find(l => l.id === "SCN_dock")!.position;
    this.building(dx + 10, dz + 3, 10, 22, 6, 0x959e92, 0x667b78, Math.PI / 2);
    const [lx, lz] = landmarks.find(l => l.id === "SCN_lighthouse_cliff")!.position;
    const ly = elevation(lx, lz);
    this.mesh(new THREE.CylinderGeometry(7, 9, 1.2, 16), this.material(0xa39b83), [lx, ly + 0.4, lz]);
    this.mesh(new THREE.CylinderGeometry(3, 4.6, 23, 12), this.material(0xe4ddcb, "wood"), [lx, ly + 12, lz]);
    this.mesh(new THREE.CylinderGeometry(4.3, 4.3, 1, 12), this.material(0x6c7873), [lx, ly + 23.5, lz]);
    const lantern = this.mesh(new THREE.CylinderGeometry(2.8, 2.8, 4.6, 10), this.beaconGlass, [lx, ly + 26, lz]);
    // The lantern enclosure transmits the beacon's light instead of shadowing it.
    lantern.castShadow = false;
    this.mesh(new THREE.ConeGeometry(4, 3, 12), this.material(0x6e7975), [lx, ly + 29.3, lz]);
    this.building(lx + 11, lz + 4, 11, 9, 5, 0xc3c0a6, 0x7a7468, -0.35);
    this.buildLocalLights(lx, ly, lz);
    const [sx, sz] = landmarks.find(l => l.id === "SCN_sawmill")!.position;
    this.building(sx, sz, 27, 17, 9, 0x8c8772, 0x807264, -0.2);
    this.mesh(new THREE.CylinderGeometry(2, 7, 17, 12), this.material(0x967665), [sx + 20, elevation(sx + 20, sz) + 8.5, sz]);
    for (let i = 0; i < 5; i++) {
      const log = this.mesh(new THREE.CylinderGeometry(1, 1, 15, 7), this.material(0x8a7760), [sx - 12, elevation(sx - 12, sz + 18) + 1 + i * 0.15, sz + 15 + i * 2]); log.rotation.z = Math.PI / 2;
    }
    const [rx, rz] = landmarks.find(l => l.id === "SCN_station_yard")!.position;
    this.mesh(new THREE.BoxGeometry(54, 1, 37), this.material(0x929a91), [rx, elevation(rx, rz) + 0.3, rz]);
    this.building(rx + 3, rz - 3, 29, 15, 8, 0xb0b8a8, 0x778b86, 0, false);
    const dome = this.mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.material(0xd4d3bd), [rx + 4, elevation(rx + 4, rz) + 9, rz - 3]); dome.castShadow = true;
    this.mesh(new THREE.CylinderGeometry(0.4, 0.7, 26, 5), this.material(0x77877f), [rx - 15, elevation(rx - 15, rz) + 13, rz]);
    for (let i = 0; i < 2; i++) this.mesh(new THREE.BoxGeometry(10 - i * 3, 0.3, 0.3), this.material(0x77877f), [rx - 15, elevation(rx - 15, rz) + 21 + i * 3, rz]);
    const fenceMaterial = this.material(0x87968d);
    for (let i = 0; i < 18; i++) this.mesh(new THREE.BoxGeometry(0.3, 3, 0.3), fenceMaterial, [-14 + i * 5.4, elevation(-14 + i * 5.4, -282) + 1.5, -282]);
  }

  private buildLocalLights(x: number, y: number, z: number) {
    this.beacon.position.set(x, y + 26, z);
    this.beacon.castShadow = true;
    this.beacon.shadow.mapSize.set(512, 512);
    this.beacon.shadow.camera.near = 0.5;
    this.beacon.shadow.bias = -0.001;
    this.beacon.shadow.normalBias = 0.12;
    this.porchLight.position.set(x + 9, elevation(x + 9, z + 11) + 4, z + 11);
    this.porchLight.castShadow = true;
    this.porchLight.shadow.mapSize.set(256, 256);
    this.porchLight.shadow.camera.near = 0.2;
    this.porchLight.shadow.bias = -0.001;
    this.porchLight.shadow.normalBias = 0.08;
    const [dx, dz] = landmarks.find(l => l.id === "SCN_dock")!.position;
    this.harborLight.position.set(dx + 6, elevation(dx + 6, dz + 11) + 5.5, dz + 11);
    this.scene.add(this.beacon, this.porchLight, this.harborLight);
    for (const light of [this.porchLight, this.harborLight]) {
      const bulb = this.mesh(new THREE.SphereGeometry(0.45, 8, 6), this.lampGlass, light.position.toArray());
      bulb.castShadow = false;
      this.mesh(new THREE.CylinderGeometry(0.1, 0.16, 4, 6), this.material(0x626b6b), [light.position.x, light.position.y - 2.5, light.position.z]);
    }
    // A small world-space halo, not a full-screen bloom or a second light source.
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,240,196,.8)");
    glow.addColorStop(0.2, "rgba(255,220,155,.35)");
    glow.addColorStop(1, "rgba(255,209,135,0)");
    context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
    this.beaconHalo = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const halo = new THREE.Sprite(this.beaconHalo);
    halo.position.set(x, y + 26, z); halo.scale.set(13, 13, 1); this.scene.add(halo);
  }

  private buildForest() {
    const trees = makeForestLayout();
    this.canopySunlight.setTrees(trees);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    // The fixed overview camera permits upright painted cards without turn-to-
    // camera animation. Instancing preserves depth and keeps forest draw calls low.
    const facing = Math.atan2(-398, 487);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    for (let variant = 0; variant < 4; variant++) {
      const points = trees.filter(p => p.variant === variant);
      const map = this.art.trees[variant];
      const material = new THREE.MeshStandardMaterial({
        map, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 1,
        emissiveIntensity: 0,
      });
      lightPaintedFoliage(material);
      const cards = new THREE.InstancedMesh(geometry, material, points.length);
      points.forEach((p, i) => {
        dummy.position.set(p.x, elevation(p.x, p.z) - 0.5, p.z);
        dummy.rotation.set(0, facing + (p.tint - 0.5) * 0.2, 0);
        dummy.scale.set(p.width, p.height, 1);
        dummy.updateMatrix(); cards.setMatrixAt(i, dummy.matrix);
        color.set(0xe0e4d5).lerp(new THREE.Color(0xa2beb7), p.grove * 0.32 + p.tint * 0.2);
        cards.setColorAt(i, color);
      });
      cards.castShadow = true; cards.receiveShadow = true;
      this.scene.add(cards);
    }
    // Town edge trees share the same brush language, with footprints left clear.
    const random = seededRandom(1885), townPoints: { x: number; z: number; h: number }[] = [];
    for (let i = 0; i < 150 && townPoints.length < 35; i++) {
      const x = 24 + random() * 116, z = random() * 140;
      if (distanceToRoad([x,z]) < 6 || this.buildingFootprints.some(b => Math.hypot(x-b.x,z-b.z) < b.radius+3)) continue;
      townPoints.push({x,z,h:12+random()*9});
    }
    const mat = new THREE.MeshStandardMaterial({ map: this.art.trees[3], alphaTest: 0.38, side: THREE.DoubleSide, roughness: 1 });
    lightPaintedFoliage(mat);
    const edgeTrees = new THREE.InstancedMesh(geometry, mat, townPoints.length);
    townPoints.forEach((p,i) => {
      dummy.position.set(p.x,elevation(p.x,p.z),p.z); dummy.rotation.set(0,facing,0); dummy.scale.set(p.h*.8,p.h,1); dummy.updateMatrix(); edgeTrees.setMatrixAt(i,dummy.matrix);
    });
    edgeTrees.castShadow = true; this.scene.add(edgeTrees);
    this.host.dataset.treeCount = String(trees.length + townPoints.length);
  }

  private buildLabels() {
    for (const landmark of locations) {
      const [x, z] = landmark.position;
      const point = new THREE.Vector3(x, elevation(x, z) + (landmark.id === "SCN_lighthouse_cliff" ? 36 : 23), z);
      const button = document.createElement("button");
      button.type = "button"; button.className = "gh-map-label";
      const name = document.createElement("span"); name.textContent = landmark.name;
      const subtitle = document.createElement("small"); subtitle.textContent = landmark.english;
      button.append(name, subtitle); button.setAttribute("aria-label", "查看" + landmark.name);
      button.addEventListener("click", () => this.options.onSelect(landmark.id), { signal: this.abort.signal });
      this.labelHost.appendChild(button);
      this.labels.push({ id: landmark.id, button, point, major: !!landmark.label });
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 25, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, elevation(x, z) + 10, z); hit.userData.locationId = landmark.id;
      this.scene.add(hit); this.hits.push(hit);
    }
  }

  setAtmosphere(mode: LightMode, fog: number) {
    this.fogAmount = fog;
    const p = lightPresets[mode];
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.Fog(p.sky, 880 - fog * 470, 2900 - fog * 1750);
    this.sun.color.set(p.sun); this.sun.intensity = p.direct;
    this.sun.position.fromArray(p.position);
    this.ambient.intensity = p.ambient; this.ambient.color.set(p.fill); this.ambient.groundColor.set(p.bounce);
    this.windowMaterial.color.set(mode === "bluehour" ? 0x354756 : 0x607478);
    this.litWindowMaterial.emissiveIntensity = mode === "bluehour" ? 1.5 : mode === "sunset" ? 0.24 : 0;
    this.beacon.intensity = p.beacon; this.porchLight.intensity = p.porch; this.harborLight.intensity = p.harbor;
    this.beaconGlass.emissiveIntensity = p.glow;
    this.lampGlass.emissiveIntensity = mode === "afternoon" ? 0 : p.glow;
    this.beaconHalo.opacity = mode === "afternoon" ? 0.08 : mode === "sunset" ? 0.3 : 0.55;
    const towardSun = new THREE.Vector3().subVectors(this.sun.position, this.sun.target.position).normalize();
    this.canopySunlight.update(towardSun, p.dapple * (1 - fog * 0.55));
    this.water.uniforms.uSunDirection.value.copy(towardSun); this.water.uniforms.uSunColor.value.set(p.sun);
    this.water.uniforms.uColor.value.set(p.water); this.water.uniforms.uLight.value.set(p.sky); this.water.uniforms.uFog.value = fog;
    this.renderer.toneMappingExposure = p.exposure;
    // Geometry and lighting remain static between explicit preview changes.
    if (this.lightMode !== mode) this.renderer.shadowMap.needsUpdate = true;
    this.lightMode = mode;
  }

  setLabels(visible: boolean) { this.labelVisible = visible; }
  setRoads(visible: boolean) { this.roadOverlay.visible = visible; }
  zoomBy(factor: number) { this.focusZoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.controls.minZoom, this.controls.maxZoom); }
  reset() {
    this.focusTarget = new THREE.Vector3(38, 9, -57); this.focusZoom = 1;
    this.select(null);
  }
  select(id: string | null, navigate = true) {
    this.selectedId = id;
    const landmark = landmarks.find(l => l.id === id);
    this.ring.visible = !!landmark;
    for (const label of this.labels) label.button.classList.toggle("is-selected", label.id === id);
    if (!landmark) return;
    const [x, z] = landmark.position, y = elevation(x, z);
    this.ring.position.set(x, y + 0.7, z);
    if (navigate) { this.focusTarget = new THREE.Vector3(x, y, z); this.focusZoom = 2.35; }
  }

  private cancelFocus = () => { this.focusTarget = null; this.focusZoom = null; };
  private pointerDown = (e: PointerEvent) => { this.pointerStart = { x: e.clientX, y: e.clientY }; };
  private pointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) > 5) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects(this.hits, false)[0];
    if (hit) this.options.onSelect(hit.object.userData.locationId as string);
  };
  private contextLost = (e: Event) => { e.preventDefault(); this.options.onError("图形显示已中断，请重新载入地图。地点文字仍可查看。"); };
  private resize = () => {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    this.canvasSize = { width, height };
    const aspect = width / height, half = 262;
    this.camera.left = -half * aspect; this.camera.right = half * aspect;
    this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  };

  private animate = (time: number) => {
    if (this.disposed) return;
    const frameMs = time - this.lastTime;
    const hadPreviousFrame = this.lastTime > 0;
    const dt = Math.min(frameMs / 1000, 0.05); this.lastTime = time;
    if (!document.hidden) {
      if (!this.reducedMotion) this.progress += dt;
      if (this.focusTarget) {
        const step = new THREE.Vector3().subVectors(this.focusTarget, this.controls.target).multiplyScalar(this.reducedMotion ? 1 : 1 - Math.exp(-dt * 4));
        this.controls.target.add(step); this.camera.position.add(step);
        if (step.length() < 0.01) this.focusTarget = null;
      }
      if (this.focusZoom !== null) {
        this.camera.zoom = this.reducedMotion ? this.focusZoom : THREE.MathUtils.damp(this.camera.zoom, this.focusZoom, 5, dt);
        if (Math.abs(this.camera.zoom - this.focusZoom) < 0.003) { this.camera.zoom = this.focusZoom; this.focusZoom = null; }
        this.camera.updateProjectionMatrix();
      }
      this.controls.update();
      this.updateWater(this.progress);
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      // Resolve screen-space overlaps, prioritizing the selected location.
      const orderedLabels = [...this.labels].sort((a, b) => Number(b.id === this.selectedId) - Number(a.id === this.selectedId));
      for (const label of orderedLabels) {
        const p = label.point.clone().project(this.camera);
        const selected = label.id === this.selectedId;
        const show = this.labelVisible && (label.major || this.camera.zoom > 1.75 || selected) && Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.84 && p.z < 1;
        label.button.hidden = !show;
        if (show) {
          const x = (p.x + 1) * 0.5 * this.canvasSize.width, y = (1 - p.y) * 0.5 * this.canvasSize.height;
          const w = label.button.offsetWidth, h = label.button.offsetHeight;
          const box = { x: x - w / 2, y: y - h, w, h };
          const overlap = occupied.some(other => box.x < other.x + other.w + 8 && box.x + w + 8 > other.x && box.y < other.y + other.h + 8 && box.y + h + 8 > other.y);
          label.button.hidden = overlap;
          if (!overlap) { occupied.push(box); label.button.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; }
        }
      }
      this.options.onZoom(this.camera.zoom);
      this.renderer.render(this.scene, this.camera);
      if (hadPreviousFrame && frameMs > 0) { this.metricFrames++; this.metricFrameTimes.push(frameMs); }
      if (time - this.metricsStart >= 1500) {
        const samples = this.metricFrameTimes.sort((a,b) => a-b);
        this.host.dataset.renderStats = JSON.stringify({
          frames: this.metricFrames, frameMs: samples[Math.floor(samples.length*.5)] ?? 0,
          p95Ms: samples[Math.floor(samples.length*.95)] ?? 0,
          calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
          textures: this.renderer.info.memory.textures, geometries: this.renderer.info.memory.geometries,
          textureMiBEstimate: +((this.art.estimatedTextureBytes + (1024*1024 + 64*64)*4*4/3) / 1048576).toFixed(2),
          shadowMapMiBEstimate: +([this.sun, this.beacon, this.porchLight].reduce((bytes, light) => {
            const map = light.shadow.map;
            // RGBA8 colour + 32-bit depth; estimate excludes driver overhead.
            return bytes + (map ? map.width * map.height * 8 : 0);
          }, 0) / 1048576).toFixed(2),
        });
        this.metricsStart=time; this.metricFrames=0; this.metricFrameTimes=[];
      }
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.abort.abort(); this.observer.disconnect();
    this.controls.removeEventListener("start", this.cancelFocus); this.controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) for (const mat of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(mat);
    });
    for (const material of this.materialCache.values()) materials.add(material);
    materials.add(this.windowMaterial); materials.add(this.litWindowMaterial);
    for (const geo of geometries) geo.dispose(); for (const mat of materials) mat.dispose(); for (const texture of this.textures) texture.dispose();
    this.sun.dispose(); this.beacon.dispose(); this.porchLight.dispose(); this.harborLight.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
    for (const label of this.labels) label.button.remove();
  }
}
