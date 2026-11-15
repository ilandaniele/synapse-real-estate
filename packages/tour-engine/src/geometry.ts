import { fromViewBox, type NormalizedPoint, type PanoPosition } from "@synapse/domain";

export interface PanoView extends PanoPosition {
  fov: number;
}

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Lowercase ASCII slug used for stable test ids ("Baño principal" -> "bano-principal"). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** CSS percent position for an absolutely positioned marker over an image. */
export function toPercentStyle(point: NormalizedPoint): { left: string; top: string } {
  const pct = (v: number) => `${Math.round(clamp01(v) * 100000) / 1000}%`;
  return { left: pct(point.x), top: pct(point.y) };
}

/** Converts a pointer position into a clamped 0..1 point relative to an element rect. */
export function pointFromClient(clientX: number, clientY: number, rect: ClientRectLike): NormalizedPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return fromViewBox({ x: clientX - rect.left, y: clientY - rect.top }, rect.width, rect.height);
}

/** True when a pointer travelled further than `threshold` px (click vs drag). */
export function exceedsDragThreshold(dx: number, dy: number, threshold = 5): boolean {
  return Math.hypot(dx, dy) > threshold;
}

export interface ViewDelta {
  yaw: number;
  pitch: number;
  fov: number;
}

/** Keyboard navigation: arrow keys pan by 10% of the field of view, +/- zoom by 15%. */
export function viewDeltaForKey(key: string, fov: number): ViewDelta | null {
  const step = fov * 0.1;
  switch (key) {
    case "ArrowLeft":
      return { yaw: -step, pitch: 0, fov: 0 };
    case "ArrowRight":
      return { yaw: step, pitch: 0, fov: 0 };
    case "ArrowUp":
      return { yaw: 0, pitch: step, fov: 0 };
    case "ArrowDown":
      return { yaw: 0, pitch: -step, fov: 0 };
    case "+":
    case "=":
      return { yaw: 0, pitch: 0, fov: -fov * 0.15 };
    case "-":
    case "_":
      return { yaw: 0, pitch: 0, fov: fov * 0.15 };
    default:
      return null;
  }
}
