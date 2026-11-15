import { artwork, emitter, fabric, mirror, rug, solid, stone, type Material } from "../raytracer/materials";
import type { Vec3 } from "../raytracer/math";
import { boxRange, finalizeScene, type Beyond, type Box, type Opening, type PointLight, type RoomShell, type Scene, type Sphere, type Wall } from "../raytracer/scene";
import { M, lightingFor, makeOutdoor } from "./common";
import { doorBetween, ROOMS, type DoorDef, type RoomDef, type RoomSlug, type SceneSlug } from "./layout";

const sofaFabric = fabric("sofa", "#66767d");
const mustard = fabric("armchair", "#bf8c3e");
const cushion = fabric("cushion", "#d6b27a");
const rugMat = rug("rug", "#d9cfbb", "#c2b298");
const bedding = fabric("duvet", "#9ba79f");
const bench = fabric("bench", "#8a8f8c");
const chairSeat = fabric("chair-seat", "#d9d1c2");
const art1 = artwork("art-1", "#e0c9a0", "#b0623e", "#2f4b5a");
const art2 = artwork("art-2", "#cfd8d2", "#7f9a8e", "#34495a");
const lampWarm = emitter("lamp", "#ffd9a0", 2.4);
const screen = solid("screen", "#0d0e10", { spec: 0.6, shine: 120 });
const waterInTub = solid("tub-inner", "#dde6e8", { spec: 0.5, shine: 80 });
const mirrorMat = mirror("mirror");

const WARM: Vec3 = [0.5, 0.4, 0.29];
const light = (x: number, y: number, z: number, power: number, shadow = true): PointLight => ({
  pos: [x, y, z],
  color: [WARM[0] * power, WARM[1] * power, WARM[2] * power],
  shadow,
});

/** Recessed ceiling spot (tiny emissive disc). */
const spot = (x: number, z: number, h: number): Box => boxRange(x - 0.07, x + 0.07, h - 0.02, h, z - 0.07, z + 0.07, lampWarm);

const sphere = (x: number, y: number, z: number, r: number, material: Material): Sphere => ({ c: [x, y, z], r, material });

const wallMat: Record<RoomSlug, Material> = {
  living: M.plasterWarm,
  comedor: M.plasterWarm,
  cocina: M.plasterWarm,
  dormitorio: M.plasterGreige,
  bano: M.bathWall,
};

const floorMat: Record<RoomSlug, Material> = {
  living: M.wood,
  comedor: M.wood,
  cocina: M.kitchenFloor,
  dormitorio: M.wood,
  bano: M.bathFloor,
};

const beyondLight: Record<RoomSlug, number> = { living: 1.0, comedor: 0.95, cocina: 1.0, dormitorio: 0.7, bano: 0.85 };

function beyondOf(slug: RoomSlug): Beyond {
  return { depth: 4, wall: wallMat[slug], floor: floorMat[slug], light: beyondLight[slug] };
}

function wallFor(room: RoomDef, d: DoorDef): Wall {
  if (d.axis === "x") return d.plane === room.x0 ? "W" : "E";
  return d.plane === room.z0 ? "N" : "S";
}

/** Opening of a shared door as seen from `room` (glass door when it leads outside). */
function doorOpening(room: RoomDef, other: SceneSlug): Opening {
  const d = doorBetween(room.slug, other);
  const base = { id: d.id, wall: wallFor(room, d), a: d.lo, b: d.hi, y0: 0, y1: d.h };
  if (other === "exterior") return { ...base, kind: "window", panes: 1 };
  return { ...base, kind: "passage", beyond: beyondOf(other as RoomSlug) };
}

function shellFor(room: RoomDef, openings: Opening[], overrides: Partial<Record<Wall, Material>> = {}): RoomShell {
  const wm = wallMat[room.slug];
  return {
    min: [room.x0, 0, room.z0],
    max: [room.x1, room.h, room.z1],
    floor: floorMat[room.slug],
    ceiling: M.ceiling,
    walls: { N: wm, S: wm, E: wm, W: wm, ...overrides },
    openings,
  };
}

