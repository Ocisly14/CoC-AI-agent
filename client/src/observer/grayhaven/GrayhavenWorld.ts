import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { beachAmount, coastalElevation, coastWidth, distanceToRoad, elevation, landmarks, locations, roadPaths, seededRandom, shoreline, waterline } from "./layout";
import type { Point } from "./layout";
import type { GrayhavenArt, Surface } from "./painterlyArt";
import { forestDensity, makeForestLayout } from "./forestLayout";
import { lightPaintedFoliage } from "./lighting";
import { patchMaterial } from "./lightingPatch";
import { toneMappingFromSearch } from "./globalIllumination";
import { createSoftShadowUniforms, softShadowPatch, updateSoftShadowUniforms } from "./softShadows";
import { ProceduralSky } from "./proceduralSky";
import { BAKE_LAYER, WorldLightAtlas } from "./worldLightAtlas";

import { architecturalUVs, createOverviewGlazing, isArchitectureSurface } from "./architectureMaterials";
import { mainStreetPlots } from "./mainStreet";
import moduleData from "./grayhaven.generated.json";
import { createCoastalWater } from "./waterDynamics";
import { createSeaMist } from "./seaMist";
import { createRoadLighting } from "./roadLighting";
import { createDepthReveal, type RevealTarget } from './depthReveal';
import { BEACH_VIEW, createBeachScene } from "./beachScene";
import { createRedwoodRingScene } from './redwoodRingScene';
import { REDWOOD_VIEW, REDWOOD_TREES } from './redwoodRingLayout';
import { BLUEBIRD, SHERIFF, CLOSED_INTERIOR, isBluebird, buildingForRoom, interiorBuilding, interiorFrame, type BuildingId, roomFloor, projectedBuilding, cutawayDecision, interiorRevealTarget, type InteriorState } from './buildingInteriors';
import { createBluebirdShadowShell, exteriorWallGeometry } from './bluebirdShell';
import { createInteriorLighting } from './interiorLighting';
import type { BluebirdInterior } from './bluebirdInterior';
import { createSheriffShadowShell } from './sheriffShell';

