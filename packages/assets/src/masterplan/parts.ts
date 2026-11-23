import { boxMesh, mergeMesh, rotateY, tint, translate, type MeshData } from "../geometry";
import type { MaterialName } from "./materials";

/** Geometry grouped by material; one glTF primitive per entry. */
export type Parts = Partial<Record<MaterialName, MeshData>>;

export function add(parts: Parts, material: MaterialName, mesh: MeshData): void {
  const current = parts[material];
  parts[material] = current ? mergeMesh(current, mesh) : mesh;
}

export function mergeParts(target: Parts, source: Parts): Parts {
  for (const [name, mesh] of Object.entries(source) as Array<[MaterialName, MeshData]>) add(target, name, mesh);
  return target;
}

/** Box resting on y0 (instead of centered on it). */
export function block(x: number, y0: number, z: number, sx: number, sy: number, sz: number): MeshData {
  return boxMesh(x, y0 + sy / 2, z, sx, sy, sz);
}

function placed(mesh: MeshData, x: number, y: number, z: number, yaw: number): MeshData {
  return translate(rotateY(mesh, yaw), x, y, z);
}

export interface Opening {
  x: number;
  /** Sill height. */
  y: number;
  z: number;
  w: number;
  h: number;
  /** 0 faces +Z, PI/2 faces +X, PI faces -Z, -PI/2 faces -X. */
  yaw: number;
  /** Spacing between vertical mullions; 0 for none. */
  mullion?: number;
  /** Adds a pair of open shutters beside the window. */
  shutters?: boolean;
}

/** Glazed opening on a wall plane: glass pane, perimeter frame, mullions and optional shutters. */
export function glazing(parts: Parts, o: Opening): void {
  const t = 0.1;
  const depth = 0.16;
  add(parts, "Glass_Tinted", placed(block(0, 0, 0, o.w, o.h, 0.04), o.x, o.y, o.z, o.yaw));
  const frame: MeshData[] = [
    block(0, 0, 0, o.w + t, t, depth),
    block(0, o.h - t, 0, o.w + t, t, depth),
    block(-o.w / 2, 0, 0, t, o.h, depth),
    block(o.w / 2, 0, 0, t, o.h, depth),
  ];
  const step = o.mullion ?? 0;
  if (step > 0) {
    const count = Math.max(1, Math.round(o.w / step));
    for (let i = 1; i < count; i++) frame.push(block(-o.w / 2 + (i * o.w) / count, 0, 0, t * 0.6, o.h, depth * 0.8));
  }
  for (const f of frame) add(parts, "Window_Frame", placed(f, o.x, o.y, o.z, o.yaw));
  if (o.shutters) {
    for (const side of [-1, 1]) add(parts, "Wood_Cladding", placed(block(side * (o.w / 2 + o.w / 4 + 0.1), 0, 0.08, o.w / 2, o.h, 0.06), o.x, o.y, o.z, o.yaw));
  }
}

/** Thin rim around a flat roof of size w x d whose top is at y. */
export function parapet(parts: Parts, material: MaterialName, cx: number, y: number, cz: number, w: number, d: number, h = 0.45, t = 0.25): void {
  add(parts, material, block(cx, y, cz - d / 2 + t / 2, w, h, t));
  add(parts, material, block(cx, y, cz + d / 2 - t / 2, w, h, t));
  add(parts, material, block(cx - w / 2 + t / 2, y, cz, t, h, d - 2 * t));
  add(parts, material, block(cx + w / 2 - t / 2, y, cz, t, h, d - 2 * t));
}

/** Frameless glass balustrade with a steel handrail, along X (yaw 0) or Z (yaw PI/2). */
export function glassRail(parts: Parts, cx: number, y: number, cz: number, length: number, yaw: number): void {
  add(parts, "Glass_Tinted", placed(block(0, 0, 0, length, 1.05, 0.04), cx, y, cz, yaw));
  add(parts, "Metal_Steel", placed(block(0, 1.05, 0, length, 0.06, 0.08), cx, y, cz, yaw));
}