function assemble(name: string, shell: RoomShell, boxes: Box[], spheres: Sphere[], lights: PointLight[], exposure = 1): Scene {
  const day = lightingFor("day");
  const outdoor = makeOutdoor("day");
  return finalizeScene({
    name,
    shell,
    boxes,
    spheres,
    outdoor,
    sun: { dir: outdoor.sky.sunDir, color: day.sun.map((c) => c * 0.3) as Vec3 },
    ambient: { top: [0.1, 0.1, 0.11], bottom: [0.12, 0.1, 0.08] },
    lights,
    windowGain: 1.9,
    glassGlow: 0,
    exposure,
    windowLightK: 1,
  });
}

/** Chair seen from above the seat: `back` is the side of the backrest (+1/-1 along Z). */
function chair(x: number, z: number, back: 1 | -1): Box[] {
  const legs: Box[] = [];
  for (const dx of [-0.19, 0.19]) for (const dz of [-0.19, 0.19]) legs.push(boxRange(x + dx - 0.02, x + dx + 0.02, 0, 0.42, z + dz - 0.02, z + dz + 0.02, M.oakCabinet));
  return [
    boxRange(x - 0.22, x + 0.22, 0.42, 0.47, z - 0.22, z + 0.22, chairSeat, { plan: true }),
    ...legs,
    boxRange(x - 0.22, x + 0.22, 0.47, 0.95, back > 0 ? z + 0.18 : z - 0.22, back > 0 ? z + 0.22 : z - 0.18, M.oakCabinet),
  ];
}

/* ------------------------------------------------------------------ living */

export function livingScene(): Scene {
  const room = ROOMS.living;
  const openings: Opening[] = [
    { id: "ventanal", wall: "S", a: 0.8, b: 6.8, y0: 0.15, y1: 4.8, kind: "window", panes: 4 },
    doorOpening(room, "exterior"),
    doorOpening(room, "comedor"),
    doorOpening(room, "dormitorio"),
    { id: "clerestory", wall: "N", a: 5, b: 9, y0: 3.5, y1: 4.8, kind: "window", panes: 2 },
  ];
  const boxes: Box[] = [
    boxRange(1.4, 5.6, 0, 0.025, 6.6, 10.4, rugMat),
    // sofa (west wall, facing east)
    boxRange(0.35, 1.45, 0, 0.45, 6.4, 10.4, sofaFabric, { plan: true, label: "sofa" }),
    boxRange(0.35, 0.75, 0.45, 0.95, 6.4, 10.4, sofaFabric),
    boxRange(0.35, 1.45, 0.45, 0.68, 6.4, 6.7, sofaFabric),
    boxRange(0.35, 1.45, 0.45, 0.68, 10.1, 10.4, sofaFabric),
    boxRange(0.8, 1.15, 0.45, 0.85, 6.9, 7.45, cushion),
    boxRange(0.8, 1.15, 0.45, 0.85, 9.35, 9.9, cushion),
    // coffee table
    boxRange(2.2, 3.6, 0.36, 0.42, 7.7, 9.1, M.woodDark, { plan: true }),
    boxRange(2.4, 3.4, 0, 0.36, 7.9, 8.9, M.black),
    // armchair
    boxRange(3.6, 4.5, 0, 0.42, 10.2, 11.1, mustard, { plan: true }),
    boxRange(3.6, 4.5, 0.42, 0.95, 10.8, 11.1, mustard),
    // TV unit on the north wall
    boxRange(5.3, 9.6, 0, 0.62, 5.0, 5.55, M.woodDark, { plan: true }),
    boxRange(6.0, 8.9, 1.05, 1.95, 5.0, 5.07, screen),
    // floor lamp
    boxRange(4.75, 4.8, 0, 1.55, 10.9, 10.95, M.black),
    // plant pot
    boxRange(0.45, 0.85, 0, 0.4, 11.2, 11.6, M.pot, { plan: true }),
    // art above the sofa
    boxRange(0, 0.04, 1.3, 2.4, 7.0, 9.8, art1),
    // pendant cords
    boxRange(2.89, 2.91, 3.2, 5.2, 8.39, 8.41, M.black),
    boxRange(3.79, 3.81, 3.5, 5.2, 9.09, 9.11, M.black),
    spot(6.5, 7.5, room.h),
    spot(8.6, 10.0, room.h),
  ];
  const spheres: Sphere[] = [
    sphere(4.78, 1.72, 10.92, 0.22, lampWarm),
    sphere(0.65, 1.0, 11.4, 0.5, M.leaf),
    sphere(0.7, 1.5, 11.35, 0.33, M.leaf),
    sphere(2.9, 3.05, 8.4, 0.22, lampWarm),
    sphere(3.8, 3.35, 9.1, 0.2, lampWarm),
    sphere(2.9, 0.5, 8.4, 0.08, M.pot),
  ];
  const lights = [light(3.0, 2.9, 8.6, 5.5), light(7.0, 2.6, 7.4, 3.2), light(4.7, 2.0, 10.7, 1.4, false), light(8.2, 2.2, 10.6, 2.0, false)];
  return assemble("living", shellFor(room, openings, { W: M.plasterGreige }), boxes, spheres, lights, 0.8);
}

