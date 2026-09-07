import moduleData from "./grayhaven.generated.json";

export type Point = [number, number];
export type Region = "town" | "coast" | "forest";
export type Landmark = {
  id: string;
  position: Point;
  english: string;
  region: Region;
  label?: boolean;
};

// Authored overview coordinates, not a geographic or walking-distance scale.
export const landmarks: Landmark[] = [
  { id: "SCN_main_north", position: [0, -8], english: "MAIN STREET", region: "town", label: true },
  { id: "SCN_main_south", position: [-14, 90], english: "SOUTH JUNCTION", region: "town" },
  { id: "SCN_dock", position: [shoreline(132) + 14, 132], english: "THE OLD HARBOR", region: "coast", label: true },
  { id: "SCN_lighthouse_cliff", position: [shoreline(224) + 16, 224], english: "GRAYHAVEN LIGHT", region: "coast", label: true },
  { id: "SCN_reyes_gate", position: [38, 109], english: "REYES HOUSE", region: "town" },
  { id: "SCN_holt_gate", position: [71, -18], english: "HOLT HOUSE", region: "town" },
  { id: "SCN_motel", position: [-20, -96], english: "COASTLINE MOTEL", region: "town", label: true },
  { id: "SCN_trailhead", position: [62, -66], english: "REDWOOD TRAIL", region: "forest" },
  { id: "SCN_creek_ford", position: [119, -107], english: "GRAY CREEK", region: "forest", label: true },
  { id: "SCN_railbed", position: [126, -26], english: "OLD RAILBED", region: "forest" },
  { id: "SCN_sawmill", position: [170, -147], english: "ABANDONED SAWMILL", region: "forest", label: true },
  { id: "SCN_fog_hollow", position: [208, -65], english: "FOG HOLLOW", region: "forest", label: true },
  { id: "SCN_redwood_ring", position: [151, -236], english: "REDWOOD CIRCLE", region: "forest" },
  { id: "SCN_fence", position: [83, -288], english: "THE PERIMETER", region: "forest" },
  { id: "SCN_gate", position: [5, -258], english: "AUTOMATIC GATE", region: "forest" },
  { id: "SCN_station_yard", position: [12, -317], english: "RADLEY STATION", region: "forest", label: true },
];

export const bends: Record<string, Point[]> = {
  ROAD_main_street: [[-3, 30], [-7, 62]],
  ROAD_backstreet: [[8, 99], [27, 95]],
  ROAD_dock_slope: [[-48, 111], [-96, 123]],
  ROAD_cliff_path: [[shoreline(162) + 24, 162], [shoreline(194) + 25, 194]],
  ROAD_old_coast_road: [[-26, -30], [-33, -59]],
  ROAD_holt_lane: [[33, -4], [51, -23]],
  ROAD_trail_access: [[27, -43]],
  ROAD_trail_creek: [[87, -93]],
  ROAD_trail_railbed: [[93, -61], [107, -40]],
  ROAD_creek_sawmill: [[128, -134], [151, -135]],
  ROAD_railbed_sawmill: [[139, -69], [153, -109]],
  ROAD_sawmill_redwood: [[185, -180], [165, -205]],
  ROAD_sawmill_fog: [[199, -130], [189, -92]],
  ROAD_fog_creek: [[188, -103], [158, -91]],
  ROAD_fog_railbed: [[186, -34], [158, -37]],
  ROAD_fog_redwood: [[236, -128], [219, -191], [185, -223]],
  ROAD_redwood_fence: [[120, -249], [108, -278]],
  ROAD_station_drive: [[-53, -142], [-42, -179], [-6, -194], [26, -214], [1, -236]],
  ROAD_station_approach: [[-3, -285]],
};

export const roadPaths = moduleData.roads.map((road) => {
  const from = landmarks.find((point) => point.id === road.from);
  const to = landmarks.find((point) => point.id === road.to);
  if (!from || !to) throw new Error("Missing Grayhaven map endpoint: " + road.id);
  return { ...road, points: [from.position, ...(bends[road.id] ?? []), to.position] };
});

export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shoreline(z: number) {
  // The vegetated backshore of a broad crescent, with projecting headlands.
  return -335 + 270 * Math.exp(-((z / 210) ** 2)) + 3 * Math.sin(z * 0.026);
}

