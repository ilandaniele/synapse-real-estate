import type { Material } from "./materials";
import type { Vec3 } from "./math";

export type Wall = "N" | "S" | "E" | "W";

/** What you see through a passage: a short prism extruded outward from the wall. */
export interface Beyond {
  depth: number;
  wall: Material;
  floor: Material;
  /** 0..1.5 brightness of the neighbouring space. */
  light: number;
}

/**
 * Opening in a room wall. `a..b` is the lateral range (X for N/S walls, Z for E/W walls),
 * `y0..y1` the vertical range. Walls: N = min Z, S = max Z, W = min X, E = max X.
 */
export interface Opening {
  id: string;
  wall: Wall;
  a: number;
  b: number;
  y0: number;
  y1: number;
  /** window/glass door: shows the outdoor environment. passage: shows `beyond`. */
  kind: "window" | "passage";
  panes?: number;
  beyond?: Beyond;
}

export interface RoomShell {
  min: Vec3;
  max: Vec3;
  floor: Material;
  ceiling: Material;
  walls: Record<Wall, Material>;
  openings: Opening[];
}

export interface Box {
  min: Vec3;
  max: Vec3;
  material: Material;
  /** Drawn as furniture outline in the floorplan SVG. */
  plan?: boolean;
  label?: string;
}

export interface Sphere {
  c: Vec3;
  r: number;
  material: Material;
}

export interface Sky {
  zenith: Vec3;
  horizon: Vec3;
  /** Color blended in with distance (aerial perspective). */
  haze: Vec3;
  /** Unit vector pointing at the sun. */
  sunDir: Vec3;
  sunColor: Vec3;
  /** Sun disc angular radius in radians. */
  sunSize: number;
  /** Cloud coverage 0..1. */
  clouds: number;
  hills: Vec3 | null;
}

export interface Ground {
  y: number;
  pick: (x: number, z: number) => Material;
}

/** Vertical cylindrical wall of trees surrounding the plot. */
export interface Ring {
  cx: number;
  cz: number;
  radius: number;
  heightAt: (angle: number) => number;
  material: Material;
}

export interface Outdoor {
  sky: Sky;
  ground: Ground;
  ring: Ring | null;
  /** Exponential fog density (1/m). */
  fog: number;
}

export interface PointLight {
  pos: Vec3;
  color: Vec3;
  shadow: boolean;
}

/** Shadow-less area-light approximation of a window (inward-facing). */
export interface SoftLight {
  pos: Vec3;
  /** Inward-pointing wall normal. */
  normal: Vec3;
  color: Vec3;
}

export interface Scene {
  name: string;
  shell: RoomShell | null;
  boxes: Box[];
  spheres: Sphere[];
  outdoor: Outdoor;
  sun: { dir: Vec3; color: Vec3 };
  ambient: { top: Vec3; bottom: Vec3 };
  lights: PointLight[];
  softLights: SoftLight[];
  /** Brightness multiplier of the outdoors seen through windows. */
  windowGain: number;
  /** Brightness of interiors seen through facade glass from outside. */
  glassGlow: number;
  exposure: number;
}

export type SceneInit = Omit<Scene, "softLights"> & { windowLightK?: number };

/** Derives soft window lights from the shell openings. */
export function finalizeScene(init: SceneInit): Scene {
  const soft: SoftLight[] = [];
  const shell = init.shell;
  if (shell) {
    const k = init.windowLightK ?? 1;
    const sky = init.outdoor.sky;
    for (const op of shell.openings) {
      if (op.kind !== "window") continue;
      const area = (op.b - op.a) * (op.y1 - op.y0);
      const mid = (op.a + op.b) / 2;
      const my = (op.y0 + op.y1) / 2;
      let pos: Vec3;
      let normal: Vec3;
      if (op.wall === "N") [pos, normal] = [[mid, my, shell.min[2] + 0.1], [0, 0, 1]];
      else if (op.wall === "S") [pos, normal] = [[mid, my, shell.max[2] - 0.1], [0, 0, -1]];
      else if (op.wall === "W") [pos, normal] = [[shell.min[0] + 0.1, my, mid], [1, 0, 0]];
      else [pos, normal] = [[shell.max[0] - 0.1, my, mid], [-1, 0, 0]];
      const s = (area * k) / 6;
      const c = (i: 0 | 1 | 2) => ((sky.horizon[i] ?? 0) * 0.6 + (sky.zenith[i] ?? 0) * 0.4) * s * init.windowGain * 0.13;
      soft.push({ pos, normal, color: [c(0), c(1), c(2)] });
    }
  }
  const { windowLightK: _ignored, ...rest } = init;
  return { ...rest, softLights: soft };
}

/** Convenience: box from corner + size. */
export function boxAt(x: number, y: number, z: number, w: number, h: number, d: number, material: Material, extra: Partial<Box> = {}): Box {
  return { min: [x, y, z], max: [x + w, y + h, z + d], material, ...extra };
}

/** Box from explicit ranges. */
export function boxRange(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: Material, extra: Partial<Box> = {}): Box {
  return { min: [x0, y0, z0], max: [x1, y1, z1], material, ...extra };
}
