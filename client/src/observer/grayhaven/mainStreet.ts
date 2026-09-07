import * as THREE from "three";
import { roadPaths } from "./layout";

export type ShopKind = "diner" | "grocery" | "sheriff" | "arcade" | "repair" | "clinic" | "vacant";
export type StreetBuilding = {
  id: string; kind: ShopKind; side: -1 | 1; width: number; depth: number;
  height: number; floors: 1 | 2; paint: number; accent: number; roof: number;
  sign?: string; signIndex?: number; along?: number;
  centerShift?: number; setback?: number;
};

// Store identity, ordering and upstairs use come from the module. Dimensions,
// unmentioned street sides and the restrained paint palette are overview art choices.
export const mainStreetBuildings: StreetBuilding[] = [
  { id: "SCN_bluebird_dining", kind: "diner", side: -1, width: 14, depth: 22, height: 11.8, centerShift: -4, floors: 2, paint: 0xabbfbd, accent: 0x537f90, roof: 0x92796b, sign: "BLUEBIRD", signIndex: 0 },
  { id: "SCN_grocery_store", kind: "grocery", side: -1, width: 8, depth: 23, height: 5.6, centerShift: 1, floors: 1, paint: 0xc1ad80, accent: 0x777753, roof: 0x837d68, sign: "GROCERY · POST", signIndex: 1 },
  { id: "SCN_sheriff_front", kind: "sheriff", side: 1, width: 15, depth: 12, height: 7.2, floors: 1, paint: 0xb2b7a6, accent: 0x64746d, roof: 0x777b75, sign: "SHERIFF", signIndex: 2 },
  { id: "SCN_arcade", kind: "arcade", side: -1, width: 11.5, depth: 12, height: 5.6, centerShift: -1, floors: 1, paint: 0x8b959c, accent: 0x56647f, roof: 0x656a76, sign: "STARPORT", signIndex: 3 },
  { id: "SCN_batra_shop", kind: "repair", side: -1, width: 6.2, depth: 18, height: 13.8, floors: 2, paint: 0xb29880, accent: 0x718b7e, roof: 0x71645d, sign: "BATRA · TV", signIndex: 4 },
  { id: "SCN_clinic_waiting", kind: "clinic", side: 1, width: 11.5, depth: 12, height: 10.2, setback: 3, floors: 2, paint: 0xd6d3be, accent: 0x7f9a92, roof: 0x6d867d, sign: "CLINIC", signIndex: 5 },
  ...([[-1,.36,9],[-1,.47,6],[-1,.92,8],[1,.07,8],[1,.40,7],[1,.51,9],[1,.64,6],[1,.96,6]] as const).map(([side, along, width], i) => ({
    id: `overview_vacant_${i}`, kind: "vacant" as const, side, along, width,
    depth: 9 + i % 4 * 2, height: 4.6 + i % 3 * 1.2, floors: 1 as const,
    paint: [0xb9b3a0, 0xadb3a3, 0xb5a294][i % 3], accent: 0x8a8878, roof: 0x85827a,
  })),
];

export function mainStreetPlots() {
  const road = roadPaths.find(r => r.id === "ROAD_main_street")!;
  const curve = new THREE.CatmullRomCurve3(road.points.map(([x,z]) => new THREE.Vector3(x,0,z)), false, "centripetal");
  return mainStreetBuildings.map(building => {
    const along = building.along ?? road.access.find(a => a.id === building.id)?.position;
    if (along === undefined) throw new Error(`Missing module street entrance: ${building.id}`);
    const point = curve.getPointAt(along), tangent = curve.getTangentAt(along).normalize();
    const outward = new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(building.side);
    const center = point.clone().addScaledVector(outward, 9 + (building.setback ?? 0) + building.depth / 2).addScaledVector(tangent, building.centerShift ?? 0);
    return { ...building, along, center, angle: Math.atan2(-outward.x, -outward.z), outward };
  });
}
