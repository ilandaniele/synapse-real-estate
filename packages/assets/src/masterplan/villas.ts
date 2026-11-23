import { hipRoofMesh, lumpy, mirrorX, quadMesh, scaleMesh, sphereMesh, translate, type MeshData } from "../geometry";
import { add, block, car, gardenWalls, glassRail, glazing, lounger, mergeParts, parapet, pergola, pool, type Parts } from "./parts";
import { plant } from "./plants";
import { PLOT_D, PLOT_W } from "./terrain";

/**
 * Villa models in a local frame: plot centered on the origin, ground at y = 0, house toward -Z and
 * garden/pool toward +Z. `streetSide` only moves the garden gate.
 */
export interface VillaParts {
  body: Parts;
  roof: Parts;
  pool: Parts;
  garden: Parts;
  plot: MeshData;
  /** Highest point of the house, for the label anchor. */
  height: number;
}

type Rgb = readonly [number, number, number];

interface Site {
  streetSide: 1 | -1;
  carColor: Rgb;
  seed: number;
}

type Typology = (site: Site) => Omit<VillaParts, "plot">;

const HALF_W = PLOT_W / 2 - 1;
const HALF_D = PLOT_D / 2 - 1;
const HALF_PI = Math.PI / 2;

function emptyVilla(): Pick<VillaParts, "body" | "roof" | "pool" | "garden"> {
  return { body: {}, roof: {}, pool: {}, garden: {} };
}

function driveway(garden: Parts, x: number, w: number, site: Site, carport = false): void {
  add(garden, "Paving_Stone", block(x, 0, 0, w, 0.1, 2 * HALF_D - 0.4));
  car(garden, x, 0.1, site.streetSide * 8, 0, site.carColor);
  gardenWalls(garden, HALF_W, HALF_D, site.streetSide, x, w + 0.2);
  if (!carport) return;
  const cz = site.streetSide * 8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(garden, "Metal_Steel", block(x + sx * (w / 2 - 0.2), 0.1, cz + sz * 2.8, 0.14, 2.5, 0.14));
  add(garden, "Zinc_Dark", block(x, 2.6, cz, w + 0.3, 0.16, 6.4));
}

function shrubs(garden: Parts, spots: Array<[number, number]>, seed: number): void {
  spots.forEach(([x, z], i) => mergeParts(garden, plant("bush", x, 0, z, 0.8 + ((i * 37) % 5) * 0.12, 0.85 + ((i * 53) % 7) * 0.05, seed + i * 11)));
}

/** Cubist villa: white ground floor, timber upper floor, roof terrace with glass balustrade. */
const cubist: Typology = (site) => {
  const { body, roof, pool: water, garden } = emptyVilla();

  add(body, "Render_White", block(-0.5, 0, -7, 18, 3.3, 10));
  add(body, "Render_White", block(-0.5, 3.3, -6.7, 18.8, 0.35, 11.4));
  add(body, "Wood_Cladding", block(3, 3.65, -6.5, 11, 3.1, 9));
  add(body, "Render_White", block(3, 6.75, -6.5, 11.6, 0.35, 9.6));
  add(body, "Stone_Limestone", block(-9.2, 0, -1.6, 0.7, 3.3, 1.4));

  glazing(body, { x: 0.25, y: 0.1, z: -1.98, w: 15.5, h: 2.8, yaw: 0, mullion: 1.9 });
  glazing(body, { x: 3, y: 3.95, z: -1.98, w: 8, h: 2.4, yaw: 0, mullion: 2 });
  glazing(body, { x: -9.52, y: 0.6, z: -7, w: 4, h: 2.2, yaw: -HALF_PI, mullion: 2 });
  glazing(body, { x: 8.52, y: 4.0, z: -6.5, w: 5, h: 2.2, yaw: HALF_PI, mullion: 1.7 });
  glazing(body, { x: -4, y: 1.8, z: -12.02, w: 3, h: 1.2, yaw: Math.PI });
  glazing(body, { x: 3, y: 4.6, z: -11.02, w: 6, h: 1.4, yaw: Math.PI, mullion: 2 });

  add(body, "Deck_Teak", block(-6.1, 3.65, -6.7, 6.6, 0.06, 11));
  glassRail(body, -6.3, 3.65, -1.15, 7, 0);
  glassRail(body, -9.75, 3.65, -6.7, 11, HALF_PI);

  add(roof, "Roof_Gravel", block(3, 7.1, -6.5, 11, 0.04, 9));
  parapet(roof, "Render_White", 3, 7.1, -6.5, 11.6, 9.6, 0.4);

  add(garden, "Deck_Teak", block(-0.5, 0, 0.5, 19, 0.15, 5));
  pool(water, -2.5, 6.8, 11, 3.6);
  lounger(garden, -6, 0, 11, 0);
  lounger(garden, -4.6, 0, 11, 0);
  add(garden, "Deck_Teak", block(-13.5, 0, -6, 5.6, 0.15, 6.4));
  pergola(garden, -13.5, 0.15, -6, 5.2, 6);
  driveway(garden, 13.5, 5, site);
  mergeParts(garden, plant("broadleaf", -14, 0, 10.5, 0.8, 1, site.seed));
  shrubs(garden, [[-11, 3], [9.5, 3.5], [6, 11], [-15, 1]], site.seed);
  return { body, roof, pool: water, garden, height: 7.5 };
};