import { normalizeHour, sampleDaylight, lightingRefresh } from "./daylight";
export type WorldOptions = { initialHour?: number; onSelect: (id: string) => void; onZoom: (zoom: number) => void; onError: (message: string) => void; onInterior?: (state: InteriorState) => void; onTime?: (hour: number) => void };

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
  private signTextureBytes = 0;
  private sun = new THREE.DirectionalLight(0xffe0ad, 3.0);
  private ambient = new THREE.HemisphereLight(0xc9dedc, 0x6f7460, 2.2);
  private lightAtlas = new WorldLightAtlas();
  private sky!: ProceduralSky;
  private softShadowUniforms = createSoftShadowUniforms();
  private softShadow = softShadowPatch(this.softShadowUniforms);
  // PCSS only where the 3072 map is used; narrow screens keep three's PCF-soft lookup.
  private softShadows = window.innerWidth >= 900;
  private beacon = new THREE.PointLight(0xffdf9d, 0, 100, 2);
  private porchLight = new THREE.PointLight(0xffcd8b, 0, 26, 2);
  private harborLight = new THREE.PointLight(0xffd9a3, 0, 32, 2);
  private beaconGlass = new THREE.MeshStandardMaterial({ color: 0xc9d7d2, emissive: 0xffdc91, emissiveIntensity: 0.45, roughness: 0.38 });
  private lampGlass = new THREE.MeshStandardMaterial({ color: 0xe9dbc1, emissive: 0xffd49a, emissiveIntensity: 0, roughness: 0.5 });
  private beaconHalo!: THREE.SpriteMaterial;
  private water!: THREE.ShaderMaterial;
  private updateWater!: (time: number) => void;
  private labels: { id: string; button: HTMLElement; point: THREE.Vector3; major: boolean; building?: boolean; roofCorners?: THREE.Vector3[] }[] = [];
  private hits: THREE.Object3D[] = [];
  private roadOverlay = new THREE.Group();
  private glazing = createOverviewGlazing();
  private frostedGlazing = createOverviewGlazing(true);
  private windowMaterial = this.glazing.material;
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
  private seaMist = createSeaMist();
  private depthReveal = createDepthReveal();
  private roadLamps!: ReturnType<typeof createRoadLighting>;
  private beach!: ReturnType<typeof createBeachScene>;
  private redwoodRing!: ReturnType<typeof createRedwoodRingScene>;
  private dinerExterior!: THREE.Group;
  private dinerInverse = new THREE.Matrix4();
  private dinerLight!: ReturnType<typeof createInteriorLighting>;
  private dinerModel: BluebirdInterior | null = null;
  private dinerLoading: Promise<void> | null = null;
  private sheriffExterior!: THREE.Group;
  private sheriffInverse = new THREE.Matrix4();
  private sheriffLight!: ReturnType<typeof createInteriorLighting>;
  private sheriffModel: BluebirdInterior | null = null;
  private sheriffLoading: Promise<void> | null = null;
  private get activeBuilding() { return interiorBuilding(this.interiorState); }
  private get activeExterior() { return this.activeBuilding==='sheriff'?this.sheriffExterior:this.dinerExterior; }
  private get activeModel() { return this.activeBuilding==='sheriff'?this.sheriffModel:this.dinerModel; }
  private get activeInverse() { return this.activeBuilding==='sheriff'?this.sheriffInverse:this.dinerInverse; }
  private interiorState: InteriorState = { ...CLOSED_INTERIOR };
  private interiorRequest = 0;
  private candidateSince: number | null = null;
  private streetView: { target: THREE.Vector3; zoom: number } | null = null;
  private suppressAutoInterior = false;
  private interiorCloseZoom = 0;
  private fogAmount = 0.24;
  private dayHour=15;
  private timePlaying=false;
  private lightingDirty=true;
  private indirectDirty=true;
  private lastLightingUpdate=-Infinity;
  private lastIndirectUpdate=-Infinity;
  private lastTimeInput=-Infinity;
  private reportedMinute=-1;
  private progress = 0;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private raycaster = new THREE.Raycaster();
  private pointerStart = { x: 0, y: 0 };
  private canvasSize = { width: 1, height: 1 };

  constructor(private host: HTMLDivElement, private labelHost: HTMLDivElement, private options: WorldOptions, private art: GrayhavenArt) {
    for (const texture of art.textures) this.textures.add(texture);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = toneMappingFromSearch(window.location.search);
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute("aria-label", "灰港镇三维全局地图，可拖动和缩放");
    this.renderer.domElement.setAttribute("role", "img");
    host.appendChild(this.renderer.domElement);
    this.sky = new ProceduralSky(this.renderer);
    for (const glass of [this.glazing.material, this.frostedGlazing.material]) {
      this.attachLighting(glass);
    }
    this.attachLighting(this.litWindowMaterial);
    this.scene.background = new THREE.Color(0xb9c8c4);
    this.scene.fog = new THREE.Fog(0xb9c8c4, 1050, 3200);
    this.camera.position.set(-360, 360, 430);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(38, 9, -57);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.72;
    this.controls.maxZoom = 32;
    this.controls.zoomToCursor = true;
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
    // Shadow colour comes from the sky environment and ground bounce, not from leaked sun.
    this.sun.shadow.intensity = 1;
    this.sun.layers.enable(BAKE_LAYER.bounce); this.ambient.layers.enable(BAKE_LAYER.bounce);
    this.scene.add(this.sun, this.sun.target, this.ambient);
    this.buildLandscape();
    this.buildRoads();
    this.buildTown();
    this.buildLandmarks();
    this.roadLamps=createRoadLighting((color,surface)=>this.material(color,surface),this.beaconHalo.map!);
    this.scene.add(this.roadLamps.root);
    this.buildForest();
    this.buildLabels();
    // Static occlusion bake needs every building, rock, pier and tree proxy in place.
    this.depthReveal.withoutReveal(() => this.lightAtlas.bakeStatic(this.renderer, this.scene));
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
    for(const light of [this.sun,this.beacon,this.porchLight]) {
      light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;
    }
    this.setAtmosphere(this.options.initialHour??15, this.fogAmount);
    this.animate(0);
  }

  private material(color: THREE.ColorRepresentation, surface?: Surface) {
    const key = String(color) + ":" + (surface ?? "plain");
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({
      color, map: surface ? this.art.surfaces[surface] : null,
      roughness: surface === "metalRoof" ? .57 : surface === "clapboard" ? .78 : .93,
      metalness: surface === "metalRoof" ? .42 : 0,
      bumpMap: isArchitectureSurface(surface) ? this.art.surfaces[surface] : null,
      bumpScale: surface === "metalRoof" ? .055 : .035,
      // Non-luminous surfaces receive their fill from the cool hemisphere.
      emissiveIntensity: 0,
    });
    if (isArchitectureSurface(surface)) material.userData.architectureSurface = surface;
    this.attachLighting(material);
    this.materialCache.set(key, material);
    return material;
  }

  /** Every lit surface reads the world light atlas; shadow receivers get PCSS. */
  private attachLighting(material: THREE.MeshStandardMaterial) {
    patchMaterial(material, this.lightAtlas.patch);
    if (this.softShadows) patchMaterial(material, this.softShadow);
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], parent: THREE.Object3D = this.scene) {
    const surface = material.userData.architectureSurface;
    if (isArchitectureSurface(surface)) architecturalUVs(geometry, surface, position);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(position[0], position[1], position[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    object.layers.enable(BAKE_LAYER.occluder); object.layers.enable(BAKE_LAYER.bounce);
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
    this.attachLighting(groundMaterial);
    const ground = this.mesh(geometry, groundMaterial, [0, 0, 0]);
    ground.castShadow = true; ground.layers.enable(BAKE_LAYER.ground);

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
    this.attachLighting(cliffMat);
    const cliff = this.mesh(cliffs, cliffMat, [0, 0, 0]);
    // Cliffs throw long shadows across the beach at sunset and define terrain height for the bake.
    cliff.castShadow = true; cliff.layers.enable(BAKE_LAYER.ground);

    const water = createCoastalWater();
    this.water = water.material;
    this.updateWater = water.update;
    water.mesh.layers.enable(BAKE_LAYER.bounce);
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
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.layers.enable(BAKE_LAYER.occluder); rocks.layers.enable(BAKE_LAYER.bounce); this.scene.add(rocks);
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
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(BAKE_LAYER.occluder); mesh.layers.enable(BAKE_LAYER.bounce);
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
    this.attachLighting(surface);
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
        stripes.layers.enable(BAKE_LAYER.bounce);
        this.scene.add(stripes);
      }
    }
    this.roadOverlay.visible = false;
    this.roadSurface([[135, -135], [118, -108], [107, -83], [98, -66], [84, -42]], 2.7, 0x718e85);
  }

  private building(x: number, z: number, width: number, depth: number, height: number, color: number, roofColor: number, angle = 0, gable = true, genericDetails = true) {
    const group = new THREE.Group();
    const samples = [-1,1].flatMap(sx => [-1,1].map(sz => {
      const dx=sx*width/2, dz=sz*depth/2;
      return elevation(x+dx*Math.cos(angle)+dz*Math.sin(angle),z-dx*Math.sin(angle)+dz*Math.cos(angle));
    }));
    const base = Math.max(elevation(x,z), ...samples);
    group.position.set(x, base, z); group.rotation.y = angle; this.scene.add(group);
    this.buildingFootprints.push({ x,z,radius:Math.hypot(width,depth)/2 });
    const footing = base - Math.min(...samples) + 0.9;
    this.mesh(new THREE.BoxGeometry(width + 0.7, footing, depth + 0.7), this.material(0xbcb9ad), [0, 0.4-footing/2, 0], group);
    const paint = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.14);
    this.mesh(new THREE.BoxGeometry(width, height, depth), this.material(paint.getHex(), "clapboard"), [0, height / 2 + 0.4, 0], group);
    const roofPaint = new THREE.Color(roofColor).lerp(new THREE.Color(0xffffff), 0.78);
    const roofMat = this.material(roofPaint.getHex(), gable ? "shingles" : "tarRoof");
    if (gable) {
      const rise = width * 0.29, half = width / 2 + 0.7;
      const slope = Math.atan2(rise, half), length = Math.hypot(rise,half);
      for (const side of [-1,1]) {
        const panelGeometry = new THREE.BoxGeometry(length,0.32,depth+1.5);
        panelGeometry.userData.roofSlopeAxis = "x";
        const panel=this.mesh(panelGeometry,roofMat,[side*half/2,height+0.6+rise/2,0],group);
        panel.rotation.z=-side*slope;
      }
      const shape=new THREE.Shape(); shape.moveTo(-width/2,0); shape.lineTo(width/2,0); shape.lineTo(0,rise); shape.closePath();
      const face=new THREE.ShapeGeometry(shape);
      for(const side of [-1,1]) {
        const cap=this.mesh(face,this.material(paint.getHex(),"clapboard"),[0,height+.4,side*depth/2],group);
        if(side<0) cap.rotation.y=Math.PI;
      }
    } else {
      this.mesh(new THREE.BoxGeometry(width+1.3,.65,depth+1.3),roofMat,[0,height+.75,0],group);
      // False storefront parapet breaks the repeated gable-house silhouette.
      this.mesh(new THREE.BoxGeometry(width,.95,.7),this.material(paint.getHex(),"clapboard"),[0,height+1.25,depth/2-.3],group);
    }
    if (!genericDetails) return group;
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
      this.mesh(new THREE.BoxGeometry(1.3,2.3,1.6),this.material(0x967b69),[width*.25,height+width*.2+1,0],group);
    }
    return group;
  }

  private buildMainStreet() {
    const plots = mainStreetPlots();
    // Typography only: one shared atlas for six physical storefront signboards.
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    for (const plot of plots.filter(p => p.sign)) {
      const col = plot.signIndex! % 2, row = Math.floor(plot.signIndex! / 2);
      ctx.fillStyle = "#" + plot.accent.toString(16).padStart(6, "0");
      ctx.fillRect(col * 512, row * 128, 512, 128);
      ctx.fillStyle = plot.kind === "arcade" ? "#d0bcc0" : "#e0d8be";
      ctx.font = plot.kind === "arcade" ? "600 51px sans-serif" : "bold 46px Georgia";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(plot.sign!, col * 512 + 256, row * 128 + 64, 470);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4; this.textures.add(texture);
    this.signTextureBytes = 1024 * 512 * 4 * 4 / 3;
    const signMat = new THREE.MeshStandardMaterial({ map: texture, roughness: .95 });
    const neonMat = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xb2bbd4, emissiveIntensity: .65, roughness: .8 });
    const trim = this.material(0xe4e0d2); trim.roughness = .64;
    const boards = this.material(0xc5c1b7, "bareWood");
    for (const plot of plots) {
      const { width: w, depth: d, height: h } = plot;
      const group = new THREE.Group();
      const corners = [-1,1].flatMap(sx => [-1,1].map(sz => elevation(
        plot.center.x + sx*w/2*Math.cos(plot.angle) + sz*d/2*Math.sin(plot.angle),
        plot.center.z - sx*w/2*Math.sin(plot.angle) + sz*d/2*Math.cos(plot.angle))));
      const base = Math.max(...corners);
      group.position.set(plot.center.x, base, plot.center.z); group.rotation.y = plot.angle;
      this.scene.add(group);
      this.buildingFootprints.push({x:plot.center.x,z:plot.center.z,radius:Math.hypot(w,d)/2});
      group.userData.moduleSceneId = plot.kind === "vacant" ? undefined : plot.id;
      const front = d / 2;
      const box = (width: number, height: number, depth: number, mat: THREE.Material, x: number, y: number, z: number) =>
        this.mesh(new THREE.BoxGeometry(width, height, depth), mat, [x,y,z], group);
      const accent = this.material(plot.accent); accent.roughness = .66;
      const wall = this.material(plot.paint, "clapboard");
      const roofSurface = plot.kind === "grocery" || plot.kind === "repair" ? "metalRoof"
        : plot.kind === "diner" || plot.kind === "clinic" ? "shingles" : "tarRoof";
      const roof = this.material(new THREE.Color(plot.roof).lerp(new THREE.Color(0xffffff), .82).getHex(), roofSurface);
      const footing = base - Math.min(...corners) + .7;
      box(w+.5,footing,d+.5,this.material(0xbcb9ad),0,.4-footing/2,0);
      const roofForm = (width: number, depth: number, y: number, rise: number, centerZ = 0, hip = false) => {
        const ridge = hip ? Math.max(0,depth/2-width*.4) : depth/2;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position",new THREE.Float32BufferAttribute([
          -width/2,y,-depth/2, width/2,y,-depth/2, -width/2,y,depth/2, width/2,y,depth/2,
          0,y+rise,-ridge, 0,y+rise,ridge,
        ],3));
        const slopes = [0,5,4,0,2,5,1,5,3,1,4,5], ends = [0,4,1,2,3,5];
        geo.setIndex(hip ? [...slopes, ...ends] : slopes);
        const flat=geo.toNonIndexed(); flat.computeVertexNormals();
        this.mesh(flat,roof,[0,0,centerZ],group);
        if (!hip) {
          // Vertical gable ends are siding, never roofing shingles.
          geo.setIndex(ends);
          const caps=geo.toNonIndexed(); caps.computeVertexNormals();
          this.mesh(caps,wall,[0,0,centerZ],group);
        }
        geo.dispose();
      };
      if (plot.kind === "diner") {
        // Wide two-storey street block with a low rear kitchen wing.
        this.mesh(exteriorWallGeometry(w,h*.49,d),wall,[0,h*.245+.4,0],group);
        box(w-.4,h*.49-.25,.06,this.material(plot.paint,"boardBatten"),0,h*.245+.4,-front-.04);
        this.mesh(exteriorWallGeometry(w,h*.51,d*.6),wall,[0,h*.745+.4,d*.2],group);
        box(w+.7,.5,d*.4+.4,this.material(0xd5d5ce,"metalRoof"),0,h*.49+.7,-d*.3);
        roofForm(w+.8,d*.6+1,h+.45,1.8,d*.2);
      } else {
        if(plot.kind==='sheriff')this.mesh(exteriorWallGeometry(w,h,d),wall,[0,h/2+.4,0],group);
        else box(w,h,d,wall,0,h/2+.4,0);
        if (plot.kind === "clinic") roofForm(w+1.3,d+1.3,h+.4,3.8,0,true);
        else if (plot.kind === "repair") roofForm(w+.8,d+1,h+.4,2.7);
        else if (plot.kind === "grocery") {
          const shed=box(w+.7,.45,d+1,roof,0,h+1.25,0); shed.rotation.x=.08;
          const wedge=new THREE.Shape(); wedge.moveTo(-d/2,0); wedge.lineTo(d/2,0); wedge.lineTo(-d/2,1.8); wedge.closePath();
          const infill=this.mesh(new THREE.ExtrudeGeometry(wedge,{depth:w,bevelEnabled:false,steps:1}),wall,[w/2,h+.4,0],group);
          infill.rotation.y=-Math.PI/2;
        } else box(w+.7,.5,d+.7,roof,0,h+.65,0);
      }
      const parapet = plot.kind === "clinic" ? .35 : plot.kind === "arcade" ? 1.15 : 1.7;
      if (plot.kind !== "clinic") {
        box(w,parapet,.65,wall,0,h+.4+parapet/2,front-.15);
        box(w+.5,.25,.85,trim,0,h+.4+parapet,front-.15);
        if (plot.kind === "diner" || plot.kind === "sheriff") {
          const centralWidth=plot.kind === "sheriff" ? w*.36 : w*.64;
          box(centralWidth,1,.65,wall,0,h+parapet+.9,front-.15);
          box(centralWidth+.4,.22,.85,trim,0,h+parapet+1.45,front-.15);
        }
      }
      // Applied corner boards, sill and fascia: smooth painted joinery, not wall texture.
      // Joinery follows the built massing: the diner's rear wing is a single storey,
      // so its boards stop at the wing roof and the tall block starts its own set.
      const rearHeight = plot.kind === "diner" ? h*.49 : h;
      const step = plot.kind === "diner" ? -d*.1 : -front;
      for (const side of [-1,1]) {
        box(.3,h,.3,trim,side*(w/2-.1),h/2+.4,front-.02);
        box(.3,rearHeight,.3,trim,side*(w/2-.1),rearHeight/2+.4,-front+.02);
        if (step > -front) box(.3,h-rearHeight-.35,.3,trim,side*(w/2-.1),(h+rearHeight+.35)/2+.4,step+.02);
        box(.2,.3,d,trim,side*(w/2+.07),.65,0);
        box(.35,.3,front-step+.35,trim,side*(w/2+.06),h+.35,(front+step)/2);
        if (step > -front) box(.35,.3,front+step+.2,trim,side*(w/2+.06),rearHeight+.32,(step-front)/2-.1);
      }
      box(w+.35,.32,.65,trim,0,5.18,front+.2);
      box(w+.15,.18,.36,accent,0,4.92,front+.17);
      if (plot.kind !== "clinic") {
        box(w+.15,.28,.72,accent,0,h+parapet+.23,front-.05);
        box(w+.65,.14,.95,trim,0,h+parapet+.6,front-.12);
      }
      // Dark reveal + inset glazing + distinct casing. Opaque glass keeps LOD exterior-only.
      const framedWindow = (x: number, y: number, width: number, height: number, z: number, face = 1, sash = false) => {
        box(width+.32,height+.32,.18,trim,x,y,z);
        box(width,height,.1,this.windowMaterial,x,y,z+face*.12);
        box(width+.48,.18,.42,trim,x,y-height/2-.15,z+face*.1);
        if (sash) box(width,.12,.16,trim,x,y,z+face*.2);
      };
      const doorX = plot.kind === "diner" ? -w*.29 : plot.kind === "sheriff" ? 0 : w*.3;
      box(1.95,3.9,.13,this.material(0x414844),doorX,2.48,front+.075);
      box(1.5,3.5,.16,accent,doorX,2.4,front+.16);
      box(1.13,2.35,.07,plot.kind === "clinic" ? this.frostedGlazing.material : this.windowMaterial,doorX,2.83,front+.265);
      for (const side of [-1,1]) box(.15,3.95,.4,trim,doorX+side*.99,2.48,front+.22);
      box(2.14,.2,.45,trim,doorX,4.5,front+.23);
      box(.09,.38,.12,this.material(0xaea48b),doorX+.52,2.3,front+.34);
      box(2.1,.2,.9,this.material(0xc4c1b6),doorX,.5,front+.42);
      if (plot.kind === "sheriff") {
        for (const side of [-1,1]) framedWindow(side*w*.3,3.05,w*.21,2.4,front+.15,1,true);
        const star = new THREE.Shape();
        for (let i=0;i<10;i++) { const a=Math.PI/2+i*Math.PI/5,r=i%2?.24:.52;
          if (!i) star.moveTo(Math.cos(a)*r,Math.sin(a)*r); else star.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
        star.closePath(); this.mesh(new THREE.ShapeGeometry(star),this.material(0xc1a96f),[doorX,3.15,front+.32],group);
        box(1.6,1.45,.2,accent,w*.38,2.7,front+.4);
        box(1.3,1.15,.05,this.material(0xc7c0aa),w*.38,2.7,front+.52);
      } else {
        const windowX=doorX<0?w*.18:-w*.19, displayWidth=w*.43;
        framedWindow(windowX,2.85,displayWidth,2.55,front+.14);
        box(.14,2.65,.24,accent,windowX,2.85,front+.3);
        // Panelled bulkhead supports the display glass; transom admits light above it.
        box(displayWidth+.28,.92,.26,accent,windowX,.98,front+.19);
        const panelPaint = this.material(new THREE.Color(plot.accent).lerp(new THREE.Color(0xffffff), .16).getHex());
        for (const side of [-1,1]) box(displayWidth*.42,.62,.08,panelPaint,windowX+side*displayWidth*.25,.98,front+.36);
        framedWindow(windowX,4.54,displayWidth,.48,front+.14);
      }
      if (plot.floors === 2) {
        const columns=plot.kind === "diner" ? [-.32,0,.32] : plot.kind === "repair" ? [0] : [-.26,.26];
        const opening=plot.kind === "repair" ? w*.4 : w*.2, upperY=Math.max(8.1,h*.75);
        for (const column of columns) framedWindow(column*w,upperY,opening,2.2,front+.14,1,true);
        const rear=plot.kind === "diner" ? -d*.1 : -front;
        for(const x of [-w*.24,w*.24]) framedWindow(x,h*.76,w*.18,2.2,rear-.14,-1,true);
      }
      // Rear service elevations matter from the original coastal overview camera.
      framedWindow(-w*.22,3,w*.22,1.85,-front-.14,-1,true);
      if (plot.kind === "diner") {
        // The module's kitchen has no back door: a second window where the service door was.
        framedWindow(w*.275,2.95,1.9,1.9,-front-.14,-1,true);
        // Booth-side sash windows on the grocery side, matching the cutaway shell's wall gaps.
        for (const z of [1,4.35,7.7]) {
          box(.18,2.82,2.72,trim,-w/2-.14,2.95,z);
          box(.1,2.5,2.4,this.windowMaterial,-w/2-.26,2.95,z);
          box(.42,.18,2.88,trim,-w/2-.24,1.55,z);
          box(.16,.12,2.4,trim,-w/2-.34,2.95,z);
        }
      } else box(1.45,3.1,.16,accent,w*.27,2,-front-.14);
      box(w+.25,.22,.4,trim,0,rearHeight+.15,-front-.08);
      if (step > -front) box(w+.25,.22,.4,trim,0,h+.15,step-.08);
      if (plot.signIndex !== undefined) {
        const geo = new THREE.PlaneGeometry(w*.86, 1.45), uv = geo.attributes.uv;
        const col = plot.signIndex % 2, row = Math.floor(plot.signIndex / 2);
        for (let i=0;i<uv.count;i++) uv.setXY(i,(col+uv.getX(i))/2,1-(row+1)/4+uv.getY(i)/4);
        const sign = this.mesh(geo,plot.kind === "arcade" ? neonMat : signMat,[0,plot.floors===2?5.95:h+.95,front+(plot.kind === "arcade"?1.41:.51)],group);
        sign.castShadow=false;
      }
      if (plot.kind === "vacant") {
        for (let i=0;i<4;i++) box(w*.58,.49,.3,boards,-w*.14,1.9+i*.63,front+.42);
        const brace=box(.3,3.3,.23,trim,-w*.14,2.85,front+.62); brace.rotation.z=-.45;
        box(1.55,3,.25,boards,doorX,2.6,front+.43);
      }
      if (plot.kind === "diner") {
        // The module's bench: a short, paint-worn seat beside the door, not across it.
        box(2.2,.12,.6,boards,-1.75,.98,front+.75);
        box(2.2,.5,.16,boards,-1.75,1.35,front+.5);
        for (const x of [-2.6,-.9]) box(.18,.55,.55,accent,x,.68,front+.75);
        // Hand-painted open/closed board hanging in the door glass.
        box(.5,.3,.03,boards,doorX,2.35,front+.33);
      }
      if (plot.kind === "grocery") {
        box(1.1,1.7,.9,this.material(0x64869b),-w*.38,1.2,front+1.35);
        box(.8,.1,.95,this.material(0x405e73),-w*.38,1.6,front+1.35);
      }
      if (plot.kind === "repair") {
        // Opaque CRT-shaped colour blocks on the window surface, with no room geometry.
        for (let i=0;i<3;i++) { const x=-w*.32+i*w*.15;
          box(1,.8,.15,this.material(0x7e786b),x,2.3+(i%2)*.7,front+.36);
          box(.72,.52,.04,this.material(0x708584),x,2.3+(i%2)*.7,front+.46); }
      }
      if (plot.kind === "arcade") {
        box(w+.5,.8,1.6,accent,0,h+.7,front+.55);
        box(w*.88,.17,.2,this.material(0xa9bfc1),0,h+1.16,front+1.4);
      }
      if (plot.kind === 'diner') {
        this.dinerExterior=group; group.updateMatrixWorld(true);
        this.dinerInverse.copy(group.matrixWorld).invert();
        this.dinerLight=createInteriorLighting(this.art,this.dinerInverse,this.softShadows?this.softShadow:undefined);
        const physical=createBluebirdShadowShell(); physical.position.copy(group.position); physical.quaternion.copy(group.quaternion); physical.traverse(o=>o.layers.enable(BAKE_LAYER.bounce)); this.scene.add(physical);
        // This hollow shell is the single shadow caster in both exterior and cutaway views.
        group.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});
        const hit=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({visible:false}));
        hit.position.set(0,h/2,0); group.add(hit); hit.userData.locationId=plot.id; this.hits.push(hit);
      }
      if (plot.kind === 'sheriff') {
        this.sheriffExterior=group;group.updateMatrixWorld(true);
        this.sheriffInverse.copy(group.matrixWorld).invert();
        this.sheriffLight=createInteriorLighting(this.art,this.sheriffInverse,this.softShadows?this.softShadow:undefined,true);
        const physical=createSheriffShadowShell();physical.position.copy(group.position);physical.quaternion.copy(group.quaternion);
        physical.traverse(o=>o.layers.enable(BAKE_LAYER.bounce));this.scene.add(physical);
        group.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});
        const hit=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({visible:false}));
        hit.position.set(0,h/2,0);group.add(hit);hit.userData.locationId=plot.id;this.hits.push(hit);
      }
      if (plot.kind !== 'vacant') {
        // Anchor names to the built roof, not the module's street entrance coordinate.
        const roofBounds=new THREE.Box3().setFromObject(group);
        const point=new THREE.Vector3(group.position.x,roofBounds.max.y+.6,group.position.z);
        const label=document.createElement(plot.kind==='diner'||plot.kind==='sheriff'?'button':'span');
        label.className='gh-map-label gh-building-label';
        label.textContent=moduleData.locations.find(location=>location.id===plot.id)!.name.split('·')[0];
        if(label instanceof HTMLButtonElement) {
          label.type='button';label.setAttribute('aria-label','查看'+label.textContent);
          label.addEventListener('click',()=>this.options.onSelect(plot.id),{signal:this.abort.signal});
        }
        label.hidden=true;this.labelHost.appendChild(label);
        const roofCorners=[-1,1].flatMap(x=>[-1,1].map(z=>group.localToWorld(new THREE.Vector3(x*(w/2+.7),roofBounds.max.y-group.position.y+.6,z*(d/2+.7)))));
        this.labels.push({id:plot.id,button:label,point,major:false,building:true,roofCorners});
      }
      // A continuous, ground-following pavement links the separate shop entrances.
      const sidewalkPoints: Point[] = [-w/2,w/2].map(x => {
        const p=group.localToWorld(new THREE.Vector3(x,0,front+2.5)); return [p.x,p.z];
      });
      this.roadSurface(sidewalkPoints, 4.6, 0xb4b1a1);
      if (plot.kind === "clinic") {
        const p=group.localToWorld(new THREE.Vector3(-w*.42,0,front+2.6));
        const y=elevation(p.x,p.z);
        const trunk=this.mesh(new THREE.CylinderGeometry(.35,.65,6.4,6),this.material(0x817c68,"wood"),[p.x,y+3,p.z]);
        trunk.rotation.z=-.23;
        for (let i=0;i<3;i++) {
          const crown=this.mesh(new THREE.DodecahedronGeometry(2.6,1),this.material([0x899776,0x94a180,0xa5ad89][i],"ground"),[p.x+1+(i-1)*1.6,y+7+(i%2)*.8,p.z+(i-1)*.65]);
          crown.scale.set(1, .75, .9);
        }
      }
    }
  }

  private buildTown() {
    const random = seededRandom(1889);
    const palette = [0xc5bda5, 0xa9b2a4, 0x819496, 0xcac4b4, 0xb49a8b, 0x91a5ac];
    const roofs = [0x9a9188, 0xa66f58, 0x839395, 0x85888e];
    const main = this.curve(roadPaths.find(r => r.id === "ROAD_main_street")!.points);
    this.buildMainStreet();
    // Keep the coastal houses' seed sequence while replacing the sixteen-house
    // grid with six staggered homes. The backstreet and Reyes forecourt stay open.
    for (let i = 0; i < 28 + 16 * 3; i++) random();
    const neighborhood = [
      { x: 43, z: 16, width: 9, depth: 11, height: 5.6, angle: -.16 },
      { x: 73, z: 27, width: 11, depth: 10, height: 6.6, angle: .12 },
      { x: 100, z: 10, width: 8.5, depth: 12, height: 5.1, angle: -.07 },
      { x: 48, z: 54, width: 10, depth: 9, height: 6, angle: .21 },
      { x: 85, z: 62, width: 9, depth: 13, height: 5.3, angle: -.19 },
      { x: 108, z: 91, width: 11, depth: 10, height: 6.3, angle: .06 },
    ];
    neighborhood.forEach((p, i) => this.building(p.x, p.z, p.width, p.depth, p.height,
      palette[i % palette.length], roofs[i % roofs.length], p.angle));
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
    this.beach = createBeachScene((color, surface) => this.material(color, surface));
    this.scene.add(this.beach.root);
    this.beach.update(this.camera.zoom, this.progress);
    const redwoodBark = new THREE.MeshStandardMaterial({ map: this.art.sequoias[0], bumpMap: this.art.sequoias[0], bumpScale: .035, color: 0xb9aaa0, roughness: .94 });
    const redwoodCrown = new THREE.MeshStandardMaterial({ map: this.art.sequoias[0], alphaTest: .12, alphaToCoverage: true, side: THREE.DoubleSide, color: 0xe8e1d2, roughness: 1 });
    lightPaintedFoliage(redwoodCrown);
    const lightCrown = redwoodCrown.onBeforeCompile;
    redwoodCrown.onBeforeCompile = (shader, renderer) => {
      lightCrown(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(.38, .46, vMapUv.y);\n#include <alphatest_fragment>');
    };
    redwoodCrown.customProgramCacheKey = () => 'grayhaven-high-sequoia-crown-v1';
    this.attachLighting(redwoodBark); this.attachLighting(redwoodCrown);
    this.redwoodRing = createRedwoodRingScene((color, surface) => this.material(color, surface), redwoodBark, redwoodCrown);
    this.scene.add(this.redwoodRing.root); this.redwoodRing.update(this.camera.zoom);
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
    for (const light of [this.beacon, this.porchLight, this.harborLight]) light.layers.enable(BAKE_LAYER.bounce);
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
    this.lightAtlas.setTrees([...trees, ...REDWOOD_TREES.map(tree => ({ ...tree, width: tree.height * .38, crownWidth: tree.height * .28, sequoia: true }))]);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    // The fixed overview camera permits upright painted cards without turn-to-
    // camera animation. Instancing preserves depth and keeps forest draw calls low.
    const facing = Math.atan2(-398, 487);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    for (let variant = 0; variant < this.art.trees.length; variant++) {
      const points = trees.filter(tree => !tree.sequoia && tree.variant === variant);
      if (!points.length) continue;
      const map = this.art.trees[variant];
      const material = new THREE.MeshStandardMaterial({
        map, alphaTest: .12, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1,
        emissiveIntensity: 0,
      });
      lightPaintedFoliage(material);
      this.attachLighting(material);
      const cards = new THREE.InstancedMesh(geometry, material, points.length);
      points.forEach((p, i) => {
        dummy.position.set(p.x, elevation(p.x, p.z) - p.height * map.userData.baseV, p.z);
        dummy.rotation.set(0, facing + (p.tint - 0.5) * 0.2, 0);
        dummy.scale.set(p.width, p.height, 1);
        dummy.updateMatrix(); cards.setMatrixAt(i, dummy.matrix);
        color.set(0xe0e4d5).lerp(new THREE.Color(0xa2beb7), p.grove * 0.32 + p.tint * 0.2);
        cards.setColorAt(i, color);
      });
      cards.castShadow = true; cards.receiveShadow = true; cards.layers.enable(BAKE_LAYER.bounce);
      this.scene.add(cards);
    }
    // The reference giants use an actual straight trunk and a high crown. Their
    // dedicated bark/crown atlas is shared; no bitmap is stretched into a squat tree.
    for (let variant = 0; variant < this.art.sequoias.length; variant++) {
      const points = trees.filter(tree => tree.sequoia && tree.variant === variant);
      if (!points.length) continue;
      const map = this.art.sequoias[variant];
      const trunkGeometry = new THREE.LatheGeometry([
        new THREE.Vector2(.072,-.20), new THREE.Vector2(.065,0),
        new THREE.Vector2(.055,.09), new THREE.Vector2(.048,.35),
        new THREE.Vector2(.039,.64), new THREE.Vector2(.03,.81),
      ], 12);
      // Sample a narrow vertical bark strip from the authored straight trunk.
      const barkUV = trunkGeometry.attributes.uv, barkCenter = variant === 0 ? .525 : .5;
      for (let i=0;i<barkUV.count;i++) barkUV.setXY(i,barkCenter+(barkUV.getX(i)-.5)*.065,.12+barkUV.getY(i)*.38);
      const bark = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .035, color: 0xb9aaa0, roughness: .94 });
      const trunks = new THREE.InstancedMesh(trunkGeometry,bark,points.length);
      const crownGeometry = new THREE.PlaneGeometry(.38,.37);
      crownGeometry.translate(0,.815,0);
      const crownUV = crownGeometry.attributes.uv;
      for(let i=0;i<crownUV.count;i++) crownUV.setY(i,.38+crownUV.getY(i)*.62);
      const foliage = new THREE.MeshStandardMaterial({ map, alphaTest: .12, alphaToCoverage: true,
        side: THREE.DoubleSide, color: 0xe8e1d2, roughness: 1 });
      lightPaintedFoliage(foliage);
      const lightCrown = foliage.onBeforeCompile;
      foliage.onBeforeCompile = (shader, renderer) => {
        lightCrown(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `
          diffuseColor.a *= smoothstep(.38, .46, vMapUv.y);
          #include <alphatest_fragment>
        `);
      };
      foliage.customProgramCacheKey = () => "grayhaven-high-sequoia-crown-v1";
      this.attachLighting(foliage); this.attachLighting(bark);
      const crowns = new THREE.InstancedMesh(crownGeometry,foliage,points.length);
      points.forEach((p,i)=>{
        dummy.position.set(p.x,elevation(p.x,p.z),p.z);
        dummy.rotation.set(0,facing,0); dummy.scale.setScalar(p.height); dummy.updateMatrix();
        trunks.setMatrixAt(i,dummy.matrix); crowns.setMatrixAt(i,dummy.matrix);
      });
      trunks.castShadow = trunks.receiveShadow = true; trunks.layers.enable(BAKE_LAYER.occluder); trunks.layers.enable(BAKE_LAYER.bounce);
      crowns.castShadow = crowns.receiveShadow = true; crowns.layers.enable(BAKE_LAYER.bounce);
      this.scene.add(trunks,crowns);
    }
    // Town edge trees share the same brush language, with footprints left clear.
    const random = seededRandom(1885), townPoints: { x: number; z: number; h: number }[] = [];
    for (let i = 0; i < 150 && townPoints.length < 35; i++) {
      const x = 24 + random() * 116, z = random() * 140;
      if (distanceToRoad([x,z]) < 6 || this.buildingFootprints.some(b => Math.hypot(x-b.x,z-b.z) < b.radius+3)) continue;
      townPoints.push({x,z,h:12+random()*9});
    }
    const mat = new THREE.MeshStandardMaterial({ map: this.art.trees[2], alphaTest: .12, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1 });
    lightPaintedFoliage(mat);
    this.attachLighting(mat);
    const edgeTrees = new THREE.InstancedMesh(geometry, mat, townPoints.length);
    townPoints.forEach((p,i) => {
      dummy.position.set(p.x,elevation(p.x,p.z)-p.h*this.art.trees[2].userData.baseV,p.z); dummy.rotation.set(0,facing,0); dummy.scale.set(p.h*.8,p.h,1); dummy.updateMatrix(); edgeTrees.setMatrixAt(i,dummy.matrix);
    });
    edgeTrees.castShadow = true; edgeTrees.receiveShadow = true; edgeTrees.layers.enable(BAKE_LAYER.bounce); this.scene.add(edgeTrees);
    this.host.dataset.treeCount = String(trees.length + townPoints.length);
    this.host.dataset.sequoiaCount = String(trees.filter(tree => tree.sequoia).length);
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

  setAtmosphere(hour:number,fog:number) {
    this.dayHour=normalizeHour(hour);this.fogAmount=THREE.MathUtils.clamp(fog,0,1);
    this.lightingDirty=true;this.indirectDirty=true;this.lastTimeInput=performance.now();
  }
  setTime(hour:number) {this.setAtmosphere(hour,this.fogAmount);}
  setTimePlaying(playing:boolean) {this.timePlaying=playing;}
  getTime() {return this.dayHour;}

  private updateLighting(time:number,dt:number) {
    if(this.timePlaying) {this.dayHour=normalizeHour(this.dayHour+dt*.1);this.lightingDirty=true;this.indirectDirty=true;}
    const refresh=lightingRefresh(time,this.lastLightingUpdate,this.lastIndirectUpdate,this.lastTimeInput,this.timePlaying,this.lightingDirty,this.indirectDirty);
    if(refresh.direct || refresh.indirect) {
      const p=sampleDaylight(this.dayHour),gi=p.gi;
      this.dinerLight?.setDaylight(p.daylight);this.sheriffLight?.setDaylight(p.daylight);
      (this.scene.background as THREE.Color).copy(p.sky);
      (this.scene.fog as THREE.Fog).color.copy(p.sky);
      this.seaMist.setAtmosphere(this.fogAmount,p.sky,p.daylight);
      this.sun.color.copy(p.sun);this.sun.intensity=p.direct;
      // Keep the light transform and its shadow map on the same sampled time.
      this.sun.position.copy(this.sun.target.position).addScaledVector(p.direction,540);
      this.ambient.intensity=gi.ambient;this.ambient.color.copy(p.fill);this.ambient.groundColor.copy(p.bounce);
      this.windowMaterial.color.set(0x25323e).lerp(new THREE.Color(0x34474c),p.daylight);
      this.glazing.setLight(p.fill,p.bounce);this.frostedGlazing.setLight(p.fill,p.bounce);
      this.litWindowMaterial.emissiveIntensity=p.lamps*1.5;
      this.roadLamps.setNight(p.lamps);
      this.glazing.material.emissive.set(0xffc98b);this.glazing.material.emissiveIntensity=p.lamps*.32;
      this.frostedGlazing.material.emissive.set(0xffd3a3);this.frostedGlazing.material.emissiveIntensity=p.lamps*.23;
      this.beacon.intensity=p.beacon;this.porchLight.intensity=p.porch;this.harborLight.intensity=p.harbor;
      this.beaconGlass.emissiveIntensity=p.glow;this.lampGlass.emissiveIntensity=p.lamps*p.glow;
      this.beaconHalo.opacity=.08+p.lamps*.47;
      this.seaMist.setSun(p.direction,p.sun.clone().multiplyScalar(.04+p.daylight*.96));
      this.water.uniforms.uMist.value=0;
      this.water.uniforms.uSunDirection.value.copy(p.direction);
      this.water.uniforms.uSunColor.value.copy(p.sun).multiplyScalar(p.direct/4.8);
      this.water.uniforms.uColor.value.copy(p.water);this.water.uniforms.uLight.value.copy(p.sky);this.water.uniforms.uFog.value=this.fogAmount;
      this.renderer.toneMappingExposure=p.exposure;this.scene.environmentIntensity=gi.envIntensity;
      this.lightAtlas.applyPreset({aoStrength:gi.aoStrength,contactHeight:gi.contactHeight,bounceStrength:gi.bounceStrength,mist:0,mistFloor:gi.mistFloor,mistTop:gi.mistTop});
      updateSoftShadowUniforms(this.softShadowUniforms,this.sun.shadow,gi.penumbra);
      this.sun.shadow.needsUpdate=true;this.renderer.shadowMap.needsUpdate=true;
      this.lightingDirty=false;this.lastLightingUpdate=time;
      if(refresh.indirect) {
        // Expensive sky, canopy and bounce updates are capped at twice per second,
        // with one final exact update after the user stops dragging the timeline.
        this.scene.environment=this.sky.update({zenith:gi.zenith,horizon:p.sky,ground:gi.ground,sunColor:p.sun,sunDirection:p.direction,sunGlow:gi.sunGlow});
        this.lightAtlas.updateCanopy(p.direction,p.dapple*(1-this.fogAmount*.55));
        const exteriorVisible=this.dinerExterior.visible;this.dinerExterior.visible=true;
        try {this.depthReveal.withoutReveal(() => this.lightAtlas.bakeBounce(this.renderer,this.scene));}
        finally {this.dinerExterior.visible=exteriorVisible;}
        this.indirectDirty=false;this.lastIndirectUpdate=time;
      }
    }
    const minute=Math.floor(this.dayHour*60+1e-7)%1440;
    if(minute!==this.reportedMinute) {this.reportedMinute=minute;this.options.onTime?.(this.dayHour);}
  }

  setLabels(visible: boolean) { this.labelVisible = visible; }
  setRoads(visible: boolean) { this.roadOverlay.visible = visible; }
  zoomBy(factor: number) { this.focusZoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.controls.minZoom, this.controls.maxZoom); }
  reset() {
    this.closeInterior(); this.streetView=null; this.suppressAutoInterior=true;
    this.focusTarget = new THREE.Vector3(38, 9, -57); this.focusZoom = 1;
    this.select(null);
  }
  select(id: string | null, navigate = true) {
    const same=this.selectedId===id;
    this.selectedId = id;
    if (buildingForRoom(id)) {
      this.ring.visible=false;
      if(navigate && (!same || this.interiorState.status==='closed'))this.openInterior(id!);
      return;
    }
    if(id && navigate) {this.closeInterior();this.streetView=null;this.suppressAutoInterior=true;}
    const landmark = landmarks.find(l => l.id === id);
    this.ring.visible = !!landmark;
    for (const label of this.labels) label.button.classList.toggle("is-selected", label.id === id);
    if (!landmark) return;
    const [x, z] = landmark.position, y = elevation(x, z);
    this.ring.position.set(x, y + 0.7, z);
    if (navigate) {
      const view = id === 'SCN_dock' ? BEACH_VIEW : id === 'SCN_redwood_ring' ? REDWOOD_VIEW : null;
      this.focusTarget = view ? new THREE.Vector3(view.x, view.y, view.z) : new THREE.Vector3(x, y, z);
      this.focusZoom = view?.zoom ?? 2.35;
    }
  }

  private setInteriorState(state: InteriorState) {
    this.interiorState=state; this.options.onInterior?.({...state});
    this.host.dataset.interior=JSON.stringify(state);
  }

  private loadInterior(building:BuildingId=this.activeBuilding) {
    if(building==='sheriff') {
      if(this.sheriffModel)return Promise.resolve();
      if(this.sheriffLoading)return this.sheriffLoading;
      this.sheriffLoading=import('./sheriffInterior').then(({createSheriffInterior})=>{
        if(this.disposed)return;
        const model=createSheriffInterior(this.sheriffLight);
        model.root.position.copy(this.sheriffExterior.position);model.root.quaternion.copy(this.sheriffExterior.quaternion);
        model.root.visible=false;this.scene.add(model.root);this.sheriffModel=model;
      }).finally(()=>{this.sheriffLoading=null;});
      return this.sheriffLoading;
    }
    if(this.dinerModel)return Promise.resolve();
    if(this.dinerLoading)return this.dinerLoading;
    this.dinerLoading=import('./bluebirdInterior').then(({createBluebirdInterior})=>{
      if(this.disposed)return;
      const model=createBluebirdInterior(this.dinerLight);
      model.root.position.copy(this.dinerExterior.position);model.root.quaternion.copy(this.dinerExterior.quaternion);
      model.root.visible=false;this.scene.add(model.root);this.dinerModel=model;
    }).finally(()=>{this.dinerLoading=null;});
    return this.dinerLoading;
  }

  private openInterior(room: string | null, automatic=false, building:BuildingId=buildingForRoom(room)??this.activeBuilding) {
    if(this.interiorState.status!=='closed' && building!==this.activeBuilding)this.closeInterior();
    if(this.interiorState.status==='open') {
      const floor=room?roomFloor(room):this.interiorState.floor;
      this.activeModel!.setFloor(floor);
      this.setInteriorState({...this.interiorState,floor,room,item:this.interiorState.room===room?this.interiorState.item:null});
      if(!automatic)this.fitInterior(room);
      return;
    }
    if(this.interiorState.status==='loading') {
      if(room)this.setInteriorState({...this.interiorState,room,floor:roomFloor(room),item:null});
      return;
    }
    if(!this.streetView)this.streetView={target:this.controls.target.clone(),zoom:this.camera.zoom};
    this.suppressAutoInterior=false;this.interiorCloseZoom=0;
    const request=++this.interiorRequest;
    this.setInteriorState({status:'loading',building,floor:room?roomFloor(room):0,room,item:null});
    this.loadInterior(building).then(()=>{
      if(this.disposed || request!==this.interiorRequest || !this.activeModel)return;
      this.activeModel.root.visible=true;
      this.activeModel.setFloor(this.interiorState.floor);
      this.seaMist.setInterior(this.activeInverse,true,building==='sheriff');
      this.setInteriorState({...this.interiorState,status:'open'});
      if(!automatic)this.fitInterior(this.interiorState.room);
    }).catch(cause=>{
      if(this.disposed || request!==this.interiorRequest)return;
      console.error('Building interior could not load',cause);
      this.setInteriorState({...this.interiorState,status:'error'});
    });
  }

  private closeInterior() {
    this.interiorRequest++;this.candidateSince=null;
    this.dinerExterior.visible=true;if(this.dinerModel)this.dinerModel.root.visible=false;
    if(this.sheriffExterior)this.sheriffExterior.visible=true;if(this.sheriffModel)this.sheriffModel.root.visible=false;
    this.seaMist.setInterior(this.activeInverse,false);
    if(this.interiorState.status!=='closed')this.setInteriorState({...CLOSED_INTERIOR});
  }
  retryInterior() {this.openInterior(this.interiorState.room);}
  setInteriorFloor(floor:0|1) {
    if(this.interiorState.status!=='open' || this.activeBuilding==='sheriff' && floor!==0)return;
    this.activeModel!.setFloor(floor);
    this.setInteriorState({...this.interiorState,floor,room:null,item:null});this.fitInterior(null);
  }
  returnToBuilding() {
    if(this.interiorState.status!=='open')return;
    this.setInteriorState({...this.interiorState,room:null,item:null});this.fitInterior(null);
  }
  returnToStreet() {
    const saved=this.streetView,fallback=this.activeExterior.position.clone();this.closeInterior();this.suppressAutoInterior=true;this.streetView=null;
    this.focusTarget=saved?.target??fallback;this.focusZoom=saved?.zoom??3.5;
  }
  /** Refit after the notes panel mounts/resizes, without changing the fixed viewing angle. */
  fitSelectedDetail() {
    if(this.interiorState.status==='open'){this.fitInterior();return;}
    if(this.selectedId!=='SCN_redwood_ring')return;
    const {width,height}=this.canvasSize;
    const panel=this.host.parentElement?.querySelector('.gh-place')?.getBoundingClientRect();
    const host=this.host.getBoundingClientRect();
    const left=width>650 && panel?panel.right-host.left+20:24, right=70, top=130;
    const bottom=width<=650 && panel?host.bottom-panel.top+18:115;
    const availW=Math.max(160,width-left-right),availH=Math.max(140,height-top-bottom);
    const zoom=THREE.MathUtils.clamp(Math.min(availW/85,availH/45)*524/height,3.5,REDWOOD_VIEW.zoom);
    const target=new THREE.Vector3(REDWOOD_VIEW.x,elevation(REDWOOD_VIEW.x,REDWOOD_VIEW.z)+5,REDWOOD_VIEW.z);
    const rightVec=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),upVec=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
    target.addScaledVector(rightVec,-(left+availW/2-width/2)*(this.camera.right-this.camera.left)/width/zoom);
    target.addScaledVector(upVec,-(height/2-top-availH/2)*(this.camera.top-this.camera.bottom)/height/zoom);
    this.focusTarget=target;this.focusZoom=zoom;
  }
  fitInterior(room: string | null = this.interiorState.room) {
    if(this.interiorState.status!=='open')return;
    const {width,height}=this.canvasSize;
    const panel=this.host.parentElement?.querySelector('.gh-place')?.getBoundingClientRect();
    const host=this.host.getBoundingClientRect();
    const toolbar=this.host.parentElement?.querySelector('.gh-interior-nav')?.getBoundingClientRect();
    let left=30,right=80,top=Math.max(130,toolbar?toolbar.bottom-host.top+15:130),bottom=120;
    if(panel) {if(width>650)left=panel.right-host.left+25;else bottom=host.bottom-panel.top+20;}
    const availW=Math.max(140,width-left-right),availH=Math.max(120,height-top-bottom);
    const {center,halfWidth,halfDepth,halfHeight}=interiorFrame(this.interiorState,room);
    // Project a complete room-height box at zoom=1; fit both dimensions into unobstructed pixels.
    const probe=this.camera.clone();probe.zoom=1;probe.updateProjectionMatrix();
    const pts=[-1,1].flatMap(x=>[-1,1].flatMap(z=>[-1,1].map(y=>center.clone().add(new THREE.Vector3(x*halfWidth,y*halfHeight,z*halfDepth)).applyMatrix4(this.activeExterior.matrixWorld).project(probe))));
    const spanX=(Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)))*width/2;
    const spanY=(Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)))*height/2;
    const zoom=THREE.MathUtils.clamp(Math.min(availW*.78/spanX,availH*.83/spanY),this.controls.minZoom,32);
    const target=center.applyMatrix4(this.activeExterior.matrixWorld);
    const screenX=(left+availW/2-width/2)/width*2,screenY=(height/2-top-availH/2)/height*2;
    const rightVec=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),upVec=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
    target.addScaledVector(rightVec,-screenX*(this.camera.right-this.camera.left)/zoom/2);
    target.addScaledVector(upVec,-screenY*(this.camera.top-this.camera.bottom)/zoom/2);
    this.interiorCloseZoom=zoom*.68;
    this.focusTarget=target;this.focusZoom=zoom;
  }
  private updateInterior(time:number) {
    const candidates=([['bluebird',this.dinerExterior,BLUEBIRD],['sheriff',this.sheriffExterior,SHERIFF]] as const)
      .filter(([,exterior])=>!!exterior).map(([building,exterior,bounds])=>({building,
        ...projectedBuilding(this.camera,exterior.matrixWorld,bounds.width,bounds.depth)}));
    const candidate=this.interiorState.status==='closed'
      ? candidates.filter(c=>c.inView).sort((a,b)=>b.size-a.size)[0]
      : candidates.find(c=>c.building===this.activeBuilding);
    if(!candidate){this.candidateSince=null;this.suppressAutoInterior=false;return;}
    const {size,inView,building}=candidate;
    const action=cutawayDecision(size,inView,this.interiorState.status==='open');
    if(this.suppressAutoInterior) {if(size<.16 || !inView)this.suppressAutoInterior=false;else return;}
    if(action==='close') {
      if(!this.focusTarget && this.focusZoom===null && (!inView || !this.interiorCloseZoom || this.camera.zoom<this.interiorCloseZoom)){this.closeInterior();this.streetView=null;}
      return;
    }
    if(this.interiorState.status==='error')return;
    if(action==='prefetch')this.loadInterior(building).catch(()=>{});
    if(action==='open' && this.interiorState.status==='closed') {
      this.candidateSince??=time;
      if(time-this.candidateSince>=200)this.openInterior(null,true,building);
    }else this.candidateSince=null;
  }

  private cancelFocus = () => { this.focusTarget = null; this.focusZoom = null; };
  private revealTarget(): RevealTarget | null {
    if(this.interiorState.status==='open') {
      const target=interiorRevealTarget(this.camera,this.activeExterior.matrixWorld,this.interiorState)!;
      // A mobile notes panel can fit a room below the automatic opening footprint.
      // Manual framing uses its own closing zoom so a fitted room still opens fully.
      target.strength=this.interiorCloseZoom
        ? THREE.MathUtils.smoothstep(this.camera.zoom,this.interiorCloseZoom,this.interiorCloseZoom*1.35)
        : THREE.MathUtils.smoothstep(projectedBuilding(this.camera,this.activeExterior.matrixWorld,...(this.activeBuilding==='sheriff'?[15,12] as const:[14,22] as const)).size,.16,.27);
      return target;
    }
    // Only authored underlying scenes are eligible. Ordinary buildings and failed
    // or pending room loads must never open a window onto bare terrain.
    for(const [id,view,radii] of [
      ['SCN_redwood_ring',REDWOOD_VIEW,new THREE.Vector2(38,29)],
      ['SCN_dock',BEACH_VIEW,new THREE.Vector2(38,28)],
    ] as const) {
      const distance=Math.hypot(this.controls.target.x-view.x,this.controls.target.z-view.z);
      if(this.selectedId===id || !this.selectedId && distance<35) {
        return {center:new THREE.Vector3(view.x,view.y,view.z),radii,strength:THREE.MathUtils.smoothstep(this.camera.zoom,2.9,4.6)};
      }
    }
    return null;
  }
  private pointerDown = (e: PointerEvent) => { this.pointerStart = { x: e.clientX, y: e.clientY }; };
  private pointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) > 5) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const revealUv=new THREE.Vector2((e.clientX-rect.left)/rect.width,1-(e.clientY-rect.top)/rect.height);
    if(this.interiorState.status==='open' && this.activeModel && this.depthReveal.contains(revealUv)) {
      const detail=this.raycaster.intersectObjects(this.activeModel.hits.filter(h=>h.userData.floor===this.interiorState.floor),false)[0];
      if(detail) {
        const {sceneId,itemId,targetId}=detail.object.userData;
        if(targetId)this.options.onSelect(targetId);
        else {this.setInteriorState({...this.interiorState,room:sceneId,item:itemId??null});this.options.onSelect(sceneId);}
        return;
      }
    }
    const hit = this.raycaster.intersectObjects(this.hits.filter(h=>h.parent?.visible!==false), false)[0];
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
    this.fitSelectedDetail();
  };

  private animate = (time: number) => {
    if (this.disposed) return;
    const frameMs = time - this.lastTime;
    const hadPreviousFrame = this.lastTime > 0;
    const dt = Math.min(frameMs / 1000, 0.05); this.lastTime = time;
    if (!document.hidden) {
      if (!this.reducedMotion) this.progress += dt;
      this.updateLighting(time,dt);
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
      this.camera.updateMatrixWorld();
      this.updateInterior(time);
      const reveal=this.revealTarget();
      this.depthReveal.update(this.scene,this.camera,reveal?.center??this.controls.target,reveal,this.reducedMotion?1:dt);
      this.beach.update(this.camera.zoom, this.progress);
      this.redwoodRing.update(this.camera.zoom);
      this.updateWater(this.progress);
      this.seaMist.update(this.progress);
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      // Resolve screen-space overlaps, prioritizing the selected location.
      const interiorOpen=this.interiorState.status==='open';
      const activeEntrance=this.activeBuilding==='sheriff'?'SCN_sheriff_front':'SCN_bluebird_dining';
      const isSelected=(label:typeof this.labels[number])=>label.id===this.selectedId
        || label.id===activeEntrance && interiorOpen || label.id==='SCN_bluebird_dining' && isBluebird(this.selectedId)
        || label.id==='SCN_sheriff_front' && buildingForRoom(this.selectedId)==='sheriff';
      const orderedLabels = [...this.labels].sort((a,b)=>Number(isSelected(b))-Number(isSelected(a)) || Number(!!b.building)-Number(!!a.building));
      for (const label of orderedLabels) {
        const anchor=label.point.clone();
        if(interiorOpen && label.id==='SCN_bluebird_dining') {
          anchor.copy(this.dinerExterior.position);
          anchor.y+=(this.interiorState.floor===0?BLUEBIRD.upper:BLUEBIRD.top)+.6;
        }
        const p=anchor.project(this.camera), selected=isSelected(label);
        if(label.roofCorners) {
          const corners=interiorOpen && label.id==='SCN_bluebird_dining'
            ? [-1,1].flatMap(x=>(this.interiorState.floor===0?[-11,11]:[BLUEBIRD.divider,11]).map(z=>this.dinerExterior.localToWorld(new THREE.Vector3(x*7.2,(this.interiorState.floor===0?BLUEBIRD.upper:BLUEBIRD.top)+.6,z))))
            : label.roofCorners;
          p.y=Math.max(...corners.map(c=>c.clone().project(this.camera).y));
        }
        label.button.classList.toggle('is-selected',selected);
        const show=this.labelVisible && (!interiorOpen || label.id===activeEntrance) && (label.major || this.camera.zoom>1.75 || selected)
          && Math.abs(p.x)<.94 && Math.abs(p.y)<.92 && p.z>=-1 && p.z<1;
        label.button.hidden = !show;
        if (show) {
          const x = (p.x + 1) * 0.5 * this.canvasSize.width, y = (1 - p.y) * 0.5 * this.canvasSize.height - (label.building ? 10 : 0);
          const w = label.button.offsetWidth, h = label.button.offsetHeight;
          const box = { x: x - w / 2, y: y - h, w, h };
          const overlap = occupied.some(other => box.x < other.x + other.w + 8 && box.x + w + 8 > other.x && box.y < other.y + other.h + 8 && box.y + h + 8 > other.y);
          label.button.hidden = overlap;
          if (!overlap) { occupied.push(box); label.button.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; }
        }
      }
      this.options.onZoom(this.camera.zoom);
      // Newly revealed room lamps need their own floor/furniture shadow maps even
      // if an outdoor bounce bake already consumed the renderer-wide refresh flag.
      if(this.activeModel?.root.visible && this.activeModel.needsShadowUpdate())this.renderer.shadowMap.needsUpdate=true;
      this.seaMist.render(this.renderer, this.scene, this.camera, () => this.depthReveal.render(this.renderer,this.scene,this.camera));
      if (hadPreviousFrame && frameMs > 0) { this.metricFrames++; this.metricFrameTimes.push(frameMs); }
      if (time - this.metricsStart >= 1500) {
        const samples = this.metricFrameTimes.sort((a,b) => a-b);
        this.host.dataset.renderStats = JSON.stringify({
          frames: this.metricFrames, frameMs: samples[Math.floor(samples.length*.5)] ?? 0,
          p95Ms: samples[Math.floor(samples.length*.95)] ?? 0,
          calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
          textures: this.renderer.info.memory.textures, geometries: this.renderer.info.memory.geometries,
          textureMiBEstimate: +((this.art.estimatedTextureBytes + this.signTextureBytes + this.seaMist.estimatedBytes + 64*64*4*4/3 + this.lightAtlas.estimatedBytes + this.sky.estimatedBytes) / 1048576).toFixed(2),
          shadowMapMiBEstimate: +([this.sun, this.beacon, this.porchLight,...this.roadLamps.lights,...(this.dinerModel?.lamps??[]),...(this.sheriffModel?.lamps??[])].reduce((bytes, light) => {
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
    this.disposed = true; this.interiorRequest++; cancelAnimationFrame(this.frame); this.abort.abort(); this.observer.disconnect();
    this.controls.removeEventListener("start", this.cancelFocus); this.controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) for (const mat of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(mat);
    });
    this.roadLamps.dispose();
    for(const light of [...(this.dinerModel?.lamps??[]),...(this.sheriffModel?.lamps??[])])light.dispose();
    for (const material of this.materialCache.values()) materials.add(material);
    materials.add(this.windowMaterial); materials.add(this.litWindowMaterial);
    for (const geo of geometries) geo.dispose(); for (const mat of materials) mat.dispose(); for (const texture of this.textures) texture.dispose();
    this.lightAtlas.dispose(); this.sky.dispose();
    this.sun.dispose(); this.beacon.dispose(); this.porchLight.dispose(); this.harborLight.dispose();
    this.seaMist.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
    for (const label of this.labels) label.button.remove();
  }
}
