import { describe, expect, it } from "vitest";
import { buildMeshIndex } from "@synapse/domain";
import {
  FADED_OPACITY,
  boxCenter,
  computeCameraGoal,
  computeUnitVisual,
  defaultLabelPosition,
  filterOpacity,
  framingDistance,
  isDragGesture,
  pickUnitFromHits,
  presetDirection,
  resolveUnitFromObject,
  type ObjectLike,
} from "./helpers";

const node = (name: string, parent: ObjectLike | null = null): ObjectLike => ({ name, parent });
const index = buildMeshIndex([
  { unitId: "u1", meshNames: ["Villa_01"] },
  { unitId: "u2", meshNames: ["Villa_02"] },
]);

describe("resolveUnitFromObject", () => {
  it("walks up parents to the mapped villa group", () => {
    const villa = node("Villa_01", node("Scene"));
    expect(resolveUnitFromObject(node("Villa_01_Roof", villa), index)).toBe("u1");
  });
  it("returns null for unmapped objects and null input", () => {
    expect(resolveUnitFromObject(node("Terrain", node("Scene")), index)).toBeNull();
    expect(resolveUnitFromObject(null, index)).toBeNull();
  });
});

describe("pickUnitFromHits", () => {
  const roof = node("Villa_02_Roof", node("Villa_02"));
  const tree = node("Tree_3", node("Trees"));
  const terrain = node("Terrain");

  it("skips trees and picks the villa behind them", () => {
    expect(pickUnitFromHits([{ object: tree }, { object: roof }], index)).toBe("u2");
  });
  it("lets terrain occlude villas", () => {
    expect(pickUnitFromHits([{ object: terrain }, { object: roof }], index)).toBeNull();
  });
  it("returns null with no hits", () => {
    expect(pickUnitFromHits([], index)).toBeNull();
  });
});

describe("isDragGesture", () => {
  it("treats <=5px as a click", () => {
    expect(isDragGesture(5)).toBe(false);
    expect(isDragGesture(5.1)).toBe(true);
  });
});

describe("filterOpacity", () => {
  it("is 1 without a filter or on match, 0.35 otherwise", () => {
    expect(filterOpacity("u1")).toBe(1);
    expect(filterOpacity("u1", (id) => id === "u1")).toBe(1);
    expect(filterOpacity("u2", (id) => id === "u1")).toBe(FADED_OPACITY);
  });
});

describe("computeUnitVisual", () => {
  it("orders glow selected > hovered > none", () => {
    const sel = computeUnitVisual({ selected: true, hovered: false, filterOpacity: 1 });
    const hov = computeUnitVisual({ selected: false, hovered: true, filterOpacity: 1 });
    const none = computeUnitVisual({ selected: false, hovered: false, filterOpacity: 1 });
    expect(sel.emissiveIntensity).toBeGreaterThan(hov.emissiveIntensity);
    expect(hov.emissiveIntensity).toBeGreaterThan(none.emissiveIntensity);
  });
  it("fades filtered-out units but never the selected one", () => {
    expect(computeUnitVisual({ selected: false, hovered: false, filterOpacity: FADED_OPACITY }).opacity).toBe(FADED_OPACITY);
    expect(computeUnitVisual({ selected: true, hovered: false, filterOpacity: FADED_OPACITY }).opacity).toBe(1);
  });
});

describe("camera helpers", () => {
  const box = { min: [0, 0, 0], max: [10, 4, 20] } as const;

  it("computes box center and label anchor", () => {
    expect(boxCenter(box)).toEqual([5, 2, 10]);
    expect(defaultLabelPosition(box, 1)).toEqual([5, 5, 10]);
  });

  it("frames a bigger box from further away", () => {
    const near = framingDistance([10, 4, 10], 45);
    const far = framingDistance([100, 40, 100], 45);
    expect(far).toBeGreaterThan(near * 5);
  });

  it("places the camera at `distance` along the direction from the box center", () => {
    const goal = computeCameraGoal({ box, fovDeg: 45, direction: [0, 2, 0] });
    expect(goal.target).toEqual([5, 2, 10]);
    expect(goal.position[0]).toBeCloseTo(5);
    expect(goal.position[2]).toBeCloseTo(10);
    expect(goal.position[1]).toBeCloseTo(2 + goal.distance);
  });

  it("honours minDistance", () => {
    const goal = computeCameraGoal({ box, fovDeg: 45, direction: [1, 1, 1], minDistance: 500 });
    expect(goal.distance).toBe(500);
  });

  it("preset directions are unit vectors above the ground", () => {
    for (const preset of ["overview", "top", "low"] as const) {
      const d = presetDirection(preset);
      expect(Math.hypot(...d)).toBeCloseTo(1);
      expect(d[1]).toBeGreaterThan(0);
    }
  });
});
