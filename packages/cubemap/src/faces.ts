/** Cube faces as Marzipano names them: front, back, left, right, up, down. */
export type Face = "f" | "b" | "l" | "r" | "u" | "d";

export const FACES: readonly Face[] = ["f", "b", "l", "r", "u", "d"];

/** Face order inside the vertical preview strip (Marzipano's default `cubeMapPreviewFaceOrder`). */
export const PREVIEW_FACE_ORDER = "bdflru";

/** Rotation of each face from the front face, matching Marzipano's CubeGeometry. */
const ROTATION: Record<Face, { x: number; y: number }> = {
  f: { x: 0, y: 0 },
  b: { x: 0, y: Math.PI },
  l: { x: 0, y: Math.PI / 2 },
  r: { x: 0, y: -Math.PI / 2 },
  u: { x: Math.PI / 2, y: 0 },
  d: { x: -Math.PI / 2, y: 0 },
};

export type Vec3 = [number, number, number];

/**
 * Direction of a point on a face. `x` runs left to right and `y` bottom to top, both in [-0.5, 0.5].
 * Same transform as Marzipano's CubeTile vertices: the point (x, y, -0.5) rotated about X, then about Y.
 */
export function faceDirection(face: Face, x: number, y: number): Vec3 {
  const { x: rx, y: ry } = ROTATION[face];
  const z = -0.5;
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  const z1 = y * Math.sin(rx) + z * Math.cos(rx);
  return [z1 * Math.sin(ry) + x * Math.cos(ry), y1, z1 * Math.cos(ry) - x * Math.sin(ry)];
}

/**
 * Equirectangular texture coordinates of a direction, as Marzipano's equirect shader computes them.
 * `s` runs left to right and `t` top to bottom, both in [0, 1].
 */
export function equirectCoords([x, y, z]: Vec3): { s: number; t: number } {
  const r = Math.hypot(x, y, z);
  return { s: 0.5 + Math.atan2(x, -z) / (2 * Math.PI), t: Math.acos(y / r) / Math.PI };
}
