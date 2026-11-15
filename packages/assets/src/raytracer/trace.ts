import { Rgb, solid, type Material } from "./materials";
import { clamp } from "./math";
import type { Box, Opening, Ring, RoomShell, Scene, Wall } from "./scene";
import { skyColor } from "./sky";

const EPS = 1e-4;
const INF = 1e30;

const WINDOW_FRAME = solid("window-frame", "#efece4", { spec: 0.1, shine: 30 });
const BASEBOARD = solid("baseboard", "#f4f1ea", { spec: 0.15, shine: 30 });
const DOOR_TRIM = solid("door-trim", "#2c2723", { spec: 0.15, shine: 30 });

const alb = new Rgb();
const sky = new Rgb();
const aux = new Rgb();

/* ------------------------------------------------------------------ primitives */

let bnx = 0;
let bny = 0;
let bnz = 0;

/** Slab test for a ray starting outside the box. Returns entry t or -1; normal in bnx/bny/bnz. */
function intersectBox(b: Box, ox: number, oy: number, oz: number, ix: number, iy: number, iz: number): number {
  const t1x = (b.min[0] - ox) * ix;
  const t2x = (b.max[0] - ox) * ix;
  const t1y = (b.min[1] - oy) * iy;
  const t2y = (b.max[1] - oy) * iy;
  const t1z = (b.min[2] - oz) * iz;
  const t2z = (b.max[2] - oz) * iz;
  const nxn = t1x < t2x ? t1x : t2x;
  const nxf = t1x < t2x ? t2x : t1x;
  const nyn = t1y < t2y ? t1y : t2y;
  const nyf = t1y < t2y ? t2y : t1y;
  const nzn = t1z < t2z ? t1z : t2z;
  const nzf = t1z < t2z ? t2z : t1z;
  let tn = nxn;
  let axis = 0;
  if (nyn > tn) {
    tn = nyn;
    axis = 1;
  }
  if (nzn > tn) {
    tn = nzn;
    axis = 2;
  }
  const tf = Math.min(nxf, nyf, nzf);
  if (tn > tf || tn < EPS) return -1;
  bnx = 0;
  bny = 0;
  bnz = 0;
  if (axis === 0) bnx = ix > 0 ? -1 : 1;
  else if (axis === 1) bny = iy > 0 ? -1 : 1;
  else bnz = iz > 0 ? -1 : 1;
  return tn;
}

function intersectSphere(cx: number, cy: number, cz: number, r: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = -b - s;
  return t > EPS ? t : -1;
}

/** Ray from inside the tree ring; returns exit t if it hits the foliage wall below its crest. */
function intersectRing(r: Ring, groundY: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const px = ox - r.cx;
  const pz = oz - r.cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return -1;
  const b = px * dx + pz * dz;
  const c = px * px + pz * pz - r.radius * r.radius;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b + Math.sqrt(disc)) / a;
  if (t < EPS) return -1;
  const y = oy + dy * t;
  if (y < groundY) return -1;
  const ang = Math.atan2(px + dx * t, pz + dz * t);
  return y <= r.heightAt(ang) ? t : -1;
}

/* ------------------------------------------------------------------ room shell */

let shAxis = 0;
let shPos = false;

/** Exit point of a ray starting inside the shell. */
function shellExit(s: RoomShell, ox: number, oy: number, oz: number, ix: number, iy: number, iz: number): number {
  const tx = ((ix > 0 ? s.max[0] : s.min[0]) - ox) * ix;
  const ty = ((iy > 0 ? s.max[1] : s.min[1]) - oy) * iy;
  const tz = ((iz > 0 ? s.max[2] : s.min[2]) - oz) * iz;
  if (tx <= ty && tx <= tz) {
    shAxis = 0;
    shPos = ix > 0;
    return tx;
  }
  if (ty <= tz) {
    shAxis = 1;
    shPos = iy > 0;
    return ty;
  }
  shAxis = 2;
  shPos = iz > 0;
  return tz;
}

function wallOf(axis: number, pos: boolean): Wall {
  return axis === 0 ? (pos ? "E" : "W") : pos ? "S" : "N";
}

function findOpening(s: RoomShell, wall: Wall, lat: number, y: number): Opening | null {
  for (let i = 0; i < s.openings.length; i++) {
    const op = s.openings[i];
    if (op && op.wall === wall && lat >= op.a && lat <= op.b && y >= op.y0 && y <= op.y1) return op;
  }
  return null;
}

