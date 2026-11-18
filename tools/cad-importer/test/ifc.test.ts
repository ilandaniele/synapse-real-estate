import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { convertIfcToGlb, inspectGlb, suggestMeshMappings } from "../src";
import { buildIfc } from "./ifc-fixture";

describe("convertIfcToGlb", () => {
  it("creates one root node per building with its elements and suggests unit mappings", async () => {
    const result = await convertIfcToGlb(buildIfc(["Villa_01", "Villa_02"]));

    expect(result.buildings).toEqual(["Villa_01", "Villa_02"]);
    expect(result.elementCount).toBe(2);
    expect(result.triangleCount).toBeGreaterThanOrEqual(24);
    const inspection = inspectGlb(result.glb);
    expect(inspection).toMatchObject({ ok: true, meshCount: 2 });
    if (!inspection.ok) return;
    expect(suggestMeshMappings(inspection.nodeNames)).toEqual([
      { meshName: "Villa_01", unitCode: "V1" },
      { meshName: "Villa_02", unitCode: "V2" },
    ]);
  });

  it("writes real geometry in metres with Y up", async () => {
    const { glb } = await convertIfcToGlb(buildIfc(["Villa_01"]));
    const doc = await new NodeIO().readBinary(glb);
    const position = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute("POSITION")!;
    const min = position.getMin([0, 0, 0]);
    const max = position.getMax([0, 0, 0]);
    expect(max[1]! - min[1]!).toBeCloseTo(6, 3);
    const footprint = [max[0]! - min[0]!, max[2]! - min[2]!];
    expect(Math.max(...footprint)).toBeCloseTo(10, 3);
    expect(Math.min(...footprint)).toBeCloseTo(8, 3);
  });

  it("puts elements outside any building under the Site node", async () => {
    const result = await convertIfcToGlb(buildIfc(["Villa_01"], { orphanBox: true }));
    const inspection = inspectGlb(result.glb);
    expect(result.buildings).toEqual(["Villa_01"]);
    expect(inspection.ok && inspection.nodeNames).toContain("Site");
  });

  it("rejects an IFC without 3D geometry", async () => {
    await expect(convertIfcToGlb(buildIfc([]))).rejects.toThrow("IFC has no 3D geometry");
  });
});
