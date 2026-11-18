import { equirectCoords, faceDirection, type Face } from "./faces";

/** Raw RGB pixels, three bytes per pixel, rows top to bottom. */
export interface RgbImage {
  data: Uint8Array;
  width: number;
  height: number;
}

const CHANNELS = 3;

/** Renders one square cube face of `size` pixels from an equirectangular image, with bilinear sampling. */
export function projectFace(source: RgbImage, face: Face, size: number): RgbImage {
  const { data, width, height } = source;
  const out = new Uint8Array(size * size * CHANNELS);
  for (let py = 0; py < size; py++) {
    const y = 0.5 - (py + 0.5) / size;
    for (let px = 0; px < size; px++) {
      const { s, t } = equirectCoords(faceDirection(face, (px + 0.5) / size - 0.5, y));
      const sx = s * width - 0.5;
      const sy = Math.min(Math.max(t * height - 0.5, 0), height - 1);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const left = ((x0 % width) + width) % width;
      const right = (left + 1) % width;
      const top = y0 * width;
      const bottom = Math.min(y0 + 1, height - 1) * width;
      const o = (py * size + px) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        const a = data[(top + left) * CHANNELS + c]!;
        const b = data[(top + right) * CHANNELS + c]!;
        const d = data[(bottom + left) * CHANNELS + c]!;
        const e = data[(bottom + right) * CHANNELS + c]!;
        out[o + c] = Math.round((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
      }
    }
  }
  return { data: out, width: size, height: size };
}
