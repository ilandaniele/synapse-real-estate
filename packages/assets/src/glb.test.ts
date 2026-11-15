import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { buildMasterplanGlb } from "./glb";
import { buildManifest } from "./manifest";
import { PANORAMAS } from "./scenes/index";

describe("masterplan GLB", () => {
  it("contains 8 villa groups with Body/Roof/Pool/Plot children", async () => {
    const model = await buildMasterplanGlb();
    expect(model.glb.byteLength).toBeLessThan(2 * 1024 * 1024);

    const doc = await new NodeIO().readBinary(model.glb);
    const nodes = doc.getRoot().listNodes();
    const byName = new Map(nodes.map((n) => [n.getName(), n]));

    for (let i = 1; i <= 8; i++) {
      const name = `Villa_${String(i).padStart(2, "0")}`;
      const group = byName.get(name);
      expect(group, name).toBeDefined();
      const children = (group?.listChildren() ?? []).map((c) => c.getName()).sort();
      expect(children).toEqual([`${name}_Body`, `${name}_Plot`, `${name}_Pool`, `${name}_Roof`]);
    }
    for (const name of ["Terrain", "Road", "Trees"]) expect(byName.has(name), name).toBe(true);
    expect(model.units).toHaveLength(8);
    expect(model.units[0]).toMatchObject({ code: "V1", node: "Villa_01" });
    for (const n of model.nodes) expect(byName.has(n), n).toBe(true);
  });
});

describe("manifest", () => {
  it("hotspot targets reference existing panorama slugs", () => {
    const manifest = buildManifest({ nodes: [], units: [] }, "2026-01-01T00:00:00.000Z");
    const slugs = new Set(manifest.panoramas.map((p) => p.slug));
    expect(slugs.size).toBe(PANORAMAS.length);
    for (const p of manifest.panoramas) {
      for (const h of p.hotspots) {
        if (h.targetSlug !== null) expect(slugs.has(h.targetSlug), `${p.slug} -> ${h.targetSlug}`).toBe(true);
        else expect(h.type).toBe("INFO");
        expect(Number.isFinite(h.yaw) && Number.isFinite(h.pitch)).toBe(true);
      }
    }
  });

  it("navigation links are reciprocal", () => {
    const manifest = buildManifest({ nodes: [], units: [] }, "2026-01-01T00:00:00.000Z");
    const links = new Set(manifest.panoramas.flatMap((p) => p.hotspots.filter((h) => h.targetSlug).map((h) => `${p.slug}>${h.targetSlug}`)));
    for (const l of links) {
      const [a, b] = l.split(">");
      expect(links.has(`${b}>${a}`), l).toBe(true);
    }
  });
});