/** Distance to the opening border (frame detection) and mullion test. */
function openingEdge(op: Opening, lat: number, y: number): number {
  let e = Math.min(lat - op.a, op.b - lat, y - op.y0, op.y1 - y);
  if (op.panes && op.panes > 1) {
    const pw = (op.b - op.a) / op.panes;
    const m = ((lat - op.a) % pw) / pw;
    e = Math.min(e, (Math.min(m, 1 - m) * pw) * 2);
  }
  return e;
}

/* ------------------------------------------------------------------ occlusion & AO */

function occludedByObjects(scene: Scene, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): boolean {
  const ix = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
  const iy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy);
  const iz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
  const boxes = scene.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b || b.material.emissive || b.max[0] - b.min[0] < 0.05 || b.max[2] - b.min[2] < 0.05) continue;
    const t = intersectBox(b, ox, oy, oz, ix, iy, iz);
    if (t > 0 && t < maxT) return true;
  }
  const spheres = scene.spheres;
  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i];
    if (!s || s.material.emissive) continue;
    const t = intersectSphere(s.c[0], s.c[1], s.c[2], s.r, ox, oy, oz, dx, dy, dz);
    if (t > 0 && t < maxT) return true;
  }
  return false;
}

function sunVisible(scene: Scene, px: number, py: number, pz: number): boolean {
  const [dx, dy, dz] = scene.sun.dir;
  if (dy <= 0) return false;
  if (occludedByObjects(scene, px, py, pz, dx, dy, dz, INF)) return false;
  const shell = scene.shell;
  if (!shell) return true;
  const ix = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
  const iy = 1 / dy;
  const iz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
  const t = shellExit(shell, px, py, pz, ix, iy, iz);
  if (shAxis === 1) return false;
  const qx = px + dx * t;
  const qy = py + dy * t;
  const qz = pz + dz * t;
  const wall = wallOf(shAxis, shPos);
  const op = findOpening(shell, wall, shAxis === 0 ? qz : qx, qy);
  if (!op || op.kind !== "window") return false;
  return openingEdge(op, shAxis === 0 ? qz : qx, qy) > 0.06;
}

const AO_R = 0.7;

/** Cheap fake ambient occlusion: darkening near room corners and around furniture. */
function ambientOcclusion(scene: Scene, px: number, py: number, pz: number, nx: number, ny: number, nz: number): number {
  let occ = 0;
  const shell = scene.shell;
  if (shell) {
    const p = [px, py, pz];
    const n = [nx, ny, nz];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(n[a] ?? 0) > 0.5) continue;
      const lo = (p[a] ?? 0) - (shell.min[a] ?? 0);
      const hi = (shell.max[a] ?? 0) - (p[a] ?? 0);
      if (lo < AO_R) occ += 0.5 * (1 - lo / AO_R) ** 2;
      if (hi < AO_R) occ += 0.5 * (1 - hi / AO_R) ** 2;
    }
  }
  const boxes = scene.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b) continue;
    const sx = b.max[0] - b.min[0];
    const sy = b.max[1] - b.min[1];
    const sz = b.max[2] - b.min[2];
    if (sx < 0.06 || sy < 0.06 || sz < 0.06) continue;
    const ex = Math.max(b.min[0] - px, 0, px - b.max[0]);
    const ey = Math.max(b.min[1] - py, 0, py - b.max[1]);
    const ez = Math.max(b.min[2] - pz, 0, pz - b.max[2]);
    if (ex > AO_R || ey > AO_R || ez > AO_R) continue;
    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (d < 0.003 || d >= AO_R) continue;
    occ += 0.55 * (1 - d / AO_R) ** 2;
  }
  return clamp(1 - occ, 0.3, 1);
}

/* ------------------------------------------------------------------ shading */

function outdoorLevel(scene: Scene): number {
  const a = scene.ambient;
  return (a.top[0] + a.top[1] + a.top[2]) / 3 * 0.7 + (a.bottom[0] + a.bottom[1] + a.bottom[2]) / 3 * 0.3;
}