/* ------------------------------------------------------------------ comedor */

export function comedorScene(): Scene {
  const room = ROOMS.comedor;
  const openings: Opening[] = [
    doorOpening(room, "living"),
    doorOpening(room, "cocina"),
    { id: "terraza", wall: "S", a: 11, b: 15, y0: 1.0, y1: 2.6, kind: "window", panes: 3 },
    { id: "este", wall: "E", a: 6.5, b: 10.5, y0: 0.9, y1: 2.5, kind: "window", panes: 2 },
  ];
  const boxes: Box[] = [
    boxRange(12.4, 15.0, 0.74, 0.79, 8.1, 9.5, M.wood, { plan: true, label: "mesa" }),
    boxRange(12.5, 12.6, 0, 0.74, 8.2, 8.3, M.black),
    boxRange(14.8, 14.9, 0, 0.74, 8.2, 8.3, M.black),
    boxRange(12.5, 12.6, 0, 0.74, 9.3, 9.4, M.black),
    boxRange(14.8, 14.9, 0, 0.74, 9.3, 9.4, M.black),
    boxRange(11.0, 14.0, 0, 0.8, 11.5, 12.0, M.woodDark, { plan: true }),
    boxRange(11.0, 13.0, 1.2, 2.2, 5.0, 5.04, art2),
    boxRange(12.2, 15.2, 0, 0.02, 7.4, 10.2, rugMat),
    boxRange(12.99, 13.01, 2.0, 2.8, 8.79, 8.81, M.black),
    boxRange(13.69, 13.71, 2.0, 2.8, 8.79, 8.81, M.black),
    boxRange(14.39, 14.41, 2.0, 2.8, 8.79, 8.81, M.black),
    spot(12, 8, room.h),
    spot(15, 10.5, room.h),
  ];
  for (const x of [12.9, 13.7, 14.5]) {
    boxes.push(...chair(x, 7.7, -1), ...chair(x, 9.9, 1));
  }
  boxes.push(...chair(12.0, 8.8, -1));
  const spheres: Sphere[] = [
    sphere(13.0, 2.0, 8.8, 0.17, lampWarm),
    sphere(13.7, 2.0, 8.8, 0.17, lampWarm),
    sphere(14.4, 2.0, 8.8, 0.17, lampWarm),
    sphere(13.7, 0.9, 8.8, 0.1, M.pot),
    sphere(11.6, 1.05, 11.75, 0.2, M.leaf),
  ];
  const lights = [light(13.5, 2.6, 8.8, 3.4), light(11.6, 2.7, 6.2, 1.6, false), light(14.5, 2.7, 10.8, 1.6, false)];
  return assemble("comedor", shellFor(room, openings, { E: M.plasterGreige }), boxes, spheres, lights, 0.8);
}

/* ------------------------------------------------------------------ cocina */

