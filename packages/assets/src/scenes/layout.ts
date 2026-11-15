import type { Vec3 } from "../raytracer/math";

/**
 * Villa 6 ground-floor layout in meters. Plan coordinates == world coordinates:
 * +X east, +Z south, north (-Z) is "up" in the floorplan, so pano yaw 0 looks up the plan and
 * positive yaw turns clockwise on the plan.
 */
export type SceneSlug = "exterior" | "living" | "comedor" | "cocina" | "dormitorio" | "bano";
export type RoomSlug = Exclude<SceneSlug, "exterior">;

export interface RoomDef {
  slug: RoomSlug;
  /** Spanish display name. */
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Ceiling height. */
  h: number;
  /** Panorama camera position (eye height 1.55 m). */
  camera: Vec3;
}

export const ROOMS: Record<RoomSlug, RoomDef> = {
  living: { slug: "living", name: "Living", x0: 0, x1: 10, z0: 5, z1: 12, h: 5.2, camera: [4.3, 1.55, 8.3] },
  comedor: { slug: "comedor", name: "Comedor", x0: 10, x1: 16, z0: 5, z1: 12, h: 3.0, camera: [12.3, 1.55, 6.9] },
  cocina: { slug: "cocina", name: "Cocina", x0: 10, x1: 16, z0: 0, z1: 5, h: 3.0, camera: [12.9, 1.55, 4.2] },
  dormitorio: { slug: "dormitorio", name: "Dormitorio principal", x0: 0, x1: 6, z0: 0, z1: 5, h: 2.8, camera: [3.7, 1.5, 2.6] },
  bano: { slug: "bano", name: "Baño", x0: 6, x1: 10, z0: 0, z1: 5, h: 2.7, camera: [7.6, 1.5, 2.7] },
};

export const EXTERIOR_CAMERA: Vec3 = [9, 1.7, 19.5];

/** Footprint of the house and outdoor features (plan meters). */
export const HOUSE = { x0: 0, x1: 16, z0: 0, z1: 12 } as const;
export const TERRACE = { x0: -1.5, x1: 22, z0: 12, z1: 14.6 } as const;
export const POOL = { x0: 16.8, x1: 21.5, z0: 8.5, z1: 14.6 } as const;
export const POOL_DECK = { x0: 16.3, x1: 23, z0: 8, z1: 15 } as const;

export interface DoorDef {
  id: string;
  /** Axis perpendicular to the wall: "x" -> wall plane at x = plane (spans along Z). */
  axis: "x" | "z";
  plane: number;
  lo: number;
  hi: number;
  /** Door head height. */
  h: number;
  between: [SceneSlug, SceneSlug];
}

export const DOORS: DoorDef[] = [
  { id: "ext-living", axis: "z", plane: 12, lo: 7.7, hi: 9.3, h: 2.6, between: ["exterior", "living"] },
  { id: "living-comedor", axis: "x", plane: 10, lo: 6.6, hi: 9.4, h: 2.7, between: ["living", "comedor"] },
  { id: "comedor-cocina", axis: "z", plane: 5, lo: 14, hi: 15, h: 2.2, between: ["comedor", "cocina"] },
  { id: "living-dormitorio", axis: "z", plane: 5, lo: 2.5, hi: 3.5, h: 2.2, between: ["living", "dormitorio"] },
  { id: "dormitorio-bano", axis: "x", plane: 6, lo: 1.2, hi: 2.2, h: 2.2, between: ["dormitorio", "bano"] },
];

export function doorBetween(a: SceneSlug, b: SceneSlug): DoorDef {
  const d = DOORS.find((x) => (x.between[0] === a && x.between[1] === b) || (x.between[0] === b && x.between[1] === a));
  if (!d) throw new Error(`No door between ${a} and ${b}`);
  return d;
}

/** Point at the middle of a door, at 45% of its height (a good hotspot anchor). */
export function doorCenter(d: DoorDef): Vec3 {
  const mid = (d.lo + d.hi) / 2;
  return d.axis === "x" ? [d.plane, d.h * 0.45, mid] : [mid, d.h * 0.45, d.plane];
}

/** Floorplan canvas mapping (SVG viewBox 0 0 1000 700). */
export const PLAN = { width: 1000, height: 700, scale: 40, ox: 40, oy: 50 } as const;

export function planX(x: number): number {
  return PLAN.ox + x * PLAN.scale;
}

export function planY(z: number): number {
  return PLAN.oy + z * PLAN.scale;
}

/** Normalized (0..1) floor-plan point of each scene's camera. The exterior is shown on the terrace. */
export function floorPlanPoint(slug: SceneSlug): { x: number; y: number } {
  const [cx, , cz] = slug === "exterior" ? ([EXTERIOR_CAMERA[0], 0, 13.6] as Vec3) : ROOMS[slug].camera;
  return { x: round(planX(cx) / PLAN.width), y: round(planY(cz) / PLAN.height) };
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
