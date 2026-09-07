import { distanceToRoad, elevation, landmarks, seededRandom, shoreline } from "./layout";
import { REDWOOD_RING } from './redwoodRingLayout';

// Three selected tapered silhouettes. Keep the same number of choices and
// seeded draws so replacing the artwork does not rearrange the forest.
export const forestAtlasCells = [0, 1, 3] as const;
// The top pair has complete tips; the lower pair reaches the atlas cell edge.
export const sequoiaAtlasCells = [0, 1] as const;
type ForestTree = { x: number; z: number; height: number; width: number; variant: number; tint: number; grove: number; sequoia?: boolean; crownWidth?: number };

/** Mixed-age redwood groups; a few tall accents sit above a broken lower canopy. */
export function makeSawmillGrove(): ForestTree[] {
  const [sx, sz] = landmarks.find(l => l.id === "SCN_sawmill")!.position;
  const random = seededRandom(1892);
  const trees: ForestTree[] = [
    { x: sx - 44, z: sz - 21, height: 82, width: 31, crownWidth: 23, variant: 0, tint: .1, grove: .82, sequoia: true },
    { x: sx + 42, z: sz + 27, height: 59, width: 22, crownWidth: 17, variant: 1, tint: .25, grove: .72, sequoia: true },
  ];
  const clusters = [
    { x: sx - 25, z: sz - 61, rx: 30, rz: 24 },
    { x: sx + 31, z: sz - 67, rx: 27, rz: 25 },
    { x: sx + 62, z: sz - 6, rx: 25, rz: 35 },
  ];
  for (const cluster of clusters) {
    let count = 0;
    for (let attempt = 0; attempt < 180 && count < 4; attempt++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random());
      const x = cluster.x + Math.cos(angle) * radius * cluster.rx;
      const z = cluster.z + Math.sin(angle) * radius * cluster.rz;
      if (!forestClearance(x, z) || Math.hypot(x - sx, z - sz) < 44 || distanceToRoad([x,z]) < 13) continue;
      if (trees.some(tree => Math.hypot(x - tree.x, z - tree.z) < 12)) continue;
      const height = [45,67,35,54][count] + (random() - .5) * 10;
      trees.push({ x, z, height, width: height * (.36 + random() * .04), crownWidth: height * .28,
        variant: Math.floor(random() * sequoiaAtlasCells.length), tint: random() * .65, grove: .76, sequoia: true });
      count++;
    }
  }
  return trees;
}

/** Ordinary trees weave between the redwoods, without forming rings around them. */
export function makeSawmillCompanions(grove = makeSawmillGrove()): ForestTree[] {
  const [sx,sz] = landmarks.find(l=>l.id === "SCN_sawmill")!.position;
  const random = seededRandom(1985), trees: ForestTree[] = [];
  for (let attempt=0; attempt<480 && trees.length<22; attempt++) {
    const anchor=grove[attempt % grove.length], angle=random()*Math.PI*2, distance=9+random()*17;
    const x=anchor.x+Math.cos(angle)*distance, z=anchor.z+Math.sin(angle)*distance;
    if (!forestClearance(x,z) || Math.hypot(x-sx,z-sz)<38 || distanceToRoad([x,z])<8) continue;
    if (grove.some(tree=>Math.hypot(x-tree.x,z-tree.z)<Math.max(7,tree.height*.085))) continue;
    if (trees.some(tree=>Math.hypot(x-tree.x,z-tree.z)<7)) continue;
    const height=16+random()*18;
    trees.push({x,z,height,width:height*(.58+random()*.12),variant:Math.floor(random()*forestAtlasCells.length),
      tint:.2+random()*.55,grove:.65});
  }
  return trees;
}

// Broad ecological groups with clearings, rather than uniform random scatter.
export function forestDensity(x: number, z: number) {
  const bands = Math.sin(x * 0.023 + Math.sin(z * 0.012) * 2.1) * Math.cos(z * 0.021 - x * 0.009);
  return Math.max(0, Math.min(1, 0.46 + bands * 0.48 + Math.sin((x + z) * 0.048) * 0.14));
}

export function forestClearance(x: number, z: number) {
  if (Math.hypot(x - REDWOOD_RING.x, z - REDWOOD_RING.z) < REDWOOD_RING.reserveRadius) return false;
  if (x < shoreline(z) + 18 || distanceToRoad([x, z]) < 6) return false;
  if (x > -79 && x < 125 && z > -43 && z < 139) return false;
  if (x < -62 && z > 117 && z < 263) return false;
  if (Math.hypot((x + 25) / 1.4, z + 102) < 30) return false;
  return !landmarks.some(l => Math.hypot(x - l.position[0], z - l.position[1]) <
    (l.id === "SCN_station_yard" ? 40 : l.id === "SCN_sawmill" ? 33 : 17));
}

export function makeForestLayout() {
  const random = seededRandom(1957);
  const trees: ForestTree[] = [];
  // Grid jitter establishes a minimum average spacing, while the density field
  // makes groupings and quiet areas repeatable between reloads and light presets.
  for (let z = -950; z < 650; z += 12) for (let x = -335; x < 800; x += 12) {
    const px = x + (random() - 0.5) * 10, pz = z + (random() - 0.5) * 10;
    const density = forestDensity(px, pz);
    const ridge = Math.max(0, Math.min(1, (elevation(px, pz) - 105) / 95));
    if (random() > density * 0.85 * (1 - ridge * 0.68) || !forestClearance(px, pz)) continue;
    const height = (17 + random() * 19 + density * 5) * (1 - ridge * 0.24);
    trees.push({ x: px, z: pz, height, width: height * (0.56 + random() * 0.2), variant: Math.floor(random() * forestAtlasCells.length), tint: random(), grove: density });
  }
  const grove = makeSawmillGrove(), companions = makeSawmillCompanions(grove);
  // Keep ordinary trees between the tall trunks; clear only physical overlap,
  // not the former 15-unit bare circles around every redwood.
  return trees.filter(tree =>
    !grove.some(giant => Math.hypot(tree.x-giant.x,tree.z-giant.z)<Math.max(7,giant.height*.085)) &&
    !companions.some(nearby=>Math.hypot(tree.x-nearby.x,tree.z-nearby.z)<6)
  ).concat(grove,companions);
}