export function cocinaScene(): Scene {
  const room = ROOMS.cocina;
  const openings: Opening[] = [
    doorOpening(room, "comedor"),
    { id: "fregadero", wall: "N", a: 11, b: 13.5, y0: 1.15, y1: 2.4, kind: "window", panes: 2 },
    { id: "este", wall: "E", a: 1.5, b: 3.5, y0: 1.0, y1: 2.4, kind: "window", panes: 2 },
  ];
  const boxes: Box[] = [
    boxRange(10, 16, 0, 0.9, 0, 0.65, M.lacquerGraphite, { plan: true }),
    boxRange(10, 16, 0.9, 0.94, 0, 0.68, M.lacquerWhite),
    boxRange(10, 11, 1.5, 2.4, 0, 0.35, M.lacquerWhite, { plan: true }),
    boxRange(13.8, 15.2, 1.5, 2.4, 0, 0.35, M.lacquerWhite, { plan: true }),
    boxRange(15.2, 16, 0, 2.05, 0.05, 0.8, M.steel, { plan: true, label: "frigorífico" }),
    boxRange(11.3, 12.4, 0.94, 0.955, 0.05, 0.6, M.black),
    // island
    boxRange(11.8, 14.6, 0, 0.9, 1.9, 2.8, M.oakCabinet, { plan: true, label: "isla" }),
    boxRange(11.7, 14.7, 0.9, 0.95, 1.8, 2.9, stoneTop()),
    boxRange(12.5, 12.58, 0.95, 1.12, 2.3, 2.36, M.steel),
    // stool tops and columns
    ...[12.3, 13.2, 14.1].flatMap((x) => [
      boxRange(x - 0.2, x + 0.2, 0.62, 0.67, 3.05, 3.45, M.lacquerGraphite, { plan: true }),
      boxRange(x - 0.03, x + 0.03, 0, 0.62, 3.22, 3.28, M.black),
    ]),
    boxRange(12.39, 12.41, 1.9, 2.8, 2.29, 2.31, M.black),
    boxRange(13.19, 13.21, 1.9, 2.8, 2.29, 2.31, M.black),
    boxRange(13.99, 14.01, 1.9, 2.8, 2.29, 2.31, M.black),
    spot(12, 1.5, room.h),
    spot(14.5, 3.8, room.h),
  ];
  const spheres: Sphere[] = [
    sphere(12.4, 2.0, 2.35, 0.14, lampWarm),
    sphere(13.2, 2.0, 2.35, 0.14, lampWarm),
    sphere(14.0, 2.0, 2.35, 0.14, lampWarm),
    sphere(14.1, 1.05, 2.4, 0.11, M.leaf),
  ];
  const lights = [light(12.6, 2.6, 2.4, 3.2), light(14.8, 2.7, 3.6, 2.0), light(11.2, 2.6, 4.0, 1.6, false)];
  return assemble("cocina", shellFor(room, openings), boxes, spheres, lights, 0.8);
}

function stoneTop(): Material {
  return stone("quartz", "#ebe7de");
}

/* ------------------------------------------------------------------ dormitorio */

