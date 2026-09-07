import * as THREE from 'three';
import { elevation, seededRandom } from './layout';
import { REDWOOD_RING, REDWOOD_TREES, redwoodDetailLevel } from './redwoodRingLayout';
import { BAKE_LAYER } from './worldLightAtlas';
import type { Surface } from './painterlyArt';
import notes from './redwoodRingScene.generated.json';
import { patchMaterial, type ShaderPatch } from './lightingPatch';

type MaterialFactory = (color: THREE.ColorRepresentation, surface?: Surface) => THREE.MeshStandardMaterial;
type Shape = 'box' | 'pole' | 'stone' | 'ring' | 'cap';

/** Persistent grove silhouettes and shadows, with two instanced close-detail tiers. */
export function createRedwoodRingScene(material: MaterialFactory, bark: THREE.MeshStandardMaterial, crown: THREE.MeshStandardMaterial) {
  const root = new THREE.Group(); root.name = 'SCN_redwood_ring — old-growth clearing';
  const protectedMaterials=new Map<THREE.Material,THREE.Material>();
  const protect=(source:THREE.Material)=>{
    if(!protectedMaterials.has(source)) {
      const copy=source.clone();
      // Retain shared lighting uniforms; Material.clone serializes userData and
      // cannot copy the functions in our composed shader patches.
      delete copy.userData.shaderPatches;
      for(const patch of (source.userData.shaderPatches??[]) as ShaderPatch[])patchMaterial(copy,patch);
      copy.userData.revealProtected=true;protectedMaterials.set(source,copy);
    }
    return protectedMaterials.get(source)!;
  };
  root.userData.moduleItems = notes.items.map(item => item.id);
  const tiers = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  tiers.forEach((tier, i) => { tier.name = `redwood-detail-${i}`; root.add(tier); });
  const { x: cx, z: cz } = REDWOOD_RING;
  const wood = material(0x9a7956, 'bareWood'), darkWood = material(0x615044, 'bareWood');
  const moss = material(0x677754, 'ground'), coal = material(0x302e2a), stone = material(0x77786c, 'rock');
  const cream = material(0xcdbb97), rust = material(0x876b50, 'metalRoof');
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1), pole: new THREE.CylinderGeometry(.5, .5, 1, 10),
    stone: new THREE.DodecahedronGeometry(1, 1), ring: new THREE.TorusGeometry(1, .045, 5, 28),
    cap: new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  const batches = new Map<string, { tier: number; shape: Shape; mat: THREE.Material; matrices: THREE.Matrix4[]; tree?: boolean }>();
  const dummy = new THREE.Object3D();
  function add(tier: number, shape: Shape, mat: THREE.Material, p: THREE.Vector3, scale: number[], rotation = [0, 0, 0]) {
    dummy.position.copy(p); dummy.scale.fromArray(scale); dummy.rotation.set(...rotation as [number, number, number]); dummy.updateMatrix();
    const key = `${tier}/${shape}/${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { tier, shape, mat, matrices: [] });
    batches.get(key)!.matrices.push(dummy.matrix.clone());
  }
  const ground = (x: number, z: number, lift = 0) => new THREE.Vector3(x, elevation(x, z) + lift, z);
  function beam(tier: number, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number, depth = width, tree = false) {
    const key = `${tier}/pole/${mat.uuid}/${tree}`;
    if (!batches.has(key)) batches.set(key, { tier, shape: 'pole', mat, matrices: [], tree });
    dummy.position.copy(a).add(b).multiplyScalar(.5); dummy.scale.set(width, a.distanceTo(b), depth);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); dummy.updateMatrix();
    batches.get(key)!.matrices.push(dummy.matrix.clone());
  }
  function mesh(tier: number, geometry: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3, occluder=false) {
    const object = new THREE.Mesh(geometry, occluder?mat:protect(mat)); object.position.copy(p); object.receiveShadow = true;
    object.castShadow = tier === 0;
    if (tier === 0) { object.layers.enable(BAKE_LAYER.occluder); object.layers.enable(BAKE_LAYER.bounce); }
    tiers[tier].add(object); return object;
  }
  function item(id: string, p: THREE.Vector3) {
    const anchor = new THREE.Object3D(); anchor.name = 'item.redwood_ring.' + id;
    anchor.position.copy(p); root.add(anchor); return anchor;
  }
  // Terrain-conforming irregular patches avoid floating disks on this wooded slope.
  function patch(tier: number, x: number, z: number, radius: number, mat: THREE.Material, lift: number, seed: number) {
    // A single centre fan cuts through sloping terrain between its samples,
    // exposing pale diagonal gaps in the clearing when the canopy fades.
    const geo = new THREE.RingGeometry(0, radius, 40, Math.max(1,Math.ceil(radius/1.5))), positions = geo.attributes.position;
    const random = seededRandom(seed);
    for (let i = 0; i < positions.count; i++) {
      const r = Math.hypot(positions.getX(i),positions.getY(i))>=radius-.001 ? .965+random()*.07 : 1;
      const px = x + positions.getX(i) * r, pz = z - positions.getY(i) * r;
      positions.setXYZ(i, px, elevation(px, pz) + lift, pz);
    }
    geo.computeVertexNormals(); const object = mesh(tier, geo, mat, new THREE.Vector3());
    if(tier===0)object.name='redwood-clearing-ground';
    object.castShadow = false; return object;
  }
  const earth = material(0x7c7360, 'ground');
  patch(0, cx, cz, 19.5, earth, .14, 1985);
  for (let i = 0; i < 12; i++) {
    const angle = i * 2.4;
    patch(1, cx + Math.cos(angle) * 17, cz + Math.sin(angle) * 16, 1.8 + i % 3 * .6, moss, .19, i + 81);
  }

  // UVs select the existing redwood atlas's narrow bark strip and high crown.
  function trunkGeometry(radius: number, height: number, bottom = -.6) {
    const geometry = new THREE.LatheGeometry([
      new THREE.Vector2(radius * 1.3, bottom), new THREE.Vector2(radius, Math.max(bottom + 1, 3)),
      new THREE.Vector2(radius * .77, height * .28), new THREE.Vector2(radius * .56, height * .61),
      new THREE.Vector2(radius * .35, height * .86),
    ], 16);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, .525 + (uv.getX(i) - .5) * .065, .12 + uv.getY(i) * .38);
    return geometry;
  }
  const crownGeo = new THREE.PlaneGeometry(.38, .37); crownGeo.translate(0, .815, 0);
  const crownUv = crownGeo.attributes.uv;
  for (let i = 0; i < crownUv.count; i++) crownUv.setY(i, .38 + crownUv.getY(i) * .62);
  const facing = Math.atan2(-398, 487), random = seededRandom(1945);
  const hollowTree = REDWOOD_TREES.find(tree => tree.seed === 8)!;
  const scarTree = REDWOOD_TREES.find(tree => tree.seed === 9)!;
  for (const tree of REDWOOD_TREES) {
    const p = ground(tree.x, tree.z);
    const trunk = mesh(0, trunkGeometry(tree.radius, tree.height, tree === hollowTree ? 6.4 : -.6), bark, p,true);
    trunk.name = `redwood-trunk-${tree.seed}`;
    const canopy = mesh(0, crownGeo, crown, p,true); canopy.scale.setScalar(tree.height);
    canopy.rotation.y = facing; canopy.name = `redwood-crown-${tree.seed}`;
    canopy.layers.disable(BAKE_LAYER.occluder);
    for (let j = 0; j < 6; j++) {
      const angle = j / 6 * Math.PI * 2 + tree.seed * .7;
      // Keep the burned doorway open toward the fixed coastal viewing direction.
      if (tree === hollowTree && Math.cos(angle - (Math.PI / 2 - facing)) > .4) continue;
      const foot = ground(tree.x + Math.cos(angle) * (tree.radius + 2.6), tree.z + Math.sin(angle) * (tree.radius + 2.6), .08);
      beam(0, darkWood, p.clone().add(new THREE.Vector3(Math.cos(angle) * tree.radius * .6, 2.3, Math.sin(angle) * tree.radius * .6)), foot, 1.1, .8, true);
      add(1, 'stone', moss, foot.clone().add(new THREE.Vector3(0, .2, 0)), [.75, .18, .5], [0, angle, 0]);
    }
    // Broken radial branch stubs under the high canopy, kept away from the floor.
    for (let j = 0; j < 3; j++) {
      const a = j * 2.3 + tree.seed;
      const base = p.clone().add(new THREE.Vector3(0, tree.height * (.48 + j * .09), 0));
      beam(0, darkWood, base, base.clone().add(new THREE.Vector3(Math.cos(a) * 4.5, 1.5, Math.sin(a) * 4.5)), .7, .55, true);
    }
  }

  // An actual open arch with charred side walls, not a dark decal on a solid trunk.
  const hollowBase = ground(hollowTree.x, hollowTree.z), r = hollowTree.radius * 1.2;
  const arch = new THREE.Shape();
  arch.moveTo(-r, 0); arch.lineTo(-r * .82, 7); arch.lineTo(r * .82, 7); arch.lineTo(r, 0);
  arch.lineTo(1.3, 0); arch.lineTo(1.3, 2.7); arch.quadraticCurveTo(1.1, 4.1, 0, 4.55);
  arch.quadraticCurveTo(-1.1, 4.1, -1.3, 2.7); arch.lineTo(-1.3, 0); arch.closePath();
  const archGeo = new THREE.ExtrudeGeometry(arch, { depth: 3.8, bevelEnabled: false, curveSegments: 10 });
  archGeo.translate(0, -.3, -1.9);
  const burned = mesh(0, archGeo, darkWood, hollowBase); burned.rotation.y = facing;
  const local = (v: THREE.Vector3) => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(hollowBase);
  add(0, 'box', coal, local(new THREE.Vector3(0, 2, -1.95)), [2.65, 4.3, .2], [0, facing, 0]);
  add(1, 'box', coal, local(new THREE.Vector3(0, .12, 0)), [2.55, .18, 3.8], [0, facing, 0]);
  for (const side of [-1, 1]) add(1, 'box', coal, local(new THREE.Vector3(side * 1.32, 1.6, 0)), [.15, 3.3, 3.8], [0, facing, side * .025]);
  item('fire_scar', local(new THREE.Vector3(0, 2, 2)));

  // Scarred bark: healed axe cuts and indistinct paired initials on the front face.
  const scar = ground(scarTree.x, scarTree.z, 2.4);
  const onScar = (x: number, y: number, z = scarTree.radius + .1) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(scar);
  for (let i = 0; i < 4; i++) add(1, 'box', wood, onScar((i % 2 - .5) * .18, i * .36), [.95 - i * .09, .12, .08], [0, facing, -.1 + i * .06]);
  for (let i = 0; i < 6; i++) add(2, 'box', coal, onScar(-.4 + i * .15, 1.6 + i % 2 * .16, scarTree.radius + .16), [.05, .3, .03], [0, facing, i % 2 ? .35 : -.3]);
  item('axe_scarred_trunk', onScar(0, .6));

  const mushroomTree = REDWOOD_TREES.find(tree => tree.seed === 7)!;
  item('mushroom_ring', ground(mushroomTree.x - 1, mushroomTree.z + 3.4, .5));
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2, radius = 3.7 + Math.sin(i * 1.9) * .12;
    const p = ground(mushroomTree.x + Math.cos(angle) * radius, mushroomTree.z + Math.sin(angle) * radius, .25);
    const height = .3 + random() * .3;
    add(2, 'pole', cream, p, [.09, height, .09]);
    add(2, 'cap', cream, p.clone().add(new THREE.Vector3(0, height * .5, 0)), [.25 + random() * .1, .14, .25]);
  }

  // Wide cut stump with growth rings and two recessed springboard notches.
  const stump = ground(cx - 34, cz + 10), stumpRadius = 3.1;
  mesh(0, new THREE.CylinderGeometry(stumpRadius, 3.7, 2.8, 20), darkWood, stump.clone().add(new THREE.Vector3(0, 1.1, 0)));
  mesh(1, new THREE.CylinderGeometry(3.04, 3.04, .13, 32), wood, stump.clone().add(new THREE.Vector3(0, 2.54, 0)));
  for (let i = 1; i <= 9; i++) add(2, 'ring', darkWood, stump.clone().add(new THREE.Vector3(.07, 2.62 + i * .001, -.1)), [i * .29, i * .28, .22], [-Math.PI / 2, 0, i * .08]);
  for (const side of [-1, 1]) {
    const pos = new THREE.Vector3(side * 1.4, 1.4, 2.93).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing).add(stump);
    add(1, 'box', wood, pos, [.85, .62, .16], [0, facing, 0]);
    add(1, 'box', coal, pos.clone().add(new THREE.Vector3(Math.sin(facing) * .09, 0, Math.cos(facing) * .09)), [.58, .38, .08], [0, facing, 0]);
  }
  item('giant_stump', stump.clone().add(new THREE.Vector3(0, 2.7, 0)));

  // Fallen nurse log follows the slope; the moss and seedlings follow its axis.
  const logA = ground(cx + 5, cz + 8, 1.3), logB = ground(cx + 16, cz + 12, 1.3);
  beam(0, darkWood, logA, logB, 2.9, 2.5);
  for (let i = 0; i < 17; i++) {
    const p = logA.clone().lerp(logB, i / 16); p.y += 1.18;
    add(1, 'stone', moss, p, [.6 + random() * .25, .28, .8], [0, random() * 3, 0]);
    if (i % 3 === 1) {
      const height = .9 + random() * 1.1;
      beam(2, darkWood, p, p.clone().add(new THREE.Vector3(0, height, 0)), .09);
      for (let j = 0; j < 4; j++) {
        const leaf = p.clone().add(new THREE.Vector3(0, height * (.35 + j * .16), 0));
        add(2, 'stone', moss, leaf, [.55 - j * .1, .12, .3], [0, j * 1.5 + i, .08]);
      }
    }
  }
  item('nurse_log', logA.clone().lerp(logB, .5).add(new THREE.Vector3(0, 1.5, 0)));

  // Cold camp: ash, charred stones and flattened cans; deliberately no active fire.
  patch(1, cx, cz, 2.55, coal, .25, 912);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, radius = 2.75 + random() * .12;
    add(1, 'stone', stone, ground(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius, .52), [.65, .5, .5], [0, a, random() * .12]);
  }
  for (let i = 0; i < 5; i++) {
    const x = cx - 1.2 + random() * 2.4, z = cz - 1.2 + random() * 2.4;
    add(2, 'pole', i % 2 ? rust : cream, ground(x, z, .35), [.36, .14, .55], [0, random() * 3, .2]);
  }
  item('fire_ring', ground(cx, cz, .6));
  const can = ground(cx + 3.6, cz - 1.1, .65);
  add(1, 'stone', stone, ground(cx + 4.3, cz - 1.2, .6), [.65, .7, .6]);
  add(1, 'stone', stone, ground(cx + 3.4, cz - 2, .4), [.8, .5, .5]);
  add(2, 'pole', rust, can, [.65, .85, .65]);
  add(2, 'pole', rust, can.clone().add(new THREE.Vector3(0, .45, 0)), [.7, .08, .7]);
  add(2, 'ring', darkWood, can.clone().add(new THREE.Vector3(0, .5, 0)), [.29, .29, .35], [-Math.PI / 2, 0, 0]);
  item('tin_register', can);

  for (const batch of batches.values()) {
    const object = new THREE.InstancedMesh(shapes[batch.shape], batch.tree?batch.mat:protect(batch.mat), batch.matrices.length);
    batch.matrices.forEach((matrix, index) => object.setMatrixAt(index, matrix));
    object.instanceMatrix.needsUpdate = true; object.receiveShadow = true; object.castShadow = batch.tier === 0;
    if (batch.tier === 0) { object.layers.enable(BAKE_LAYER.occluder); object.layers.enable(BAKE_LAYER.bounce); }
    tiers[batch.tier].add(object);
  }
  let level = -1;
  return { root, update(zoom: number) {
    const next = redwoodDetailLevel(zoom, level);
    if (next === level) return;
    level = next; tiers[1].visible = level >= 1; tiers[2].visible = level >= 2; root.userData.detailLevel = level;
  } };
}
