import { Rgb } from "./materials";
import { clamp, fbm2, smoothstep } from "./math";
import type { Sky } from "./scene";

/** Sky radiance for a direction: gradient, sun glow + disc, soft clouds, far hills. */
export function skyColor(sky: Sky, dx: number, dy: number, dz: number, out: Rgb): void {
  const up = clamp(dy, 0, 1);
  const t = Math.pow(up, 0.45);
  let r = sky.horizon[0] + (sky.zenith[0] - sky.horizon[0]) * t;
  let g = sky.horizon[1] + (sky.zenith[1] - sky.horizon[1]) * t;
  let b = sky.horizon[2] + (sky.zenith[2] - sky.horizon[2]) * t;

  if (dy > 0.02 && sky.clouds > 0) {
    const inv = 1 / (dy + 0.18);
    const cu = dx * inv * 1.6;
    const cv = dz * inv * 1.6;
    const c = smoothstep(1 - sky.clouds * 0.6, 1 - sky.clouds * 0.6 + 0.3, fbm2(cu + 3.1, cv + 7.7, 5, 91));
    const fade = smoothstep(0.02, 0.22, dy);
    const k = c * fade * 0.85;
    r += (1.05 * (sky.horizon[0] + 0.15) - r) * k;
    g += (1.05 * (sky.horizon[1] + 0.15) - g) * k;
    b += (1.05 * (sky.horizon[2] + 0.15) - b) * k;
  }

  const cs = dx * sky.sunDir[0] + dy * sky.sunDir[1] + dz * sky.sunDir[2];
  if (cs > 0) {
    const halo = Math.exp((cs - 1) * 90) * 0.3 + Math.exp((cs - 1) * 500) * 2.5;
    r += sky.sunColor[0] * halo;
    g += sky.sunColor[1] * halo;
    b += sky.sunColor[2] * halo;
    if (cs > Math.cos(sky.sunSize)) {
      r = sky.sunColor[0] * 14;
      g = sky.sunColor[1] * 14;
      b = sky.sunColor[2] * 14;
    }
  }

  if (sky.hills && dy > 0 && dy < 0.2) {
    const az = Math.atan2(dx, -dz);
    const h = 0.025 + 0.07 * fbm2(az * 2.4 + 5, 0.5, 4, 93);
    if (dy < h) {
      const m = 0.55 + 0.35 * smoothstep(0, h, dy);
      r = sky.hills[0] * m + sky.haze[0] * (1 - m);
      g = sky.hills[1] * m + sky.haze[1] * (1 - m);
      b = sky.hills[2] * m + sky.haze[2] * (1 - m);
    }
  }
  out.r = r;
  out.g = g;
  out.b = b;
}
