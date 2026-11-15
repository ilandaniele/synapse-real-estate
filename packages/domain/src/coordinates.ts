export interface PanoPosition {
  yaw: number;
  pitch: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export function normalizeYaw(yaw: number): number {
  const wrapped = (((yaw + Math.PI) % TAU) + TAU) % TAU;
  return wrapped - Math.PI;
}

export function clampPitch(pitch: number): number {
  return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
}

export function normalizePanoPosition(position: PanoPosition): PanoPosition {
  return { yaw: normalizeYaw(position.yaw), pitch: clampPitch(position.pitch) };
}

export function isNormalizedPoint(point: NormalizedPoint): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function toViewBox(point: NormalizedPoint, width: number, height: number): NormalizedPoint {
  return { x: point.x * width, y: point.y * height };
}

export function fromViewBox(point: NormalizedPoint, width: number, height: number): NormalizedPoint {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { x: clamp(point.x / width), y: clamp(point.y / height) };
}

export function equirectPixelToPano(px: number, py: number, width: number, height: number): PanoPosition {
  return {
    yaw: normalizeYaw((px / width) * TAU - Math.PI),
    pitch: clampPitch(Math.PI / 2 - (py / height) * Math.PI),
  };
}
