import { clamp, fbm2, hash2, noise2, smoothstep, type Vec3 } from "./math";

/** Mutable linear-RGB color (reused in the hot path to avoid allocations). */
export class Rgb {
  r = 0;
  g = 0;
  b = 0;
  /** 0..1, set by materials to flag glass pixels (mixed with a sky reflection when shading). */
  glass = 0;
  set(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
}

export interface Material {
  name: string;
  /** Writes the surface albedo at a world position (normal given for planar projection). */
  albedo(x: number, y: number, z: number, nx: number, ny: number, nz: number, out: Rgb): void;
  /** Blinn-Phong specular strength and exponent. */
  spec: number;
  shine: number;
  /** If > 0 the albedo is emitted instead of lit (lamps, screens). */
  emissive?: number;
  /** Sky-reflection amount at grazing angles (water). */
  reflect?: number;
}

const srgbToLinear = (c: number): number => Math.pow(c, 2.2);

/** "#rrggbb" -> linear RGB triple. */
export function hex(color: string): Vec3 {
  const n = parseInt(color.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

interface Opts {
  spec?: number;
  shine?: number;
  emissive?: number;
  reflect?: number;
}

function make(name: string, albedo: Material["albedo"], o: Opts = {}): Material {
  return { name, albedo, spec: o.spec ?? 0.04, shine: o.shine ?? 24, emissive: o.emissive, reflect: o.reflect };
}

/** Picks planar texture coordinates from the dominant normal axis. */
function uvOf(x: number, y: number, z: number, nx: number, ny: number): [number, number] {
  if (Math.abs(ny) > 0.5) return [x, z];
  if (Math.abs(nx) > 0.5) return [z, y];
  return [x, y];
}

export function solid(name: string, color: string, o: Opts = {}): Material {
  const [r, g, b] = hex(color);
  return make(name, (_x, _y, _z, _nx, _ny, _nz, out) => out.set(r, g, b), o);
}

/** Plaster / painted wall with very low-frequency mottling. */
export function plaster(name: string, color: string, o: Opts = {}): Material {
  const [r, g, b] = hex(color);
  return make(
    name,
    (x, y, z, nx, ny, _nz, out) => {
      const [u, v] = uvOf(x, y, z, nx, ny);
      const k = 0.93 + 0.1 * fbm2(u * 1.3, v * 1.3, 3, 3) + 0.03 * noise2(u * 40, v * 40, 9);
      out.set(r * k, g * k, b * k);
    },
    { spec: 0.02, shine: 8, ...o },
  );
}

/** Oak-style planks, 18 cm wide, staggered 1.2 m boards. */
export function woodFloor(name: string, light = "#c79a64", dark = "#8f6238"): Material {
  const a = hex(light);
  const b = hex(dark);
  return make(
    name,
    (x, _y, z, _nx, _ny, _nz, out) => {
      const row = Math.floor(z / 0.18);
      const off = hash2(row, 1) * 1.2;
      const col = Math.floor((x + off) / 1.2);
      const id = hash2(col, row, 5);
      const fz = z / 0.18 - row;
      const fx = (x + off) / 1.2 - col;
      const grain = fbm2((x + off) * 3, z * 28, 3, 11);
      const t = clamp(0.2 + id * 0.55 + (grain - 0.5) * 0.5, 0, 1);
      let k = 1;
      if (fz < 0.04 || fx < 0.004) k = 0.45; // gap between boards
      out.set((a[0] + (b[0] - a[0]) * t) * k, (a[1] + (b[1] - a[1]) * t) * k, (a[2] + (b[2] - a[2]) * t) * k);
    },
    { spec: 0.22, shine: 60 },
  );
}

/** Square tiles with grout, subtle per-tile tint. */
export function tiles(name: string, color: string, grout: string, size = 0.6, o: Opts = {}): Material {
  const c = hex(color);
  const g = hex(grout);
  return make(
    name,
    (x, y, z, nx, ny, _nz, out) => {
      const [u, v] = uvOf(x, y, z, nx, ny);
      const iu = Math.floor(u / size);
      const iv = Math.floor(v / size);
      const fu = u / size - iu;
      const fv = v / size - iv;
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv) * size;
      if (edge < 0.004) {
        out.set(g[0], g[1], g[2]);
        return;
      }
      const k = 0.94 + 0.1 * hash2(iu, iv, 21) + 0.04 * noise2(u * 6, v * 6, 4);
      out.set(c[0] * k, c[1] * k, c[2] * k);
    },
    { spec: 0.3, shine: 70, ...o },
  );
}

/** Woven-looking fabric. */
export function fabric(name: string, color: string): Material {
  const [r, g, b] = hex(color);
  return make(
    name,
    (x, y, z, nx, ny, _nz, out) => {
      const [u, v] = uvOf(x, y, z, nx, ny);
      const k = 0.88 + 0.2 * noise2(u * 90, v * 90, 2) + 0.06 * noise2(u * 6, v * 6, 8);
      out.set(r * k, g * k, b * k);
    },
    { spec: 0.01, shine: 4 },
  );
}

/** Rug with stripes. */
export function rug(name: string, base: string, stripe: string): Material {
  const a = hex(base);
  const b = hex(stripe);
  return make(
    name,
    (x, _y, z, _nx, _ny, _nz, out) => {
      const s = Math.sin(z * 9.0) > 0.55 ? 1 : 0;
      const k = 0.9 + 0.2 * noise2(x * 70, z * 70, 6);
      const m = s === 1 ? b : a;
      out.set(m[0] * k, m[1] * k, m[2] * k);
    },
    { spec: 0, shine: 1 },
  );
}

/** Stone countertop with veining. */
export function stone(name: string, color: string): Material {
  const [r, g, b] = hex(color);
  return make(
    name,
    (x, y, z, nx, ny, _nz, out) => {
      const [u, v] = uvOf(x, y, z, nx, ny);
      const vein = Math.abs(fbm2(u * 3 + 4, v * 3, 4, 31) - 0.5) < 0.03 ? 0.78 : 1;
      const k = (0.94 + 0.1 * fbm2(u * 8, v * 8, 3, 32)) * vein;
      out.set(r * k, g * k, b * k);
    },
    { spec: 0.4, shine: 90 },
  );
}

/** Abstract canvas used as wall art. */
export function artwork(name: string, c1: string, c2: string, c3: string): Material {
  const a = hex(c1);
  const b = hex(c2);
  const c = hex(c3);
  return make(
    name,
    (x, y, z, nx, ny, _nz, out) => {
      const [u, v] = uvOf(x, y, z, nx, ny);
      const n = fbm2(u * 1.6, v * 1.6, 3, 71);
      const t1 = smoothstep(0.35, 0.5, n);
      const t2 = smoothstep(0.55, 0.7, n);
      out.set(
        a[0] + (b[0] - a[0]) * t1 + (c[0] - b[0]) * t2,
        a[1] + (b[1] - a[1]) * t1 + (c[1] - b[1]) * t2,
        a[2] + (b[2] - a[2]) * t1 + (c[2] - b[2]) * t2,
      );
    },
    { spec: 0.05, shine: 10 },
  );
}

/** Mirror modelled as a bright, slightly cool emissive gradient. */
export function mirror(name: string): Material {
  return make(
    name,
    (_x, y, _z, _nx, _ny, _nz, out) => {
      const t = clamp((y - 1) / 1.4, 0, 1);
      out.set(0.55 + 0.25 * t, 0.62 + 0.25 * t, 0.7 + 0.2 * t);
    },
    { emissive: 1 },
  );
}

/** Emissive lamp / screen. */
export function emitter(name: string, color: string, power: number): Material {
  const [r, g, b] = hex(color);
  return make(name, (_x, _y, _z, _nx, _ny, _nz, out) => out.set(r, g, b), { emissive: power });
}

/** Lawn with mowing stripes and fbm variation. */
export function grass(name: string, light = "#7f9c4c", dark = "#4c6a2c"): Material {
  const a = hex(light);
  const b = hex(dark);
  return make(
    name,
    (x, _y, z, _nx, _ny, _nz, out) => {
      const n = fbm2(x * 0.35, z * 0.35, 4, 41);
      const fine = noise2(x * 18, z * 18, 42);
      const stripe = 0.94 + 0.06 * Math.sin(z * 1.1);
      const t = clamp(n * 1.3 + (fine - 0.5) * 0.35, 0, 1);
      out.set((a[0] + (b[0] - a[0]) * t) * stripe, (a[1] + (b[1] - a[1]) * t) * stripe, (a[2] + (b[2] - a[2]) * t) * stripe);
    },
    { spec: 0, shine: 1 },
  );
}

/** Large-format paving slabs. */
export function paving(name: string, color = "#d9d3c7"): Material {
  return tiles(name, color, "#8c8678", 0.9, { spec: 0.05, shine: 16 });
}

/** Pool water: teal gradient from edge to center plus ripples; mixes with sky reflection. */
export function water(name: string, cx: number, cz: number, rx: number, rz: number): Material {
  const shallow = hex("#52d3d8");
  const deep = hex("#0f7f9b");
  return make(
    name,
    (x, _y, z, _nx, _ny, _nz, out) => {
      const ex = 1 - Math.abs(x - cx) / rx;
      const ez = 1 - Math.abs(z - cz) / rz;
      const depth = smoothstep(0, 0.45, Math.min(ex, ez));
      const ripple = noise2(x * 4, z * 4, 51) * 0.12 + noise2(x * 11, z * 11, 52) * 0.06;
      const t = clamp(depth + ripple - 0.06, 0, 1);
      out.set(
        shallow[0] + (deep[0] - shallow[0]) * t,
        shallow[1] + (deep[1] - shallow[1]) * t,
        shallow[2] + (deep[2] - shallow[2]) * t,
      );
    },
    { spec: 0.9, shine: 220, reflect: 0.55 },
  );
}

/** Open water far away (sea). */
export function sea(name: string): Material {
  const c = hex("#2a7aa6");
  return make(name, (x, _y, z, _nx, _ny, _nz, out) => {
    const k = 0.9 + 0.2 * noise2(x * 0.05, z * 0.4, 61);
    out.set(c[0] * k, c[1] * k, c[2] * k);
  }, { spec: 0.5, shine: 120, reflect: 0.45 });
}

export interface GlazingZone {
  /** Plane the zone lies on: facade normal axis ("x" -> normal along X, "z" -> along Z). */
  axis: "x" | "z";
  /** Coordinate of the plane along `axis`. */
  plane: number;
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  /** Number of equal glass panes separated by mullions. */
  panes?: number;
  door?: boolean;
}

/** White render facade with glazing zones (glass flagged for sky reflection / interior glow). */
export function facade(name: string, base: string, frame: string, interior: string, zones: GlazingZone[]): Material {
  const w = hex(base);
  const f = hex(frame);
  const inside = hex(interior);
  return make(
    name,
    (x, y, z, nx, ny, nz, out) => {
      if (ny > 0.5) {
        const k = 0.96 + 0.05 * noise2(x * 3, z * 3, 81);
        out.set(w[0] * k, w[1] * k, w[2] * k);
        return;
      }
      const onX = Math.abs(nx) > 0.5;
      for (let i = 0; i < zones.length; i++) {
        const zn = zones[i];
        if (!zn) continue;
        if (zn.axis === "x" ? !onX : onX) continue;
        const plane = zn.axis === "x" ? x : z;
        if (Math.abs(plane - zn.plane) > 0.06) continue;
        const u = zn.axis === "x" ? z : x;
        if (u < zn.u0 || u > zn.u1 || y < zn.y0 || y > zn.y1) continue;
        const edge = Math.min(u - zn.u0, zn.u1 - u, y - zn.y0, zn.y1 - y);
        let bar = edge < 0.07;
        const panes = zn.panes ?? 1;
        if (!bar && panes > 1) {
          const pw = (zn.u1 - zn.u0) / panes;
          const m = ((u - zn.u0) % pw) / pw;
          bar = Math.min(m, 1 - m) * pw < 0.03;
        }
        if (bar) out.set(f[0], f[1], f[2]);
        else {
          out.set(inside[0], inside[1], inside[2]);
          out.glass = 1;
        }
        return;
      }
      const k = 0.95 + 0.07 * fbm2(x * 0.8 + z * 0.8, y * 0.8, 3, 82);
      out.set(w[0] * k, w[1] * k, w[2] * k);
    },
    { spec: 0.03, shine: 12 },
  );
}

/** Dense tree foliage / hedge. */
export function foliage(name: string, light = "#4f7f35", dark = "#1f4524"): Material {
  const a = hex(light);
  const b = hex(dark);
  return make(
    name,
    (x, y, z, _nx, _ny, _nz, out) => {
      const n = fbm2((x + z) * 0.9, y * 1.1, 4, 101);
      const t = clamp(n * 1.5 - 0.15, 0, 1);
      out.set(a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t));
    },
    { spec: 0, shine: 1 },
  );
}