function shade(scene: Scene, px: number, py: number, pz: number, nx: number, ny: number, nz: number, mat: Material, dx: number, dy: number, dz: number, out: Rgb): void {
  alb.glass = 0;
  mat.albedo(px, py, pz, nx, ny, nz, alb);
  const em = mat.emissive;
  if (em) {
    out.r = alb.r * em;
    out.g = alb.g * em;
    out.b = alb.b * em;
    return;
  }

  // A reflected view direction is needed for glass / water / specular.
  const dn = dx * nx + dy * ny + dz * nz;
  const cosV = Math.abs(dn);

  if (alb.glass > 0) {
    const rx = dx - 2 * dn * nx;
    const ry = dy - 2 * dn * ny;
    const rz = dz - 2 * dn * nz;
    skyColor(scene.outdoor.sky, rx, Math.max(ry, 0.02), rz, sky);
    const f = 0.3 + 0.6 * Math.pow(1 - cosV, 3);
    const glow = scene.glassGlow;
    out.r = alb.r * glow * (1 - f) + sky.r * f;
    out.g = alb.g * glow * (1 - f) + sky.g * f;
    out.b = alb.b * glow * (1 - f) + sky.b * f;
    return;
  }

  const amb = scene.ambient;
  const h = ny * 0.5 + 0.5;
  const ao = ambientOcclusion(scene, px, py, pz, nx, ny, nz);
  let lr = (amb.bottom[0] + (amb.top[0] - amb.bottom[0]) * h) * ao;
  let lg = (amb.bottom[1] + (amb.top[1] - amb.bottom[1]) * h) * ao;
  let lb = (amb.bottom[2] + (amb.top[2] - amb.bottom[2]) * h) * ao;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const spec = mat.spec;
  const shine = mat.shine;
  const vx = -dx;
  const vy = -dy;
  const vz = -dz;

  // sun
  const sun = scene.sun;
  const ndl = nx * sun.dir[0] + ny * sun.dir[1] + nz * sun.dir[2];
  if (ndl > 0 && sunVisible(scene, px + nx * 2e-3, py + ny * 2e-3, pz + nz * 2e-3)) {
    lr += sun.color[0] * ndl;
    lg += sun.color[1] * ndl;
    lb += sun.color[2] * ndl;
    if (spec > 0) {
      let hx = sun.dir[0] + vx;
      let hy = sun.dir[1] + vy;
      let hz = sun.dir[2] + vz;
      const hl = Math.hypot(hx, hy, hz) || 1;
      hx /= hl;
      hy /= hl;
      hz /= hl;
      const s = Math.pow(Math.max(nx * hx + ny * hy + nz * hz, 0), shine) * spec;
      sr += sun.color[0] * s;
      sg += sun.color[1] * s;
      sb += sun.color[2] * s;
    }
  }

  // point lights
  const lights = scene.lights;
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    if (!L) continue;
    const lx = L.pos[0] - px;
    const ly = L.pos[1] - py;
    const lz = L.pos[2] - pz;
    const d2 = lx * lx + ly * ly + lz * lz;
    const d = Math.sqrt(d2);
    const ndl2 = (nx * lx + ny * ly + nz * lz) / d;
    if (ndl2 <= 0) continue;
    const ux = lx / d;
    const uy = ly / d;
    const uz = lz / d;
    if (L.shadow && occludedByObjects(scene, px + nx * 2e-3, py + ny * 2e-3, pz + nz * 2e-3, ux, uy, uz, d - 0.02)) continue;
    const att = ndl2 / (1 + d2 * 0.1);
    lr += L.color[0] * att;
    lg += L.color[1] * att;
    lb += L.color[2] * att;
    if (spec > 0) {
      let hx = ux + vx;
      let hy = uy + vy;
      let hz = uz + vz;
      const hl = Math.hypot(hx, hy, hz) || 1;
      hx /= hl;
      hy /= hl;
      hz /= hl;
      const s = Math.pow(Math.max(nx * hx + ny * hy + nz * hz, 0), shine) * spec * att;
      sr += L.color[0] * s;
      sg += L.color[1] * s;
      sb += L.color[2] * s;
    }
  }

  // soft window lights (no shadows)
  const soft = scene.softLights;
  for (let i = 0; i < soft.length; i++) {
    const L = soft[i];
    if (!L) continue;
    const lx = L.pos[0] - px;
    const ly = L.pos[1] - py;
    const lz = L.pos[2] - pz;
    const d2 = lx * lx + ly * ly + lz * lz;
    const d = Math.sqrt(d2) || 1;
    const a = (nx * lx + ny * ly + nz * lz) / d;
    const c = -(L.normal[0] * lx + L.normal[1] * ly + L.normal[2] * lz) / d;
    if (a <= 0 || c <= 0) continue;
    const att = (a * (0.35 + 0.65 * c)) / (1 + d2 * 0.18);
    lr += L.color[0] * att * ao;
    lg += L.color[1] * att * ao;
    lb += L.color[2] * att * ao;
  }

  let r = alb.r * lr + sr;
  let g = alb.g * lg + sg;
  let b = alb.b * lb + sb;

  const refl = mat.reflect;
  if (refl) {
    const rx = dx - 2 * dn * nx;
    const ry = dy - 2 * dn * ny;
    const rz = dz - 2 * dn * nz;
    skyColor(scene.outdoor.sky, rx, Math.max(ry, 0.01), rz, sky);
    const f = refl * (0.25 + 0.75 * Math.pow(1 - cosV, 3));
    r = r * (1 - f) + sky.r * f;
    g = g * (1 - f) + sky.g * f;
    b = b * (1 - f) + sky.b * f;
  }
  out.r = r;
  out.g = g;
  out.b = b;
}

