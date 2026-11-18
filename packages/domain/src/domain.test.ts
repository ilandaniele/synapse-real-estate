import { describe, expect, it } from "vitest";
import {
  buildMeshIndex,
  can,
  canMoveJob,
  canRetry,
  canTransition,
  detectFileKind,
  equirectPixelToPano,
  filterUnits,
  formatPrice,
  isLocale,
  localize,
  LOCALES,
  STATUS_LABELS,
  UNIT_STATUSES,
  fromViewBox,
  normalizeYaw,
  reachableSceneIds,
  resolveUnitId,
  toMinorUnits,
  TourHistory,
  validateTourLinks,
  validateUpload,
  type FilterableUnit,
} from "./index";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("money", () => {
  it("converts decimals to minor units without float errors", () => {
    expect(toMinorUnits("895000")).toBe(89_500_000n);
    expect(toMinorUnits("0.1")).toBe(10n);
    expect(toMinorUnits("1234.56")).toBe(123_456n);
  });
  it("rejects invalid amounts", () => {
    expect(() => toMinorUnits("1.234")).toThrow();
    expect(() => toMinorUnits("-5")).toThrow();
  });
  it("formats EUR in es-ES", () => {
    expect(formatPrice("895000", "EUR").replace(/\s/g, " ")).toMatch(/895\.000 €/);
  });
});

describe("availability", () => {
  it("allows commercial transitions", () => {
    expect(canTransition("AVAILABLE", "RESERVED")).toBe(true);
    expect(canTransition("UNLISTED", "SOLD")).toBe(false);
  });

  it("labels every status in every locale", () => {
    for (const locale of LOCALES) {
      for (const status of UNIT_STATUSES) expect(STATUS_LABELS[locale][status]).toBeTruthy();
    }
    expect(STATUS_LABELS.en.SOLD).toBe("Sold");
  });
});

describe("locale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("coordinates", () => {
  it("wraps yaw into [-PI, PI)", () => {
    expect(normalizeYaw(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(normalizeYaw(0.5)).toBeCloseTo(0.5);
  });
  it("maps equirect center to yaw 0 pitch 0", () => {
    const p = equirectPixelToPano(1024, 512, 2048, 1024);
    expect(p.yaw).toBeCloseTo(0);
    expect(p.pitch).toBeCloseTo(0);
  });
  it("normalizes and clamps viewBox points", () => {
    expect(fromViewBox({ x: 500, y: 1200 }, 1000, 1000)).toEqual({ x: 0.5, y: 1 });
  });
});

describe("tour", () => {
  const scenes = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const links = [
    { sceneId: "a", targetSceneId: "b" },
    { sceneId: "b", targetSceneId: "c" },
  ];
  it("validates broken links", () => {
    expect(validateTourLinks(scenes, links)).toEqual([]);
    expect(validateTourLinks(scenes, [{ sceneId: "a", targetSceneId: "z" }])).toHaveLength(1);
  });
  it("computes reachability", () => {
    expect([...reachableSceneIds("a", links)].sort()).toEqual(["a", "b", "c"]);
  });
  it("tracks history", () => {
    const h = new TourHistory("a");
    h.go("b");
    h.go("c");
    expect(h.back()).toBe("b");
    expect(h.back()).toBe("a");
    expect(h.canGoBack).toBe(false);
  });
});

describe("mesh mapping", () => {
  it("resolves unit from nested node", () => {
    const index = buildMeshIndex([{ unitId: "u6", meshNames: ["Villa_06"] }]);
    const parent = { name: "Villa_06", parent: null };
    expect(resolveUnitId({ name: "Villa_06_Roof", parent }, index)).toBe("u6");
    expect(resolveUnitId({ name: "Terrain", parent: null }, index)).toBeNull();
  });
  it("rejects conflicting mappings", () => {
    expect(() =>
      buildMeshIndex([
        { unitId: "a", meshNames: ["X"] },
        { unitId: "b", meshNames: ["X"] },
      ]),
    ).toThrow();
  });
});

describe("files", () => {
  it("detects magic bytes", () => {
    expect(detectFileKind(bytes("glTF\u0002\u0000"))).toBe("glb");
    expect(detectFileKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectFileKind(bytes("AC1032xxxx"))).toBe("dwg");
    expect(detectFileKind(bytes("ISO-10303-21;"))).toBe("ifc");
    expect(detectFileKind(bytes("  0\nSECTION\n"))).toBe("dxf");
    expect(detectFileKind(bytes("hello"))).toBeNull();
  });
  it("rejects disallowed kinds and oversize files", () => {
    expect(validateUpload(bytes("AC1032"), 10, ["glb"]).ok).toBe(false);
    expect(validateUpload(bytes("glTF"), 999 * 1024 * 1024, ["glb"]).ok).toBe(false);
    expect(validateUpload(bytes("glTF"), 1024, ["glb"])).toEqual({ ok: true, kind: "glb" });
  });
});

describe("permissions and jobs", () => {
  it("enforces RBAC", () => {
    expect(can("OWNER", "member:manage")).toBe(true);
    expect(can("OWNER", "integration:manage")).toBe(true);
    expect(can("EDITOR", "integration:manage")).toBe(false);
    expect(can("SALES", "development:publish")).toBe(false);
    expect(can("VIEWER", "lead:read")).toBe(false);
  });
  it("enforces job state machine", () => {
    expect(canMoveJob("PENDING", "PROCESSING")).toBe(true);
    expect(canMoveJob("COMPLETED", "PENDING")).toBe(false);
    expect(canRetry("FAILED", 1)).toBe(true);
    expect(canRetry("FAILED", 3)).toBe(false);
  });
});

describe("filters", () => {
  const base: FilterableUnit = {
    code: "V6",
    name: "Villa 6",
    status: "AVAILABLE",
    price: "895000",
    interiorArea: 240,
    bedrooms: 4,
    bathrooms: 3,
    unitType: "Villa 4D",
    sector: "Norte",
  };
  const units = [base, { ...base, code: "V1", name: "Villa 1", status: "SOLD" as const, price: "650000", bedrooms: 3 }];
  it("filters by status, price and bedrooms", () => {
    expect(filterUnits(units, { statuses: ["AVAILABLE"] }).map((u) => u.code)).toEqual(["V6"]);
    expect(filterUnits(units, { maxPrice: "700000" }).map((u) => u.code)).toEqual(["V1"]);
    expect(filterUnits(units, { minBedrooms: 4, query: "villa" })).toHaveLength(1);
  });
});

describe("localize", () => {
  const room = { name: "Salón", description: "Con chimenea", translations: { en: { name: "Living room", description: "  " } } };

  it("lays non-blank translated fields over the base text", () => {
    expect(localize(room, "en")).toMatchObject({ name: "Living room", description: "Con chimenea" });
  });

  it("keeps the base text for the base locale and for missing translations", () => {
    expect(localize(room, "es")).toBe(room);
    expect(localize({ name: "Cocina", translations: {} }, "en").name).toBe("Cocina");
  });
});
