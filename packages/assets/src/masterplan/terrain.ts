import { emptyMesh, type MeshData } from "../geometry";
import { fbm2, smoothstep } from "../raytracer/math";

/** Meters, Y up, centered on the origin. */
export const TERRAIN_SIZE = 200;
const GRID = 100;
const BASE_Y = -14;

const ROWS = [
  { z: -38, level: 3.4, facing: 1 },
  { z: 32, level: -3.2, facing: -1 },
];
const COLS = [-66, -22, 22, 66];
export const PLOT_W = 36;
export const PLOT_D = 30;
export const ROAD_HALF = 3.2;
export const ROAD_LEVEL = 0.2;

export interface PlotLayout {
  index: number;
  node: string;
  code: string;
  cx: number;
  cz: number;
  level: number;
  /** +1 when the street is on the plot's +Z side, -1 when it is on -Z. */
  facing: 1 | -1;
}

/** Villa_01..04 on the upper terrace, Villa_05..08 on the lower one. */
export const PLOTS: PlotLayout[] = ROWS.flatMap((row, r) =>
  COLS.map((cx, c) => {
    const index = r * COLS.length + c + 1;
    const n = String(index).padStart(2, "0");
    return { index, node: `Villa_${n}`, code: `V${index}`, cx, cz: row.z, level: row.level, facing: row.facing as 1 | -1 };
  }),
);

export function roadCenterZ(x: number): number {
  return -0.5 + 5 * Math.sin(x * 0.045 + 0.6);
}

export function boxDistance(x: number, z: number, cx: number, cz: number, hx: number, hz: number): number {
  const dx = Math.abs(x - cx) - hx;
  const dz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

export function plotDistance(x: number, z: number): number {
  return Math.min(...PLOTS.map((p) => boxDistance(x, z, p.cx, p.cz, PLOT_W / 2, PLOT_D / 2)));
}

export function roadDistance(x: number, z: number): number {
  return Math.abs(z - roadCenterZ(x)) - ROAD_HALF;
}

/** Terrain height: hillside rising toward -Z, flattened under plots and along the road. */
export function terrainHeight(x: number, z: number): number {
  const lower = ROWS[1]?.level ?? 0;
  const upper = ROWS[0]?.level ?? 0;
  let h = lower + (upper - lower) * smoothstep(18, -12, z);
  h += (fbm2(x * 0.03 + 4, z * 0.03 + 9, 4, 7) - 0.5) * 3.2;
  h += 0.0016 * Math.max(0, Math.abs(x) - 85) ** 2 + 0.002 * Math.max(0, -z - 60) ** 2;
  for (const p of PLOTS) {
    const d = boxDistance(x, z, p.cx, p.cz, PLOT_W / 2, PLOT_D / 2);
    const w = 1 - smoothstep(0, 8, d);
    h += (p.level - h) * w;
  }
  const wr = 1 - smoothstep(0, 7, roadDistance(x, z));
  h += (ROAD_LEVEL - h) * wr;
  return h;
}

/** Dry Mediterranean grass with greener patches near plots and the road verge. */
function groundColor(x: number, z: number): [number, number, number] {
  const v = fbm2(x * 0.08, z * 0.08, 3, 3);
  const dry = smoothstep(0.4, 0.8, fbm2(x * 0.02 + 40, z * 0.02, 3, 5));
  const tended = 1 - smoothstep(2, 14, Math.min(plotDistance(x, z), roadDistance(x, z) + 2));
  const wild = 1 - tended;
  const r = 0.36 + 0.14 * v + 0.2 * dry * wild - 0.08 * tended;
  const g = 0.46 + 0.12 * v + 0.04 * dry * wild + 0.04 * tended;
  const b = 0.24 + 0.08 * v - 0.02 * dry;
  return [r, g, b];
}

export function terrainMesh(): MeshData {
  const step = TERRAIN_SIZE / GRID;
  const n = GRID + 1;
  const m = emptyMesh();
  m.colors = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -TERRAIN_SIZE / 2 + i * step;
      const z = -TERRAIN_SIZE / 2 + j * step;
      m.positions.push(x, terrainHeight(x, z), z);
      const e = 1;
      const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z);
      const nz = terrainHeight(x, z - e) - terrainHeight(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      m.normals.push(nx / l, (2 * e) / l, nz / l);
      m.colors.push(...groundColor(x, z));
    }
  }
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

/** Vertical soil walls around the terrain edge, so the site reads as an architectural scale model. */
export function terrainSkirtMesh(): MeshData {
  const m = emptyMesh();
  const half = TERRAIN_SIZE / 2;
  const sides: Array<{ along: (t: number) => [number, number]; normal: [number, number, number] }> = [
    { along: (t) => [t, half], normal: [0, 0, 1] },
    { along: (t) => [half, -t], normal: [1, 0, 0] },
    { along: (t) => [-t, -half], normal: [0, 0, -1] },
    { along: (t) => [-half, t], normal: [-1, 0, 0] },
  ];
  for (const side of sides) {
    const base = m.positions.length / 3;
    for (let i = 0; i <= GRID; i++) {
      const [x, z] = side.along(-half + (i * TERRAIN_SIZE) / GRID);
      m.positions.push(x, terrainHeight(x, z), z, x, BASE_Y, z);
      m.normals.push(...side.normal, ...side.normal);
    }
    for (let i = 0; i < GRID; i++) {
      const a = base + i * 2;
      m.indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  return m;
}

/** A strip that follows the road centerline between two lateral offsets, lifted slightly above the terrain. */
export function roadStrip(offsetA: number, offsetB: number, lift: number, x0 = -TERRAIN_SIZE / 2, x1 = TERRAIN_SIZE / 2, segs = 80): MeshData {
  const m = emptyMesh();
  for (let i = 0; i <= segs; i++) {
    const x = x0 + (i / segs) * (x1 - x0);
    const zc = roadCenterZ(x);
    for (const off of [offsetA, offsetB]) {
      const z = zc + off;
      m.positions.push(x, terrainHeight(x, z) + lift, z);
      m.normals.push(0, 1, 0);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    m.indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  return m;
}
