import * as THREE from "three";
import { coastalElevation, coastWidth, elevation, seededRandom, shoreline, waterline } from "./layout";
import { BAKE_LAYER } from "./worldLightAtlas";
import type { Surface } from "./painterlyArt";

// Authored exterior staging of SCN_dock; positions are map units, not real metres.
export const BEACH_VIEW = { x: -198, y: 8, z: 124, zoom: 4.25 };
export const BEACH_LOD = { props: 1.85, fine: 3.5, hysteresis: .12 };
export function beachDetailLevel(zoom: number, previous = 0) {
  const threshold = (level: number, at: number) => zoom >= at - (previous >= level ? BEACH_LOD.hysteresis : 0);
  return threshold(2, BEACH_LOD.fine) ? 2 : threshold(1, BEACH_LOD.props) ? 1 : 0;
}
export const DOCK = (() => {
  const z = 132, start = shoreline(z) + 7, length = coastWidth(z) + 45;
  return { z, start, length, end: start - length, deck: elevation(start, z) + 1.75 };
})();
export function beachSurface(z: number, t: number) {
  return new THREE.Vector3(shoreline(z) - coastWidth(z) * t, coastalElevation(z, t), z);
}
export const BEACH_ITEMS = ["memorial_plaque", "whale_trypot", "bollards", "moored_boats", "festa_poles", "fuel_pump", "fish_shed", "tide_board", "net_rack", "crab_pots", "gear_locker", "breakwater", "cannery_ruins", "driftline"] as const;

type MaterialFactory = (color: THREE.ColorRepresentation, surface?: Surface) => THREE.MeshStandardMaterial;
type Shape = "box" | "pole" | "rock" | "ring";

/** Static primitives are batched by geometry/material/tier. Detail tiers never
 * cast baked shadows: hiding small props must not leave a shadow behind. */