function applyFog(scene: Scene, t: number, out: Rgb): void {
  const o = scene.outdoor;
  if (o.fog <= 0) return;
  const f = 1 - Math.exp(-t * o.fog);
  out.r += (o.sky.haze[0] - out.r) * f;
  out.g += (o.sky.haze[1] - out.g) * f;
  out.b += (o.sky.haze[2] - out.b) * f;
}

/** Outdoor radiance seen through a window: ground, tree ring or sky with simplified lighting. */
function outdoorColor(scene: Scene, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: Rgb): void {
  const o = scene.outdoor;
  const gy = o.ground.y;
  let tg = INF;
  if (dy < -1e-6) {
    const t = (gy - oy) / dy;
    if (t > EPS) tg = t;
  }
  let tr = -1;
  if (o.ring) tr = intersectRing(o.ring, gy, ox, oy, oz, dx, dy, dz);
  const level = outdoorLevel(scene) + Math.max(scene.sun.dir[1], 0) * 0.55 * (scene.sun.color[0] + scene.sun.color[1] + scene.sun.color[2]) / 3;
  if (tr > 0 && tr < tg && o.ring) {
    const px = ox + dx * tr;
    const py = oy + dy * tr;
    const pz = oz + dz * tr;
    o.ring.material.albedo(px, py, pz, 0, 0, 1, aux);
    out.set(aux.r * level, aux.g * level, aux.b * level);
    applyFog(scene, tr, out);
    return;
  }
  if (tg < INF) {
    const px = ox + dx * tg;
    const pz = oz + dz * tg;
    o.ground.pick(px, pz).albedo(px, gy, pz, 0, 1, 0, aux);
    out.set(aux.r * level, aux.g * level, aux.b * level);
    applyFog(scene, tg, out);
    return;
  }
  skyColor(o.sky, dx, dy, dz, out);
}

/* ------------------------------------------------------------------ passages */

function shadeBeyond(shell: RoomShell, op: Opening, qx: number, qy: number, qz: number, dx: number, dy: number, dz: number, out: Rgb): void {
  const bey = op.beyond;
  if (!bey) {
    out.set(0.05, 0.05, 0.05);
    return;
  }
  const D = bey.depth;
  let x0 = op.a;
  let x1 = op.b;
  let z0 = op.a;
  let z1 = op.b;
  if (op.wall === "N") {
    z0 = shell.min[2] - D;
    z1 = shell.min[2];
  } else if (op.wall === "S") {
    z0 = shell.max[2];
    z1 = shell.max[2] + D;
  } else if (op.wall === "W") {
    x0 = shell.min[0] - D;
    x1 = shell.min[0];
  } else {
    x0 = shell.max[0];
    x1 = shell.max[0] + D;
  }
  const y0 = shell.min[1];
  const y1 = op.y1;
  const sdx = Math.abs(dx) < 1e-9 ? 1e-9 : dx;
  const sdz = Math.abs(dz) < 1e-9 ? 1e-9 : dz;
  const sdy = Math.abs(dy) < 1e-9 ? 1e-9 : dy;
  const tx = ((sdx > 0 ? x1 : x0) - qx) / sdx;
  const ty = ((sdy > 0 ? y1 : y0) - qy) / sdy;
  const tz = ((sdz > 0 ? z1 : z0) - qz) / sdz;
  const t = Math.min(tx, ty, tz);
  const hx = qx + dx * t;
  const hy = qy + dy * t;
  const hz = qz + dz * t;
  const outward = op.wall === "N" ? shell.min[2] - hz : op.wall === "S" ? hz - shell.max[2] : op.wall === "W" ? shell.min[0] - hx : hx - shell.max[0];
  const f = clamp(outward / D, 0, 1);
  let k = bey.light * (1 - 0.5 * f);
  if (t === ty) {
    if (sdy < 0) {
      bey.floor.albedo(hx, y0, hz, 0, 1, 0, alb);
      k *= 0.9;
    } else {
      bey.wall.albedo(hx, y1, hz, 0, -1, 0, alb);
      k *= 0.65;
    }
  } else {
    const nxs = t === tx ? (sdx > 0 ? -1 : 1) : 0;
    const nzs = t === tz && t !== tx ? (sdz > 0 ? -1 : 1) : 0;
    bey.wall.albedo(hx, hy, hz, nxs, 0, nzs, alb);
    if (f > 0.97) k *= 1.1;
  }
  out.set(alb.r * k, alb.g * k, alb.b * k);
}