export function beachAmount(z: number) {
  return Math.exp(-((z / 190) ** 4));
}

export function coastWidth(z: number) {
  return 14 + beachAmount(z) * 72;
}

export function waterline(z: number) {
  return shoreline(z) - coastWidth(z);
}

// An elongated hollow cut into the eastern slope, opening toward the western trails.
// Shared with the local mist so its bank remains inside the lowered terrain.
export const FOG_HOLLOW = { x: 208, z: -65, radiusX: 62, radiusZ: 92, floor: 56, mistDepth: 22 };

function rawElevation(x: number, z: number) {
  const hill = (cx: number, cz: number, sx: number, sz: number, height: number) =>
    height * Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2);
  const north = hill(-5, -340, 190, 135, 172);
  const east = hill(300, -80, 135, 300, 218);
  const south = hill(110, 300, 185, 115, 152);
  const northCape = hill(-225, -265, 110, 95, 83);
  const southCape = hill(-245, 240, 90, 80, 63);
  const ridges = Math.sqrt(north*north + east*east + south*south + northCape*northCape + southCape*southCape);
  const basin = Math.exp(-(((x - 10) / 152) ** 4) - ((z - 27) / 158) ** 4);
  const variation = Math.sin(x * 0.025 + z * 0.01) * Math.cos(z * 0.027) * (2 + ridges * 0.025);
  const inland = 13 + ridges * (1 - basin * 0.96) + variation;
  const coast = 4 + 43 * Math.exp(-(((z + 265) / 85) ** 2)) + 39 * Math.exp(-(((z - 240) / 65) ** 2));
  const coastalBlend = Math.exp(-Math.max(0, x - shoreline(z)) / 48);
  const height = inland * (1 - coastalBlend) + coast * coastalBlend;
  const radius = Math.hypot((x - FOG_HOLLOW.x) / FOG_HOLLOW.radiusX, (z - FOG_HOLLOW.z) / FOG_HOLLOW.radiusZ);
  const t = Math.max(0, Math.min(1, (radius - .28) / .72));
  const hollow = 1 - t*t*t*(t*(t*6-15)+10);
  const floor = FOG_HOLLOW.floor + (x - FOG_HOLLOW.x) * .035 + (z - FOG_HOLLOW.z) * .018;
  // Only excavate: the low western approach stays open, and the outer slope has no seam.
  return height - Math.max(0, height - floor) * hollow;
}

const terraces = landmarks.filter(l => ["SCN_station_yard", "SCN_sawmill", "SCN_lighthouse_cliff", "SCN_dock"].includes(l.id))
  .map(l => ({ x: l.position[0], z: l.position[1], height: rawElevation(...l.position),
    radius: l.id === "SCN_station_yard" ? 34 : l.id === "SCN_sawmill" ? 26 : l.id === "SCN_dock" ? 13 : 18 }));

export function elevation(x: number, z: number) {
  let height = rawElevation(x, z);
  for (const terrace of terraces) {
    const distance = Math.hypot(x - terrace.x, z - terrace.z);
    const t = Math.max(0, Math.min(1, (distance - terrace.radius) / 42));
    const blend = 1 - t*t*(3 - 2*t);
    height = height * (1 - blend) + terrace.height * blend;
  }
  return height;
}

export function coastalElevation(z: number, t: number) {
  const beach = beachAmount(z), top = elevation(shoreline(z), z);
  const cliff = top * Math.pow(1 - t, 0.6) - t * 0.55;
  const sand = top * Math.pow(1 - t, 3.2) + Math.sin(t * Math.PI) * 1.2 - t * 0.55;
  return cliff * (1 - beach) + sand * beach;
}

export function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

export function distanceToRoad(p: Point) {
  let distance = Infinity;
  for (const road of roadPaths) for (let i = 1; i < road.points.length; i++) {
    distance = Math.min(distance, pointSegmentDistance(p, road.points[i - 1], road.points[i]));
  }
  return distance;
}

export const locations = landmarks.map((point) => ({ ...point, ...moduleData.locations.find((place) => place.id === point.id)! }));
export { moduleData };