/** Timber pergola: four posts, two beams and a row of slats. */
export function pergola(parts: Parts, cx: number, y: number, cz: number, w: number, d: number, h = 2.7): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(parts, "Deck_Teak", block(cx + sx * (w / 2 - 0.1), y, cz + sz * (d / 2 - 0.1), 0.18, h, 0.18));
    add(parts, "Deck_Teak", block(cx + sx * (w / 2 - 0.1), y + h, cz, 0.2, 0.25, d));
  }
  const slats = Math.round(w / 0.45);
  for (let i = 0; i <= slats; i++) add(parts, "Deck_Teak", block(cx - w / 2 + (i * w) / slats, y + h + 0.25, cz, 0.08, 0.16, d + 0.4));
}

/** Sun lounger with a canvas mattress. */
export function lounger(parts: Parts, x: number, y: number, z: number, yaw: number): void {
  add(parts, "Metal_Steel", placed(block(0, 0, 0, 0.7, 0.3, 1.9), x, y, z, yaw));
  add(parts, "Fabric_Canvas", placed(block(0, 0.3, 0.15, 0.66, 0.08, 1.5), x, y, z, yaw));
  add(parts, "Fabric_Canvas", placed(rotateX(block(0, 0, 0, 0.66, 0.08, 0.6), -0.7), x, y + 0.38, z - 0.75, yaw));
}

function rotateX(m: MeshData, angle: number): MeshData {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const arr of [m.positions, m.normals]) {
    for (let i = 0; i < arr.length; i += 3) {
      const y = arr[i + 1] ?? 0;
      const z = arr[i + 2] ?? 0;
      arr[i + 1] = y * c - z * s;
      arr[i + 2] = y * s + z * c;
    }
  }
  return m;
}

/** Rectangular pool: water slab sunk below a stone coping ring. */
export function pool(parts: Parts, cx: number, cz: number, w: number, d: number, coping: MaterialName = "Pool_Coping"): void {
  const t = 0.5;
  add(parts, "Pool_Water", block(cx, 0, cz, w, 0.14, d));
  add(parts, coping, block(cx, 0, cz - d / 2 - t / 2, w + 2 * t, 0.22, t));
  add(parts, coping, block(cx, 0, cz + d / 2 + t / 2, w + 2 * t, 0.22, t));
  add(parts, coping, block(cx - w / 2 - t / 2, 0, cz, t, 0.22, d));
  add(parts, coping, block(cx + w / 2 + t / 2, 0, cz, t, 0.22, d));
}

/** Compact hatchback-style car facing +Z (yaw rotates it). */
export function car(parts: Parts, x: number, y: number, z: number, yaw: number, color: readonly [number, number, number]): void {
  const body = mergeMesh(block(0, 0.3, 0, 1.8, 0.7, 4.4), block(0, 1.47, -0.2, 1.66, 0.08, 2.4));
  add(parts, "Car_Paint", placed(tint(body, color), x, y, z, yaw));
  add(parts, "Glass_Tinted", placed(block(0, 0.95, -0.2, 1.62, 0.52, 2.5), x, y, z, yaw));
  for (const sx of [-1, 1]) {
    for (const sz of [-1.4, 1.4]) add(parts, "Rubber", placed(block(sx * 0.82, 0, sz, 0.26, 0.6, 0.6), x, y, z, yaw));
  }
}

/** Perimeter garden wall with a gap (for the gate) centered at gateX on the street side. */
export function gardenWalls(parts: Parts, halfW: number, halfD: number, streetSide: 1 | -1, gateX: number, gateW: number): void {
  const h = 0.9;
  const t = 0.25;
  const back = -streetSide * (halfD - t / 2);
  const front = streetSide * (halfD - t / 2);
  add(parts, "Render_White", block(0, 0, back, 2 * halfW, h, t));
  for (const sx of [-1, 1]) add(parts, "Render_White", block(sx * (halfW - t / 2), 0, 0, t, h, 2 * halfD));
  const leftEnd = gateX - gateW / 2;
  const rightStart = gateX + gateW / 2;
  add(parts, "Render_White", block((-halfW + leftEnd) / 2, 0, front, leftEnd + halfW, h, t));
  add(parts, "Render_White", block((rightStart + halfW) / 2, 0, front, halfW - rightStart, h, t));
}
