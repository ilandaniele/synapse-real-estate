/**
 * Small math + noise helpers for the CPU ray-caster.
 *
 * Angle convention (matches Marzipano 0.10 and `@synapse/domain` PanoPosition):
 *   - world: Y up, meters. Yaw 0 looks toward -Z, positive yaw turns to the right (toward +X),
 *     i.e. clockwise seen from above.
 *   - pitch: POSITIVE = looking UP (Marzipano `RectilinearView` docs: "pitch > 0 rotates upwards";
 *     equirect top row is pitch +PI/2). The generator never uses the opposite sign.
 *   - equirect image: u = 0.5 is yaw 0, u = 0 / 1 is yaw -PI / +PI, v = 0 is pitch +PI/2.
 */
export type Vec3 = [number, number, number];

export const TAU = Math.PI * 2;

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Integer lattice hash -> [0, 1). */
export function hash2(ix: number, iy: number, seed = 0): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Deterministic PRNG so every generator run yields identical assets. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Direction for (yaw, pitchUp) in the world convention documented above. */
export function yawPitchToDir(yaw: number, pitchUp: number): Vec3 {
  const cp = Math.cos(pitchUp);
  return [Math.sin(yaw) * cp, Math.sin(pitchUp), -Math.cos(yaw) * cp];
}

/** Inverse of `yawPitchToDir`; yaw in (-PI, PI], pitch positive = up. */
export function dirToYawPitch(dx: number, dy: number, dz: number): { yaw: number; pitch: number } {
  const l = Math.hypot(dx, dy, dz) || 1;
  return { yaw: Math.atan2(dx, -dz), pitch: Math.asin(clamp(dy / l, -1, 1)) };
}

/** Marzipano (yaw, pitch) of the direction from a camera position to a target point. */
export function lookAt(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  return dirToYawPitch(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
}
