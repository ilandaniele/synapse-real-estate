import { resolveUnitId, type NamedNode } from "@synapse/domain";

/** Pure helpers (no three.js imports) so they can be unit-tested in a node environment. */

export type Vec3 = readonly [number, number, number];

export interface BoxLike {
  min: Vec3;
  max: Vec3;
}

/** Structural subset of `THREE.Object3D` used for picking. */
export interface ObjectLike {
  name: string;
  parent: ObjectLike | null;
}

export const FADED_OPACITY = 0.35;
export const CLICK_DRAG_THRESHOLD_PX = 5;
/** Scene nodes that never block picking (clicks go through to the villa behind them). */
export const PICK_IGNORED_NODES: readonly string[] = ["Trees"];

export type CameraPreset = "overview" | "top" | "low";

/** Adapts an Object3D-like to the domain `NamedNode` and resolves the owning unit. */
export function resolveUnitFromObject(object: ObjectLike | null, index: ReadonlyMap<string, string>): string | null {
  return resolveUnitId(object as NamedNode | null, index);
}

const hasAncestorNamed = (object: ObjectLike, names: readonly string[]): boolean => {
  for (let node: ObjectLike | null = object; node; node = node.parent) {
    if (names.includes(node.name)) return true;
  }
  return false;
};

/**
 * Walks the ray intersections nearest-first and returns the first unit hit. Ignored nodes
 * (trees) are skipped; any other non-unit surface (terrain, road) occludes the villas behind it.
 */
export function pickUnitFromHits(
  hits: ReadonlyArray<{ object: ObjectLike }>,
  index: ReadonlyMap<string, string>,
  ignored: readonly string[] = PICK_IGNORED_NODES,
): string | null {
  for (const hit of hits) {
    if (hasAncestorNamed(hit.object, ignored)) continue;
    return resolveUnitFromObject(hit.object, index);
  }
  return null;
}

/** True when the pointer travelled further than `threshold` px between down and up (orbit drag). */
export function isDragGesture(deltaPx: number, threshold = CLICK_DRAG_THRESHOLD_PX): boolean {
  return deltaPx > threshold;
}

/** 1 for matching units, `FADED_OPACITY` for units rejected by the filter. */
export function filterOpacity(unitId: string, filterMatch?: (unitId: string) => boolean): number {
  if (!filterMatch) return 1;
  return filterMatch(unitId) ? 1 : FADED_OPACITY;
}

export interface UnitVisualInput {
  selected: boolean;
  hovered: boolean;
  /** Result of `filterOpacity`. */
  filterOpacity: number;
}

export interface UnitVisual {
  /** Status-colored glow on the ground plate. */
  plotGlow: number;
  /** Faint warm lift on the building itself; kept low so it keeps its materials. */
  buildingGlow: number;
  opacity: number;
}

/** Visual state of a villa: the plot carries the highlight, the building only lifts slightly; a selected villa is never faded. */
export function computeUnitVisual(input: UnitVisualInput): UnitVisual {
  return {
    plotGlow: input.selected ? 0.3 : input.hovered ? 0.15 : 0,
    buildingGlow: input.selected ? 0.06 : input.hovered ? 0.03 : 0,
    opacity: input.selected ? 1 : input.filterOpacity,
  };
}

export const boxCenter = (box: BoxLike): Vec3 => [
  (box.min[0] + box.max[0]) / 2,
  (box.min[1] + box.max[1]) / 2,
  (box.min[2] + box.max[2]) / 2,
];

export const boxSize = (box: BoxLike): Vec3 => [
  box.max[0] - box.min[0],
  box.max[1] - box.min[1],
  box.max[2] - box.min[2],
];

/** Fallback label anchor: top center of the bounding box, lifted slightly. */
export function defaultLabelPosition(box: BoxLike, lift = 1.5): Vec3 {
  const c = boxCenter(box);
  return [c[0], box.max[1] + lift, c[2]];
}

/** Unit vector from the orbit target towards the camera. */
export function presetDirection(preset: CameraPreset): Vec3 {
  const [polarDeg, azimuthDeg] = preset === "top" ? [14, 25] : preset === "low" ? [78, 35] : [55, 35];
  const polar = (polarDeg * Math.PI) / 180;
  const azimuth = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)];
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len === 0 ? [0, 1, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

/** Distance at which a bounding sphere around `size` fits the vertical field of view. */
export function framingDistance(size: Vec3, fovDeg: number, padding = 1.15): number {
  const radius = Math.hypot(size[0], size[1], size[2]) / 2;
  const half = (fovDeg * Math.PI) / 360;
  return (radius / Math.sin(half)) * padding;
}

export interface CameraGoal {
  target: Vec3;
  position: Vec3;
  distance: number;
}

export interface CameraGoalInput {
  box: BoxLike;
  fovDeg: number;
  /** Direction from target to camera; normalized internally. */
  direction: Vec3;
  padding?: number;
  minDistance?: number;
}

/** Camera target (box center) and position that frame `box` along `direction`. */
export function computeCameraGoal({ box, fovDeg, direction, padding, minDistance = 0 }: CameraGoalInput): CameraGoal {
  const target = boxCenter(box);
  const distance = Math.max(framingDistance(boxSize(box), fovDeg, padding), minDistance);
  const d = normalizeVec3(direction);
  return {
    target,
    distance,
    position: [target[0] + d[0] * distance, target[1] + d[1] * distance, target[2] + d[2] * distance],
  };
}
