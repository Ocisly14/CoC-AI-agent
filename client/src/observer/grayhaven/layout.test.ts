import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { elevation, landmarks, locations, moduleData, roadPaths, shoreline } from "./layout";

const sourceDir = path.resolve("testmods/grayhaven/Grayhaven_Scenarios");
const source = fs.readdirSync(sourceDir).filter(file => file.endsWith(".json"))
  .map(file => JSON.parse(fs.readFileSync(path.join(sourceDir, file), "utf8")));

describe("Grayhaven authored overview / module boundary", () => {
  it("covers exactly the module's exterior nodes, without exporting interior descriptions", () => {
    const nodeIds = source.filter(item => item.id.startsWith("SCN_") && !item.parentLocationId).map(item => item.id).sort();
    expect(landmarks.map(item => item.id).sort()).toEqual(nodeIds);
    expect(new Set(landmarks.map(item => item.id)).size).toBe(16);
    for (const location of locations) expect(location.description).toBeTruthy();
    for (const location of moduleData.locations.filter(item => !item.isNode)) expect(location).not.toHaveProperty("description");
  });

  it("preserves all road endpoints, travel times and access positions from the module", () => {
    const roads = source.filter(item => item.id.startsWith("ROAD_"));
    expect(roadPaths).toHaveLength(roads.length);
    expect(roads).toHaveLength(19);
    for (const road of roadPaths) {
      const original = roads.find(item => item.id === road.id);
      expect(road.from).toBe(original.references.connections.find(item => item.role === "endpointA").targetId);
      expect(road.to).toBe(original.references.connections.find(item => item.role === "endpointB").targetId);
      expect(road.minutes).toBe(original.travelTimeMinutes);
      expect(road.driveMinutes).toBe(original.driveTimeMinutes);
      expect(road.access).toEqual(original.references.connections.filter(item => item.role === "access").map(item => ({ id: item.targetId, position: item.position })));
      expect(road.points[0]).toEqual(landmarks.find(item => item.id === road.from)!.position);
      expect(road.points.at(-1)).toEqual(landmarks.find(item => item.id === road.to)!.position);
    }
  });

  it("keeps every mapped outdoor location and road on finite, above-water terrain", () => {
    const points = [...landmarks.map(item => item.position), ...roadPaths.flatMap(road => road.points)];
    for (const [x, z] of points) {
      expect(Number.isFinite(elevation(x, z))).toBe(true);
      expect(x).toBeGreaterThan(shoreline(z));
      expect(elevation(x, z)).toBeGreaterThan(0);
    }
  });
});
