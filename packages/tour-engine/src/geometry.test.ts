import { describe, expect, it } from "vitest";
import { exceedsDragThreshold, pointFromClient, slugify, toPercentStyle, viewDeltaForKey } from "./geometry";

describe("slugify", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Baño principal")).toBe("bano-principal");
    expect(slugify("  Ir a: Cocina! ")).toBe("ir-a-cocina");
  });
});

describe("toPercentStyle", () => {
  it("maps normalized points to percentages", () => {
    expect(toPercentStyle({ x: 0.25, y: 0.5 })).toEqual({ left: "25%", top: "50%" });
    expect(toPercentStyle({ x: 0.12345, y: 1 })).toEqual({ left: "12.345%", top: "100%" });
  });
  it("clamps out-of-range values", () => {
    expect(toPercentStyle({ x: -1, y: 2 })).toEqual({ left: "0%", top: "100%" });
  });
});

describe("pointFromClient", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  it("is relative to the rect", () => {
    expect(pointFromClient(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("clamps outside the rect", () => {
    expect(pointFromClient(0, 1000, rect)).toEqual({ x: 0, y: 1 });
  });
  it("returns origin for a degenerate rect", () => {
    expect(pointFromClient(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("exceedsDragThreshold", () => {
  it("separates click from drag", () => {
    expect(exceedsDragThreshold(3, 3, 5)).toBe(false);
    expect(exceedsDragThreshold(4, 4, 5)).toBe(true);
  });
});

describe("viewDeltaForKey", () => {
  it("pans proportionally to fov", () => {
    expect(viewDeltaForKey("ArrowRight", 1)?.yaw).toBeCloseTo(0.1);
    expect(viewDeltaForKey("ArrowDown", 1)?.pitch).toBeCloseTo(-0.1);
  });
  it("zooms with +/-", () => {
    expect(viewDeltaForKey("+", 1)?.fov).toBeLessThan(0);
    expect(viewDeltaForKey("-", 1)?.fov).toBeGreaterThan(0);
  });
  it("ignores other keys", () => {
    expect(viewDeltaForKey("Enter", 1)).toBeNull();
  });
});