/* ------------------------------------------------------------------ main entry */

const K_BOX = 1;
const K_SPHERE = 2;
const K_SHELL = 3;
const K_GROUND = 4;
const K_RING = 5;

/** Traces one ray; writes linear HDR radiance into `out`. `d` must be a unit vector. */
export function trace(scene: Scene, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: Rgb): void {
  const sdx = Math.abs(dx) < 1e-9 ? 1e-9 : dx;
  const sdy = Math.abs(dy) < 1e-9 ? 1e-9 : dy;
  const sdz = Math.abs(dz) < 1e-9 ? 1e-9 : dz;
  const ix = 1 / sdx;
  const iy = 1 / sdy;
  const iz = 1 / sdz;

  let bestT = INF;
  let kind = 0;
  let mat: Material | null = null;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  const boxes = scene.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b) continue;
    const t = intersectBox(b, ox, oy, oz, ix, iy, iz);
    if (t > 0 && t < bestT) {
      bestT = t;
      kind = K_BOX;
      mat = b.material;
      nx = bnx;
      ny = bny;
      nz = bnz;
    }
  }
  const spheres = scene.spheres;
  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i];
    if (!s) continue;
    const t = intersectSphere(s.c[0], s.c[1], s.c[2], s.r, ox, oy, oz, dx, dy, dz);
    if (t > 0 && t < bestT) {
      bestT = t;
      kind = K_SPHERE;
      mat = s.material;
      nx = (ox + dx * t - s.c[0]) / s.r;
      ny = (oy + dy * t - s.c[1]) / s.r;
      nz = (oz + dz * t - s.c[2]) / s.r;
    }
  }

  const shell = scene.shell;
  if (shell) {
    const t = shellExit(shell, ox, oy, oz, ix, iy, iz);
    if (t < bestT) {
      bestT = t;
      kind = K_SHELL;
    }
  } else {
    const o = scene.outdoor;
    if (dy < -1e-6) {
      const t = (o.ground.y - oy) / dy;
      if (t > EPS && t < bestT) {
        bestT = t;
        kind = K_GROUND;
        nx = 0;
        ny = 1;
        nz = 0;
      }
    }
    if (o.ring) {
      const t = intersectRing(o.ring, o.ground.y, ox, oy, oz, dx, dy, dz);
      if (t > 0 && t < bestT) {
        bestT = t;
        kind = K_RING;
      }
    }
  }

  if (kind === 0) {
    skyColor(scene.outdoor.sky, dx, dy, dz, out);
    return;
  }

  const px = ox + dx * bestT;
  const py = oy + dy * bestT;
  const pz = oz + dz * bestT;

  if (kind === K_GROUND) {
    mat = scene.outdoor.ground.pick(px, pz);
  } else if (kind === K_RING && scene.outdoor.ring) {
    const r = scene.outdoor.ring;
    mat = r.material;
    nx = (r.cx - px) / r.radius;
    nz = (r.cz - pz) / r.radius;
  } else if (kind === K_SHELL && shell) {
    const axis = shAxis;
    const pos = shPos;
    if (axis === 1) {
      mat = pos ? shell.ceiling : shell.floor;
      ny = pos ? -1 : 1;
    } else {
      const wall = wallOf(axis, pos);
      nx = axis === 0 ? (pos ? -1 : 1) : 0;
      nz = axis === 2 ? (pos ? -1 : 1) : 0;
      mat = py < 0.09 ? BASEBOARD : shell.walls[wall];
      const lat = axis === 0 ? pz : px;
      const op = findOpening(shell, wall, lat, py);
      if (op) {
        const edge = openingEdge(op, lat, py);
        if (op.kind === "window") {
          if (edge > 0.06) {
            outdoorColor(scene, px, py, pz, dx, dy, dz, out);
            const g = scene.windowGain;
            out.r *= g * 0.92;
            out.g *= g * 0.97;
            out.b *= g;
            return;
          }
          mat = WINDOW_FRAME;
        } else {
          if (edge > 0.05) {
            shadeBeyond(shell, op, px, py, pz, dx, dy, dz, out);
            return;
          }
          mat = DOOR_TRIM;
        }
      }
    }
  }

  if (!mat) {
    skyColor(scene.outdoor.sky, dx, dy, dz, out);
    return;
  }
  shade(scene, px, py, pz, nx, ny, nz, mat, dx, dy, dz, out);
  if (!shell) applyFog(scene, bestT, out);
}