/** Mediterranean villa: cream render on a limestone plinth, terracotta hip roofs, shutters and a vine pergola. */
const mediterranean: Typology = (site) => {
  const { body, roof, pool: water, garden } = emptyVilla();
  const volumes = [
    { x: -3, z: -8, w: 13, d: 9, h: 6.2, pitch: 2.4 },
    { x: 7.5, z: -8.5, w: 8, d: 7, h: 3.2, pitch: 1.6 },
  ];
  for (const v of volumes) {
    add(body, "Stone_Limestone", block(v.x, 0, v.z, v.w + 0.3, 0.6, v.d + 0.3));
    add(body, "Render_Cream", block(v.x, 0.6, v.z, v.w, v.h - 0.6, v.d));
    add(roof, "Render_Cream", block(v.x, v.h, v.z, v.w + 1, 0.14, v.d + 1));
    add(roof, "Roof_Terracotta", translate(hipRoofMesh(v.w + 1, v.d + 1, v.pitch), v.x, v.h + 0.14, v.z));
  }
  add(roof, "Render_Cream", block(-6.5, 6.2, -10, 0.9, 3.6, 0.9));
  add(roof, "Roof_Dark", block(-6.5, 9.8, -10, 1.2, 0.15, 1.2));

  glazing(body, { x: -3, y: 0.6, z: -3.48, w: 1.6, h: 2.4, yaw: 0, mullion: 0.8 });
  for (const x of [-7, 1]) glazing(body, { x, y: 1.2, z: -3.48, w: 1.5, h: 1.7, yaw: 0, shutters: true });
  for (const x of [-7, -3, 1]) glazing(body, { x, y: 3.8, z: -3.48, w: 1.3, h: 1.6, yaw: 0, shutters: true });
  for (const x of [5.5, 9.5]) glazing(body, { x, y: 0.6, z: -4.98, w: 2, h: 2.3, yaw: 0, mullion: 1 });
  for (const y of [1.2, 3.8]) glazing(body, { x: -9.52, y, z: -8, w: 1.3, h: 1.6, yaw: -HALF_PI, shutters: true });
  glazing(body, { x: 11.52, y: 1.2, z: -8.5, w: 1.5, h: 1.6, yaw: HALF_PI, shutters: true });
  glazing(body, { x: -3, y: 3.8, z: -12.52, w: 1.3, h: 1.6, yaw: Math.PI, shutters: true });

  add(garden, "Paving_Stone", block(1, 0, -1.5, 22, 0.12, 4));
  pergola(garden, 7.5, 0.12, -2, 7, 3.6);
  add(garden, "Hedge", translate(scaleMesh(lumpy(sphereMesh(1, 12, 6), 0.25, site.seed), 3.6, 0.22, 1.9), 7.5, 3.15, -2));
  pool(water, -2, 5.5, 10, 4.5, "Stone_Limestone");
  lounger(garden, -5, 0, 9.6, 0);
  lounger(garden, -3.6, 0, 9.6, 0);
  driveway(garden, -14, 4, site);
  mergeParts(garden, plant("olive", -9, 0, 10, 1, 1, site.seed));
  mergeParts(garden, plant("olive", 10, 0, 9, 0.9, 1.1, site.seed + 5));
  [-11, -6, -1, 4].forEach((z, i) => mergeParts(garden, plant("cypress", 15.2, 0, z, 0.6, 1, site.seed + 20 + i)));
  shrubs(garden, [[3.5, 1.5], [12, 1.5], [-9, 1.5]], site.seed);
  return { body, roof, pool: water, garden, height: 10 };
};

