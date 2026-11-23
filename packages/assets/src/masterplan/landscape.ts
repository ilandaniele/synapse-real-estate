import { cylinderMesh, mergeAll, sphereMesh, translate } from "../geometry";
import { mulberry32 } from "../raytracer/math";
import { add, block, mergeParts, type Parts } from "./parts";
import { plant, type PlantKind } from "./plants";
import { ROAD_HALF, TERRAIN_SIZE, plotDistance, roadCenterZ, roadDistance, roadStrip, terrainHeight } from "./terrain";

const EDGE = TERRAIN_SIZE / 2 - 4;
const CURB = 0.35;

/** Asphalt, raised curbs on both sides and a dashed center line. */
export function roadParts(): Parts {
  const parts: Parts = {};
  add(parts, "Road_Asphalt", roadStrip(-ROAD_HALF, ROAD_HALF, 0.07));
  add(parts, "Road_Curb", roadStrip(-ROAD_HALF - CURB, -ROAD_HALF, 0.16));
  add(parts, "Road_Curb", roadStrip(ROAD_HALF, ROAD_HALF + CURB, 0.16));
  const dashes = [];
  for (let x = -TERRAIN_SIZE / 2 + 2; x < TERRAIN_SIZE / 2 - 3; x += 6) dashes.push(roadStrip(-0.08, 0.08, 0.09, x, x + 3, 3));
  add(parts, "Road_Marking", mergeAll(dashes));
  return parts;
}

/** Street lamps every 20 m, alternating sides of the road. */
export function streetLights(): Parts {
  const parts: Parts = {};
  let side = 1;
  for (let x = -90; x <= 90; x += 20) {
    const z = roadCenterZ(x) + side * (ROAD_HALF + 0.9);
    const y = terrainHeight(x, z);
    add(parts, "Metal_Steel", translate(cylinderMesh(0.07, 5, 6), x, y, z));
    add(parts, "Metal_Steel", block(x, y + 4.95, z - side * 0.45, 0.12, 0.08, 0.9));
    add(parts, "Lamp_Glow", translate(sphereMesh(0.22, 8, 5), x, y + 4.8, z - side * 0.85));
    side = -side;
  }
  return parts;
}

const TREE_MIX: PlantKind[] = ["pine", "pine", "olive", "cypress", "broadleaf", "pine", "olive"];

/** Scattered trees and shrubs on open ground, clear of plots and the road. */
export function vegetation(trees = 70, bushes = 60): Parts {
  const parts: Parts = {};
  const rand = mulberry32(2024);
  const scatter = (count: number, clearance: number, place: (x: number, z: number, i: number) => void) => {
    let placed = 0;
    for (let guard = 0; placed < count && guard < count * 80; guard++) {
      const x = (rand() * 2 - 1) * EDGE;
      const z = (rand() * 2 - 1) * EDGE;
      if (plotDistance(x, z) < clearance || roadDistance(x, z) < clearance) continue;
      place(x, z, placed++);
    }
  };
  scatter(trees, 4, (x, z, i) => {
    const kind = TREE_MIX[i % TREE_MIX.length] ?? "pine";
    mergeParts(parts, plant(kind, x, terrainHeight(x, z), z, 0.75 + rand() * 0.55, 0.8 + rand() * 0.45, i * 7));
  });
  scatter(bushes, 1.5, (x, z, i) => {
    mergeParts(parts, plant("bush", x, terrainHeight(x, z), z, 0.7 + rand() * 0.8, 0.8 + rand() * 0.5, 5000 + i * 3));
  });
  return parts;
}