export function dormitorioScene(): Scene {
  const room = ROOMS.dormitorio;
  const openings: Opening[] = [
    doorOpening(room, "living"),
    doorOpening(room, "bano"),
    { id: "norte", wall: "N", a: 1.5, b: 4.5, y0: 0.8, y1: 2.4, kind: "window", panes: 3 },
  ];
  const boxes: Box[] = [
    boxRange(1.0, 3.6, 0, 0.025, 1.0, 4.0, rugMat),
    // bed
    boxRange(0.05, 2.25, 0, 0.3, 1.3, 3.7, M.woodDark, { plan: true, label: "cama" }),
    boxRange(0.25, 2.2, 0.3, 0.6, 1.35, 3.65, M.linen),
    boxRange(0.9, 2.2, 0.58, 0.68, 1.33, 3.67, bedding),
    boxRange(0.3, 0.75, 0.6, 0.78, 1.6, 2.35, M.linen),
    boxRange(0.3, 0.75, 0.6, 0.78, 2.65, 3.4, M.linen),
    boxRange(0.05, 0.25, 0.3, 1.2, 1.2, 3.8, M.headboard),
    // nightstands
    boxRange(0.05, 0.5, 0, 0.45, 0.75, 1.2, M.oakCabinet, { plan: true }),
    boxRange(0.05, 0.5, 0, 0.45, 3.8, 4.25, M.oakCabinet, { plan: true }),
    // wardrobe with two doors
    boxRange(0.3, 1.24, 0, 2.4, 4.4, 5.0, M.lacquerWhite, { plan: true, label: "armario" }),
    boxRange(1.26, 2.2, 0, 2.4, 4.4, 5.0, M.lacquerWhite),
    // bench at the foot of the bed
    boxRange(2.3, 2.75, 0, 0.45, 1.5, 3.5, bench, { plan: true }),
    boxRange(0, 0.04, 1.6, 2.4, 1.55, 3.25, art1),
    spot(3, 2.5, room.h),
    spot(4.8, 3.6, room.h),
  ];
  const spheres: Sphere[] = [
    sphere(0.27, 0.57, 0.98, 0.1, lampWarm),
    sphere(0.27, 0.57, 4.02, 0.1, lampWarm),
    sphere(5.35, 0.75, 0.6, 0.45, M.leaf),
  ];
  boxes.push(boxRange(5.1, 5.6, 0, 0.35, 0.35, 0.85, M.pot, { plan: true }));
  const lights = [light(3.0, 2.5, 2.5, 3.0), light(0.5, 0.9, 1.0, 1.3), light(0.5, 0.9, 4.0, 1.3), light(4.8, 2.4, 3.8, 1.2, false)];
  return assemble("dormitorio", shellFor(room, openings), boxes, spheres, lights, 0.8);
}

/* ------------------------------------------------------------------ baño */

export function banoScene(): Scene {
  const room = ROOMS.bano;
  const openings: Opening[] = [doorOpening(room, "dormitorio"), { id: "norte", wall: "N", a: 7, b: 8.6, y0: 1.5, y1: 2.3, kind: "window", panes: 1 }];
  const boxes: Box[] = [
    // freestanding tub along the east wall
    boxRange(9.0, 9.95, 0, 0.58, 0.5, 2.9, M.white, { plan: true, label: "bañera" }),
    boxRange(9.12, 9.83, 0.5, 0.59, 0.62, 2.78, waterInTub),
    boxRange(9.35, 9.5, 0.58, 1.0, 0.5, 0.56, M.steel),
    // vanity + mirror on the south wall
    boxRange(7.0, 9.4, 0, 0.85, 4.4, 5.0, M.oakCabinet, { plan: true, label: "lavabo" }),
    boxRange(6.95, 9.45, 0.85, 0.9, 4.35, 5.0, stoneTop()),
    boxRange(7.4, 8.2, 0.9, 0.96, 4.5, 4.9, M.white),
    boxRange(7.2, 9.2, 1.15, 2.15, 4.96, 5.0, mirrorMat),
    // toilet on the west wall
    boxRange(6.05, 6.75, 0, 0.4, 3.4, 4.0, M.white, { plan: true }),
    boxRange(6.05, 6.3, 0.4, 0.85, 3.4, 4.0, M.white),
    // plant pot
    boxRange(9.5, 9.9, 0, 0.35, 4.5, 4.9, M.pot, { plan: true }),
    boxRange(6.0, 6.03, 1.0, 1.9, 0.4, 0.8, M.steel),
    spot(7.5, 2.0, room.h),
    spot(8.5, 3.8, room.h),
  ];
  const spheres: Sphere[] = [sphere(9.7, 0.8, 4.7, 0.42, M.leaf)];
  const lights = [light(7.6, 2.4, 2.2, 3.2), light(8.4, 2.4, 3.9, 1.8), light(8.2, 1.9, 4.6, 1.2, false)];
  return assemble("bano", shellFor(room, openings), boxes, spheres, lights, 0.8);
}

export const ROOM_BUILDERS: Record<RoomSlug, () => Scene> = {
  living: livingScene,
  comedor: comedorScene,
  cocina: cocinaScene,
  dormitorio: dormitorioScene,
  bano: banoScene,
};