/** Courtyard villa: L-shaped single storey with green roofs, a zinc-clad studio on top and a lap pool. */
const courtyard: Typology = (site) => {
  const { body, roof, pool: water, garden } = emptyVilla();
  const wings = [
    { x: -1, z: -9.5, w: 22, d: 7 },
    { x: 6.5, z: -1, w: 7, d: 10 },
  ];
  for (const v of wings) {
    add(body, "Render_White", block(v.x, 0, v.z, v.w, 3.4, v.d));
    add(body, "Render_White", block(v.x, 3.4, v.z, v.w + 0.4, 0.3, v.d + 0.4));
    add(roof, "Roof_Sedum", block(v.x, 3.7, v.z, v.w - 0.2, 0.06, v.d - 0.2));
    parapet(roof, "Render_White", v.x, 3.7, v.z, v.w + 0.4, v.d + 0.4, 0.35, 0.2);
  }
  add(body, "Zinc_Dark", block(-6, 3.7, -9.8, 10, 3, 6.4));
  add(roof, "Roof_Dark", block(-6, 6.7, -9.8, 10.3, 0.15, 6.7));

  glazing(body, { x: -4.5, y: 0.15, z: -5.98, w: 14, h: 2.9, yaw: 0, mullion: 2 });
  glazing(body, { x: 2.98, y: 0.15, z: -1, w: 8, h: 2.9, yaw: -HALF_PI, mullion: 2 });
  glazing(body, { x: 6.5, y: 0.3, z: 4.02, w: 5, h: 2.6, yaw: 0, mullion: 1.25 });
  for (let x = 3.3; x <= 9.7; x += 0.32) add(body, "Wood_Cladding", block(x, 0, 4.4, 0.07, 3.3, 0.12));
  glazing(body, { x: -6, y: 4.3, z: -6.58, w: 8, h: 1.8, yaw: 0, mullion: 2 });
  glazing(body, { x: -12.02, y: 0.4, z: -9.5, w: 4, h: 2.2, yaw: -HALF_PI, mullion: 2 });
  glazing(body, { x: 10.02, y: 1.4, z: -1, w: 3, h: 1.4, yaw: HALF_PI });
  glazing(body, { x: -1, y: 2, z: -13.02, w: 6, h: 1, yaw: Math.PI, mullion: 2 });

  add(garden, "Deck_Teak", block(-4.5, 0, -1.5, 15, 0.15, 9));
  pool(water, -4, 7, 14, 3);
  lounger(garden, -9, 0.15, 1.5, 0);
  lounger(garden, -7.6, 0.15, 1.5, 0);
  driveway(garden, 13.5, 5, site, true);
  mergeParts(garden, plant("broadleaf", -14, 0, 11, 0.75, 0.95, site.seed));
  mergeParts(garden, plant("olive", 8, 0, 10, 0.9, 1, site.seed + 3));
  shrubs(garden, [[-14.5, -2], [-14.5, 2], [1, 11], [10.5, 7]], site.seed);
  return { body, roof, pool: water, garden, height: 7.2 };
};

const TYPOLOGIES = [cubist, mediterranean, courtyard];
const CAR_COLORS: Rgb[] = [
  [0.6, 0.6, 0.62],
  [0.02, 0.02, 0.025],
  [0.45, 0.04, 0.03],
  [0.75, 0.74, 0.7],
  [0.04, 0.08, 0.2],
];

function mirrorParts(parts: Parts): void {
  for (const mesh of Object.values(parts)) mirrorX(mesh);
}

/** Villa N (1-based): typologies cycle, and every second villa is mirrored so neighbours differ. */
export function villaParts(index: number, streetSide: 1 | -1): VillaParts {
  const build = TYPOLOGIES[(index - 1) % TYPOLOGIES.length] ?? cubist;
  const villa = build({ streetSide, carColor: CAR_COLORS[index % CAR_COLORS.length] ?? [0.5, 0.5, 0.5], seed: index * 101 });
  if (index % 2 === 0) for (const parts of [villa.body, villa.roof, villa.pool, villa.garden]) mirrorParts(parts);
  const plot = quadMesh(-HALF_W, HALF_W, -HALF_D, HALF_D, 0.06);
  return { ...villa, plot };
}
