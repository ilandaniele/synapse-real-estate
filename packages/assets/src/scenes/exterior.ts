import { facade, type GlazingZone } from "../raytracer/materials";
import { boxRange, finalizeScene, type Box, type PointLight, type Scene, type Sphere } from "../raytracer/scene";
import { M, lightingFor, makeOutdoor, type TimeOfDay } from "./common";
import { DOORS, POOL } from "./layout";

const doorZone = DOORS.find((d) => d.id === "ext-living");

/** Glazing on the facades; coordinates agree with the interior window definitions. */
const ZONES: GlazingZone[] = [
  { axis: "z", plane: 12, u0: 0.8, u1: 6.8, y0: 0.15, y1: 4.8, panes: 4 },
  { axis: "z", plane: 12, u0: doorZone?.lo ?? 7.7, u1: doorZone?.hi ?? 9.3, y0: 0, y1: doorZone?.h ?? 2.6, door: true },
  { axis: "z", plane: 12, u0: 11, u1: 15, y0: 1.0, y1: 2.6, panes: 3 },
  { axis: "x", plane: 16, u0: 6.5, u1: 10.5, y0: 0.9, y1: 2.5, panes: 2 },
  { axis: "x", plane: 16, u0: 1.5, u1: 3.5, y0: 1.0, y1: 2.4, panes: 2 },
  { axis: "z", plane: 0, u0: 11, u1: 13.5, y0: 1.15, y1: 2.4, panes: 2 },
  { axis: "z", plane: 0, u0: 1.5, u1: 4.5, y0: 0.8, y1: 2.4, panes: 3 },
  { axis: "z", plane: 0, u0: 7, u1: 8.6, y0: 1.5, y1: 2.3 },
  { axis: "z", plane: 5, u0: 5, u1: 9, y0: 3.5, y1: 4.8, panes: 2 },
];

const wall = facade("render-white", "#f4f2ec", "#2b2e31", "#ffd9a0", ZONES);

const TREES: Array<{ x: number; z: number; h: number; r: number }> = [
  { x: -7, z: 9, h: 3.2, r: 3.0 },
  { x: -10, z: 22, h: 3.6, r: 3.4 },
  { x: -3, z: 33, h: 3.0, r: 2.8 },
  { x: 26, z: 17, h: 3.4, r: 3.1 },
  { x: 28, z: 3, h: 3.8, r: 3.5 },
  { x: 25, z: 30, h: 3.0, r: 2.7 },
  { x: 5, z: -9, h: 3.6, r: 3.2 },
  { x: 14, z: -8, h: 3.2, r: 3.0 },
  { x: -8, z: -2, h: 3.4, r: 3.3 },
  { x: 24, z: -6, h: 3.0, r: 2.9 },
];

/** Exterior of Villa 6: flat-roof white volumes, glazing, terrace and pool, inside a garden plot. */
export function exteriorScene(time: TimeOfDay): Scene {
  const boxes: Box[] = [
    // volumes (non-overlapping)
    boxRange(0, 10, 0, 5.4, 5, 12, wall),
    boxRange(0, 10, 0, 3.4, 0, 5, wall),
    boxRange(10, 16, 0, 3.4, 0, 12, wall),
    // flat roofs with overhang
    boxRange(-0.5, 10.5, 5.4, 5.64, 4.6, 12.7, M.roof),
    boxRange(-0.4, 10.4, 3.4, 3.62, -0.4, 4.6, M.roof),
    boxRange(10, 16.5, 3.4, 3.62, -0.4, 12.5, M.roof),
    // porch canopy above the entrance
    boxRange(7.2, 9.8, 2.78, 2.9, 12, 13.6, M.roof),
    boxRange(7.2, 7.28, 0, 2.78, 13.52, 13.6, M.roof),
    // pool coping
    boxRange(POOL.x0 - 0.12, POOL.x1 + 0.12, 0, 0.06, POOL.z0 - 0.12, POOL.z0, M.white),
    boxRange(POOL.x0 - 0.12, POOL.x1 + 0.12, 0, 0.06, POOL.z1, POOL.z1 + 0.12, M.white),
    boxRange(POOL.x0 - 0.12, POOL.x0, 0, 0.06, POOL.z0, POOL.z1, M.white),
    boxRange(POOL.x1, POOL.x1 + 0.12, 0, 0.06, POOL.z0, POOL.z1, M.white),
    // sun loungers
    boxRange(22.1, 22.9, 0, 0.32, 9.6, 11.6, M.lounger),
    boxRange(22.1, 22.9, 0, 0.32, 12.0, 14.0, M.lounger),
  ];
  const spheres: Sphere[] = [];
  for (const t of TREES) {
    boxes.push(boxRange(t.x - 0.2, t.x + 0.2, 0, t.h, t.z - 0.2, t.z + 0.2, M.trunk));
    spheres.push({ c: [t.x, t.h + t.r * 0.55, t.z], r: t.r, material: M.leaf });
    spheres.push({ c: [t.x + t.r * 0.4, t.h + t.r * 0.3, t.z - t.r * 0.2], r: t.r * 0.7, material: M.leaf });
  }
  for (let x = 0.5; x < 16; x += 1.6) spheres.push({ c: [x, 0.38, 15.4], r: 0.5, material: M.leaf });

  const lights: PointLight[] = [];
  if (time === "dusk") {
    lights.push(
      { pos: [(POOL.x0 + POOL.x1) / 2, 0.6, (POOL.z0 + POOL.z1) / 2], color: [0.25, 1.3, 1.5], shadow: false },
      { pos: [8.5, 2.6, 13.2], color: [2.4, 1.5, 0.8], shadow: false },
      { pos: [3.8, 1.5, 13.5], color: [1.6, 1.0, 0.55], shadow: false },
    );
  }

  const l = lightingFor(time);
  const outdoor = makeOutdoor(time);
  return finalizeScene({
    name: `exterior-${time}`,
    shell: null,
    boxes,
    spheres,
    outdoor,
    sun: { dir: outdoor.sky.sunDir, color: l.sun },
    ambient: { top: l.ambTop, bottom: l.ambBottom },
    lights,
    windowGain: 1,
    glassGlow: time === "dusk" ? 0.9 : 0.1,
    exposure: time === "dusk" ? 1.15 : 0.85,
  });
}

