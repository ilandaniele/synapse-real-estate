import { describe, expect, it } from "vitest";
import { inspectDxf, inspectGlb, suggestMeshMappings, unsupportedFormatMessage } from "../src";

/** Builds a minimal JSON-only GLB (valid container, no binary chunk). */
export function buildGlb(nodeNames: string[]): Uint8Array {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: nodeNames.map((_, i) => i) }],
    nodes: nodeNames.map((name) => ({ name })),
  });
  const padded = json + " ".repeat((4 - (json.length % 4)) % 4);
  const body = new TextEncoder().encode(padded);
  const out = new Uint8Array(20 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

describe("inspectGlb", () => {
  it("extracts node names", () => {
    const result = inspectGlb(buildGlb(["Terrain", "Villa_01", "Villa_01_Body"]));
    expect(result).toMatchObject({ ok: true, nodeNames: ["Terrain", "Villa_01", "Villa_01_Body"], sceneCount: 1 });
  });

  it("rejects garbage, truncated and wrong-version files", () => {
    expect(inspectGlb(new Uint8Array(40)).ok).toBe(false);
    expect(inspectGlb(new Uint8Array([1, 2, 3])).ok).toBe(false);
    const glb = buildGlb(["A"]);
    expect(inspectGlb(glb.subarray(0, glb.length - 6))).toMatchObject({ ok: false });
    new DataView(glb.buffer).setUint32(4, 1, true);
    expect(inspectGlb(glb)).toMatchObject({ ok: false, error: expect.stringContaining("version") });
  });
});

describe("suggestMeshMappings", () => {
  it("maps Villa_NN root nodes to V<N> and ignores children and other nodes", () => {
    const out = suggestMeshMappings(["Terrain", "Villa_02", "Villa_01", "Villa_01_Body", "Road", "Villa_10", "Villa_02"]);
    expect(out).toEqual([
      { meshName: "Villa_01", unitCode: "V1" },
      { meshName: "Villa_02", unitCode: "V2" },
      { meshName: "Villa_10", unitCode: "V10" },
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(suggestMeshMappings(["Cube", "Villa_Body"])).toEqual([]);
  });
});

describe("unsupportedFormatMessage", () => {
  it("is explicit about the format and the way forward", () => {
    expect(unsupportedFormatMessage("dwg")).toBe(
      "Format DWG not supported by the automatic pipeline. Export to GLB/glTF from your CAD/BIM tool (e.g. Blender, Revit + exporter) and upload again.",
    );
  });
});

const DXF = [
  "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER",
  "0", "LAYER", "2", "WALLS", "0", "LAYER", "2", "DOORS", "0", "ENDTAB", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "WALLS", "10", "0.0", "20", "0.0", "11", "10.0", "21", "0.0",
  "0", "LINE", "8", "WALLS", "10", "10.0", "20", "0.0", "11", "10.0", "21", "5.5",
  "0", "LWPOLYLINE", "8", "DOORS", "90", "2", "10", "-2.0", "20", "1.0", "10", "3.0", "20", "8.0",
  "0", "CIRCLE", "8", "MISC", "10", "1", "20", "1", "40", "2",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

describe("inspectDxf", () => {
  it("counts entities, lists layers and computes extents", () => {
    const result = inspectDxf(DXF);
    expect(result.entityCounts).toEqual({ LINE: 2, LWPOLYLINE: 1, other: 1 });
    expect(result.layers).toEqual(["DOORS", "MISC", "WALLS"]);
    expect(result.extents).toEqual({ minX: -2, minY: 0, maxX: 10, maxY: 8 });
    expect(result.note).toContain("reference only");
  });

  it("handles empty input", () => {
    expect(inspectDxf("").extents).toBeNull();
  });
});