export function createBeachScene(material: MaterialFactory) {
  const root = new THREE.Group(); root.name = "SCN_dock — exterior detail";
  root.userData.moduleItems = BEACH_ITEMS.map(id => "item.dock." + id);
  const tiers = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  tiers.forEach((group, i) => { group.name = `beach-detail-${i}`; root.add(group); });
  const wood = material(0x968a75, "bareWood"), bleached = material(0xb4aea0, "bareWood");
  const iron = material(0x555e5a), rust = material(0x92745e, "metalRoof");
  const concrete = material(0xbcb8a6, "rock"), stone = material(0x8b928a, "rock");
  const rope = material(0xaaa18a), cream = material(0xc7c1aa), green = material(0x65786d);
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1), pole: new THREE.CylinderGeometry(.5, .55, 1, 8),
    rock: new THREE.DodecahedronGeometry(1, 0), ring: new THREE.TorusGeometry(1, .1, 4, 14),
  };
  const batches = new Map<string, { tier: number; shape: Shape; material: THREE.Material; matrices: THREE.Matrix4[] }>();
  const dummy = new THREE.Object3D();
  function add(tier: number, shape: Shape, mat: THREE.Material, p: number[], scale: number[], rotation = [0, 0, 0]) {
    dummy.position.fromArray(p); dummy.scale.fromArray(scale); dummy.rotation.set(rotation[0], rotation[1], rotation[2]); dummy.updateMatrix();
    const key = `${tier}/${shape}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { tier, shape, material: mat, matrices: [] });
    batches.get(key)!.matrices.push(dummy.matrix.clone());
  }
  const box = (tier: number, mat: THREE.Material, p: number[], scale: number[], rot = [0, 0, 0]) => add(tier, "box", mat, p, scale, rot);
  function beam(tier: number, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number) {
    dummy.position.copy(a).add(b).multiplyScalar(.5); dummy.scale.set(width, a.distanceTo(b), width);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); dummy.updateMatrix();
    const key = `${tier}/box/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { tier, shape: "box", material: mat, matrices: [] });
    batches.get(key)!.matrices.push(dummy.matrix.clone());
  }
  const lines: number[][] = [[], [], []];
  function line(tier: number, points: THREE.Vector3[]) {
    for (let i = 1; i < points.length; i++) lines[tier].push(...points[i - 1].toArray(), ...points[i].toArray());
  }
  const { start, end, z, deck } = DOCK;

  // Three-sided fish shelter on the existing widened landing; clear passage on -Z.
  const shedX = end + 8, shedZ = z + 1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0, wood, [shedX + sx * 3, deck + 2.5, shedZ + sz * 2.6], [.3, 5, .3]);
  box(0, wood, [shedX, deck + 1.8, shedZ + 2.6], [6.2, 3.6, .22]);
  box(0, rust, [shedX, deck + 5.1, shedZ], [7.5, .22, 6.2], [.08, 0, 0]);
  box(0, concrete, [shedX, deck + 1.55, shedZ + 1.1], [4.8, .35, 1.6]);
  for (const sx of [-1, 1]) box(0, concrete, [shedX + sx * 1.9, deck + .7, shedZ + 1.1], [.5, 1.4, 1.3]);
  // Hand pump with faded red casing and a cloudy measuring cylinder.
  const pumpX = end + 2, pumpZ = z - 1.7;
  box(0, rust, [pumpX, deck + 1.1, pumpZ], [1.1, 2.2, 1]);
  add(1, "pole", cream, [pumpX, deck + 2.7, pumpZ], [.78, 1.05, .78]);
  add(1, "pole", iron, [pumpX, deck + 3.3, pumpZ], [1.0, .18, 1.0]);
  add(1, "ring", iron, [pumpX + .75, deck + 1.3, pumpZ], [.5, .75, .5]);
  box(2, iron, [pumpX + .6, deck + 1.85, pumpZ - .15], [.18, .32, .13]);

  // Memorial and half-buried whaling trypot sit beside the entrance on the upper sand.
  const memorial = beachSurface(123, .1), pot = beachSurface(119, .19);
  box(0, stone, [memorial.x, memorial.y + .8, memorial.z], [2.7, 1.6, 2]);
  box(1, material(0x777659), [memorial.x, memorial.y + 1.64, memorial.z], [2.3, .1, 1.5]);
  const potGeo = new THREE.LatheGeometry([new THREE.Vector2(.05, -.55), new THREE.Vector2(.85, -.4), new THREE.Vector2(1.15, .1), new THREE.Vector2(1.24, .8)], 16);
  const potMat = material(0x515a4e); potMat.side = THREE.DoubleSide;
  const trypot = new THREE.Mesh(potGeo, potMat); trypot.position.copy(pot); trypot.receiveShadow = trypot.castShadow = true; trypot.layers.enable(BAKE_LAYER.occluder); trypot.layers.enable(BAKE_LAYER.bounce); tiers[0].add(trypot);
  add(1, "ring", iron, [pot.x, pot.y + .8, pot.z], [1.24, 1.24, .75], [Math.PI / 2, 0, 0]);
  add(1, "pole", green, [pot.x, pot.y + .12, pot.z], [2.05, .04, 2.05]);
  for (let i = 0; i < 3; i++) add(2, "rock", cream, [memorial.x - .5 + i * .25, memorial.y + 1.75, memorial.z + .5], [.12, .07, .1]);

  // Empty festival poles: the module explicitly says flags are stored outside the festival.
  for (const side of [-1, 1]) {
    const x = start - 52, zz = z + side * 2.5;
    add(0, "pole", bleached, [x, deck + 3.6, zz], [.36, 7.2, .36]);
    add(1, "ring", iron, [x, deck + 7.3, zz], [.23, .23, .23]);
    line(2, [new THREE.Vector3(x, deck + 7.2, zz), new THREE.Vector3(x + .25, deck + .2, zz)]);
  }
  // Grooved oak bollards and coils use the existing single pier's edges.
  for (let i = 0; i < 8; i++) {
    const x = end + 17 + i * 11, zz = z + (i % 2 ? -2.6 : 2.6);
    add(1, "pole", wood, [x, deck + .7, zz], [.8, 1.4, .8]);
    for (let j = 0; j < 3; j++) add(2, "ring", rope, [x, deck + .8 + j * .1, zz], [.43, .43, .2], [Math.PI / 2, 0, 0]);
  }
  const rackX = start - 32, rackZ = z + 2.3;
  for (const sx of [-1, 1]) box(0, wood, [rackX + sx * 3.2, deck + 2.2, rackZ], [.26, 4.4, .26]);
  box(0, bleached, [rackX, deck + 4.2, rackZ], [7, .22, .25]);
  // Sagging incomplete mesh leaves holes instead of an opaque rectangular card.
  for (let i = 0; i < 17; i++) {
    const xx = rackX - 2.9 + i * .35;
    line(1, Array.from({ length: 10 }, (_, j) => new THREE.Vector3(xx + Math.sin(j * .5) * .12, deck + 4 - j * .3 - Math.sin(i / 16 * Math.PI) * .45, rackZ)));
  }
  for (let j = 0; j < 10; j++) line(1, Array.from({ length: 17 }, (_, i) => new THREE.Vector3(rackX - 2.9 + i * .35, deck + 4 - j * .3 - Math.sin(i / 16 * Math.PI) * .45, rackZ)));
  box(1, wood, [rackX + 5, deck + 1.1, rackZ - .2], [2.1, 2.2, 1.2]);
  box(2, iron, [rackX + 5, deck + 1.1, rackZ - .84], [.12, .35, .12]);
  for (let i = 0; i < 7; i++) {
    const x = rackX - 4.7 - i % 2 * 1.35, y = deck + .4 + Math.floor(i / 2) * .62, zz = z + 1.8;
    for (let j = 0; j < 3; j++) add(1, "ring", rope, [x, y + j * .2, zz], [.65, .65, .28], [Math.PI / 2, 0, 0]);
    for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; box(2, wood, [x + Math.cos(a) * .62, y + .2, zz + Math.sin(a) * .62], [.05, .65, .05]); }
  }
  // Fish boxes, weathered notice board and hand-written sheets (no invented module text).
  for (let i = 0; i < 5; i++) {
    const x = shedX - 1.8 + i % 3 * 1.1, yy = deck + .25 + Math.floor(i / 3) * .55, zz = shedZ + 1.9;
    box(1, wood, [x, yy, zz], [.95, .5, .75]);
    box(2, iron, [x, yy + .26, zz], [.76, .02, .53]);
  }
  box(1, wood, [shedX + 3.1, deck + 2.6, shedZ - 2.4], [.12, 1.5, 1.15]);
  box(2, cream, [shedX + 3.18, deck + 2.65, shedZ - 2.4], [.03, 1.1, .87]);
  for (let i = 0; i < 7; i++) box(2, iron, [shedX + 3.2, deck + 3.0 - i * .12, shedZ - 2.4], [.025, .022, .6]);
  add(1, "ring", green, [shedX - 1.5, deck + .15, shedZ - 1.3], [.7, .7, .7], [Math.PI / 2, 0, 0]);

  // Collapsed cannery at the northern end of this harbour pocket, tucked into the backshore.
  const ruin = beachSurface(96, .28), rw = 18, rd = 12;
  const groundAt = (x: number, zz: number) => coastalElevation(zz, Math.max(0, Math.min(1, (shoreline(zz) - x) / coastWidth(zz))));
  const floor = Math.max(...[-1, 1].flatMap(sx => [-1, 1].map(sz => groundAt(ruin.x + sx * rw / 2, ruin.z + sz * rd / 2))));
  const foundation = floor - Math.min(...[-1, 1].flatMap(sx => [-1, 1].map(sz => groundAt(ruin.x + sx * rw / 2, ruin.z + sz * rd / 2)))) + .8;
  box(0, stone, [ruin.x, floor - foundation / 2, ruin.z], [rw, foundation, rd]);
  box(0, concrete, [ruin.x + 8.6, floor + 2, ruin.z], [.5, 4, rd]);
  box(0, concrete, [ruin.x, floor + .7, ruin.z + 5.7], [rw, 1.4, .5]);
  for (let i = 0; i < 4; i++) {
    const xx = ruin.x - 7.5 + i * 5;
    for (const side of [-1, 1]) box(0, wood, [xx, floor + 3, ruin.z + side * 5], [.35, 6, .35]);
    beam(0, wood, new THREE.Vector3(xx, floor + 6, ruin.z - 5), new THREE.Vector3(xx, floor + 8.2, ruin.z), .3);
    beam(0, wood, new THREE.Vector3(xx, floor + 8.2, ruin.z), new THREE.Vector3(xx, floor + 6, ruin.z + 5), .3);
  }
  box(0, rust, [ruin.x + 5.6, floor + 7.1, ruin.z + 2.5], [7, .18, 5.5], [-.414, 0, 0]);
  box(1, rust, [ruin.x - 3, floor + .55, ruin.z - 1], [5, .18, 3.4], [.1, .42, -.13]);
  box(1, bleached, [ruin.x - 7.5, floor + 2, ruin.z - 5.1], [.14, 1.4, 2]);
  for (let i = 0; i < 7; i++) add(2, "pole", iron, [ruin.x - 4 + i * .8, floor + .3, ruin.z + 1], [.32, 2.4, .32], [Math.PI / 2, 0, 0]);
  // Low rock protection on the outside of the harbour, not a second wooden pier.
  for (let i = 0; i < 20; i++) {
    const zz = 146 + i * 1.65, xx = waterline(zz) - 8 - Math.sin(i / 19 * Math.PI) * 7;
    add(0, "rock", stone, [xx, -.4 + Math.sin(i * 2) * .35, zz], [3.4, 2.1, 2.6], [0, i * 1.7, 0]);
  }
  // Wrack connects the ruin to the tide line; tiny debris appears only close up.
  const random = seededRandom(1889);
  for (let i = 0; i < 95; i++) {
    const zz = 93 + random() * 73, t = .43 + .3 * Math.sin((zz - 93) / 73 * Math.PI) + random() * .08;
    if (zz > 128 && zz < 136) continue;
    const p = beachSurface(zz, t); p.y += .08;
    add(1, "rock", green, p.toArray(), [.3 + random() * .7, .09, .25 + random()]);
    if (i % 4 === 0) add(2, "rock", i % 8 === 0 ? cream : rust, [p.x + .6, p.y + .12, p.z], [.18, .15, .2]);
    if (i % 7 === 0) {
      const a = p.clone().add(new THREE.Vector3(-.55, .05, 0)), b = p.clone().add(new THREE.Vector3(.55, .05, 0));
      line(2, [a, b]);
      for (let j = 0; j < 4; j++) line(2, [p.clone().add(new THREE.Vector3(j * .2 - .3, .05, -.25)), p.clone().add(new THREE.Vector3(j * .2 - .4, .05, .25))]);
    }
  }

  // Two wooden open hulls. The cabin, gunwales and benches move with each hull.
  const boats: { group: THREE.Group; x: number; z: number; phase: number }[] = [];
  const dynamic = new THREE.Group(); root.add(dynamic);
  for (const side of [-1, 1]) {
    const group = new THREE.Group(), x = end + (side > 0 ? 22 : 12), zz = z + side * 9;
    const hullShape = new THREE.Shape(); hullShape.moveTo(-5, 0); hullShape.quadraticCurveTo(-3.5, -1.9, 3.5, -1.5); hullShape.lineTo(5.5, 0); hullShape.lineTo(3.5, 1.5); hullShape.quadraticCurveTo(-3.5, 1.9, -5, 0);
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 1.35, bevelEnabled: true, bevelSize: .28, bevelThickness: .2, bevelSegments: 1, steps: 1, curveSegments: 8 });
    hullGeo.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, material(side > 0 ? 0x69847f : 0xa2947d, "bareWood")); group.add(hull);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(6.5, .12, 2.35), iron); inset.position.y = 1.4; group.add(inset);
    for (let j = 0; j < 3; j++) { const seat = new THREE.Mesh(new THREE.BoxGeometry(.35, .18, 2.7), bleached); seat.position.set(-2 + j * 1.8, 1.53, 0); group.add(seat); }
    if (side > 0) { const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 1.9), cream); cabin.position.set(1.8, 2.2, 0); group.add(cabin); const glass = new THREE.Mesh(new THREE.BoxGeometry(2.04, .65, 1.93), green); glass.position.set(1.8, 2.45, 0); group.add(glass); }
    group.traverse(o => { if (o instanceof THREE.Mesh) o.receiveShadow = true; });
    group.position.set(x, -.5, zz); dynamic.add(group); boats.push({ group, x, z: zz, phase: side > 0 ? 1.7 : .2 });
  }
  const mooringGeometry = new THREE.BufferGeometry(); mooringGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(boats.length * 3 * 6), 3));
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x8b8a78 });
  const moorings = new THREE.LineSegments(mooringGeometry, lineMaterial); moorings.frustumCulled = false; tiers[1].add(moorings);
  // Hanging scale sways from the shelter beam; no shadow/irradiance rebake per frame.
  const scale = new THREE.Group(); scale.position.set(shedX - 1, deck + 4.3, shedZ - 1);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.1, 5), iron); chain.position.y = -.55; scale.add(chain);
  const pan = new THREE.Mesh(new THREE.ConeGeometry(.55, .14, 10, 1, true), iron); pan.rotation.x = Math.PI; pan.position.y = -1.1; scale.add(pan); tiers[1].add(scale);

  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(shapes[batch.shape], batch.material, batch.matrices.length);
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true; mesh.castShadow = batch.tier === 0;
    if (batch.tier === 0) { mesh.layers.enable(BAKE_LAYER.occluder); mesh.layers.enable(BAKE_LAYER.bounce); }
    tiers[batch.tier].add(mesh);
  }
  for (let tier = 0; tier < 3; tier++) if (lines[tier].length) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(lines[tier], 3));
    tiers[tier].add(new THREE.LineSegments(geometry, lineMaterial));
  }
  let level = -1;
  return {
    root,
    update(zoom: number, time: number) {
      const next = beachDetailLevel(zoom, level);
      if (next !== level) { level = next; tiers[1].visible = level >= 1; tiers[2].visible = level >= 2; root.userData.detailLevel = level; }
      const positions = mooringGeometry.attributes.position as THREE.BufferAttribute;
      boats.forEach((boat, i) => {
        const bob = Math.sin(time * .71 + boat.phase) * .24 + Math.sin(time * 1.13 + boat.phase) * .12;
        boat.group.position.y = -.5 + bob; boat.group.rotation.x = Math.sin(time * .61 + boat.phase) * .035; boat.group.rotation.z = Math.sin(time * .79 + boat.phase) * .025;
        const a = new THREE.Vector3(boat.x - 2, deck + .4, z + Math.sign(boat.z - z) * 2.8);
        const b = new THREE.Vector3(-2, 1.5, 0).applyEuler(boat.group.rotation).add(boat.group.position);
        const mid = a.clone().lerp(b, .5); mid.y -= .6;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        for (let j = 0; j < 3; j++) { positions.setXYZ(i * 6 + j * 2, ...curve.getPoint(j / 3).toArray() as [number, number, number]); positions.setXYZ(i * 6 + j * 2 + 1, ...curve.getPoint((j + 1) / 3).toArray() as [number, number, number]); }
      });
      positions.needsUpdate = true;
      scale.rotation.z = Math.sin(time * .85) * .075;
    },
  };
}
