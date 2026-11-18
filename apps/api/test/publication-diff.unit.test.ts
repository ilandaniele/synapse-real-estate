import { describe, expect, it } from "vitest";
import type { DevelopmentManifest } from "@synapse/contracts";
import { diffManifests } from "../src/lib/publication-diff";

const manifest = (overrides: Partial<Record<keyof DevelopmentManifest, unknown>>) =>
  ({
    development: { id: "d", name: "Dev", updatedAt: "2026-01-01T00:00:00.000Z" },
    units: [],
    scenes: [],
    floorPlans: [],
    gallery: [],
    pointsOfInterest: [],
    ...overrides,
  }) as unknown as DevelopmentManifest;

describe("diffManifests", () => {
  it("reports nothing for identical content and ignores timestamps", () => {
    const from = manifest({});
    const to = manifest({ development: { id: "d", name: "Dev", updatedAt: "2026-06-01T00:00:00.000Z" } });
    expect(diffManifests(from, to)).toEqual([]);
  });

  it("reports added, removed and changed entities with labels", () => {
    const from = manifest({ units: [{ id: "u1", code: "V1", name: "Villa 1", price: "100" }, { id: "u2", code: "V2", name: "Villa 2" }] });
    const to = manifest({ units: [{ id: "u1", code: "V1", name: "Villa 1", price: "120" }, { id: "u3", code: "V3", name: "Villa 3" }] });
    expect(diffManifests(from, to)).toEqual([
      { section: "units", id: "u2", label: "Villa 2", kind: "removed", fields: [] },
      { section: "units", id: "u1", label: "Villa 1", kind: "changed", fields: [{ field: "price", before: "100", after: "120" }] },
      { section: "units", id: "u3", label: "Villa 3", kind: "added", fields: [] },
    ]);
  });

  it("labels by title when there is no name and reports new or dropped fields as null", () => {
    const from = manifest({ gallery: [{ id: "g1", title: "Fachada" }] });
    const to = manifest({ gallery: [{ id: "g1", title: "Fachada", caption: "Al atardecer" }] });
    expect(diffManifests(from, to)).toEqual([
      { section: "gallery", id: "g1", label: "Fachada", kind: "changed", fields: [{ field: "caption", before: null, after: "Al atardecer" }] },
    ]);
  });

  it("compares nested values such as hotspots structurally", () => {
    const from = manifest({ scenes: [{ id: "s1", name: "Living", hotspots: [{ id: "h1", yaw: 0 }] }] });
    const to = manifest({ scenes: [{ id: "s1", name: "Living", hotspots: [{ id: "h1", yaw: 1 }] }] });
    expect(diffManifests(from, to)[0]).toMatchObject({ section: "scenes", kind: "changed", fields: [{ field: "hotspots" }] });
  });
});
