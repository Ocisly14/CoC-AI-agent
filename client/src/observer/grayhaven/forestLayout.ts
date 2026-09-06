import { distanceToRoad, elevation, landmarks, seededRandom, shoreline } from "./layout";

// Broad ecological groups with clearings, rather than uniform random scatter.
export function forestDensity(x: number, z: number) {
  const bands = Math.sin(x * 0.023 + Math.sin(z * 0.012) * 2.1) * Math.cos(z * 0.021 - x * 0.009);
  return Math.max(0, Math.min(1, 0.46 + bands * 0.48 + Math.sin((x + z) * 0.048) * 0.14));
}

export function forestClearance(x: number, z: number) {
  if (x < shoreline(z) + 18 || distanceToRoad([x, z]) < 6) return false;
  if (x > -79 && x < 125 && z > -43 && z < 139) return false;
  if (x < -62 && z > 117 && z < 263) return false;
  if (Math.hypot((x + 25) / 1.4, z + 102) < 30) return false;
  return !landmarks.some(l => Math.hypot(x - l.position[0], z - l.position[1]) <
    (l.id === "SCN_station_yard" ? 40 : l.id === "SCN_sawmill" ? 33 : 17));
}

export function makeForestLayout() {
  const random = seededRandom(1957);
  const trees: { x: number; z: number; height: number; width: number; variant: number; tint: number; grove: number }[] = [];
  // Grid jitter establishes a minimum average spacing, while the density field
  // makes groupings and quiet areas repeatable between reloads and light presets.
  for (let z = -950; z < 650; z += 12) for (let x = -335; x < 800; x += 12) {
    const px = x + (random() - 0.5) * 10, pz = z + (random() - 0.5) * 10;
    const density = forestDensity(px, pz);
    const ridge = Math.max(0, Math.min(1, (elevation(px, pz) - 105) / 95));
    if (random() > density * 0.85 * (1 - ridge * 0.68) || !forestClearance(px, pz)) continue;
    const height = (17 + random() * 19 + density * 5) * (1 - ridge * 0.24);
    trees.push({ x: px, z: pz, height, width: height * (0.56 + random() * 0.2), variant: Math.floor(random() * 4), tint: random(), grove: density });
  }
  return trees;
}
