import { Rgb } from "./materials";
import { clamp, hash2, TAU, type Vec3 } from "./math";
import type { Scene } from "./scene";
import { trace } from "./trace";

/** Full-sphere equirectangular camera (yaw 0 = image center = -Z). */
export interface EquirectCamera {
  kind: "equirect";
  pos: Vec3;
}

/** Pinhole camera. `fov` is the horizontal field of view in radians; pitch positive = up. */
export interface PerspectiveCamera {
  kind: "persp";
  pos: Vec3;
  yaw: number;
  pitch: number;
  fov: number;
}

export type Camera = EquirectCamera | PerspectiveCamera;

/** Narkowicz ACES approximation + gamma. */
function tonemap(x: number, exposure: number): number {
  const v = x * exposure;
  const a = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14);
  return Math.pow(clamp(a, 0, 1), 1 / 2.2);
}

/**
 * Renders rows [y0, y1) into `out` (RGB, 3 bytes per pixel, row stride = width * 3).
 * `spp` is a perfect square (1, 4, 9) for regular sub-pixel sampling.
 */
export function renderRows(scene: Scene, cam: Camera, width: number, height: number, y0: number, y1: number, spp: number, out: Uint8Array): void {
  const side = Math.max(1, Math.round(Math.sqrt(spp)));
  const col = new Rgb();
  const [ox, oy, oz] = cam.pos;

  // perspective basis
  let fx = 0;
  let fy = 0;
  let fz = -1;
  let rx = 1;
  let rz = 0;
  let ux = 0;
  let uy = 1;
  let uz = 0;
  let tanH = 1;
  let tanV = 1;
  if (cam.kind === "persp") {
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    fx = Math.sin(cam.yaw) * cp;
    fy = sp;
    fz = -Math.cos(cam.yaw) * cp;
    rx = Math.cos(cam.yaw);
    rz = Math.sin(cam.yaw);
    // up = right x forward
    ux = -rz * fy;
    uy = rz * fx - rx * fz;
    uz = rx * fy;
    tanH = Math.tan(cam.fov / 2);
    tanV = (tanH * height) / width;
  }

  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let sy = 0; sy < side; sy++) {
        for (let sx = 0; sx < side; sx++) {
          const u = (x + (sx + 0.5) / side) / width;
          const v = (y + (sy + 0.5) / side) / height;
          let dx: number;
          let dy: number;
          let dz: number;
          if (cam.kind === "equirect") {
            const yaw = (u - 0.5) * TAU;
            const pitch = (0.5 - v) * Math.PI;
            const cp = Math.cos(pitch);
            dx = Math.sin(yaw) * cp;
            dy = Math.sin(pitch);
            dz = -Math.cos(yaw) * cp;
          } else {
            const sxn = (u * 2 - 1) * tanH;
            const syn = (1 - v * 2) * tanV;
            dx = fx + rx * sxn + ux * syn;
            dy = fy + uy * syn;
            dz = fz + rz * sxn + uz * syn;
            const l = Math.hypot(dx, dy, dz);
            dx /= l;
            dy /= l;
            dz /= l;
          }
          trace(scene, ox, oy, oz, dx, dy, dz, col);
          // clamp fireflies (sun disc) before averaging so edges stay antialiased
          sr += Math.min(col.r, 16);
          sg += Math.min(col.g, 16);
          sb += Math.min(col.b, 16);
        }
      }
      const inv = 1 / (side * side);
      const n = (hash2(x, y, 77) - 0.5) / 255;
      const i = (y * width + x) * 3;
      out[i] = clamp(Math.round((tonemap(sr * inv, scene.exposure) + n) * 255), 0, 255);
      out[i + 1] = clamp(Math.round((tonemap(sg * inv, scene.exposure) + n) * 255), 0, 255);
      out[i + 2] = clamp(Math.round((tonemap(sb * inv, scene.exposure) + n) * 255), 0, 255);
    }
  }
}
