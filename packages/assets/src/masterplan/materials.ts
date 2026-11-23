import type { Document, Material } from "@gltf-transform/core";

interface MaterialSpec {
  rgb: [number, number, number];
  roughness: number;
  metallic?: number;
}

/** Shared PBR palette (linear base colors). Vertex-colored materials use white so COLOR_0 drives the hue. */
const SPECS = {
  Render_White: { rgb: [0.86, 0.85, 0.82], roughness: 0.85 },
  Render_Cream: { rgb: [0.83, 0.74, 0.6], roughness: 0.9 },
  Wood_Cladding: { rgb: [0.36, 0.2, 0.1], roughness: 0.65 },
  Stone_Limestone: { rgb: [0.62, 0.55, 0.44], roughness: 0.92 },
  Zinc_Dark: { rgb: [0.12, 0.13, 0.14], roughness: 0.45, metallic: 0.6 },
  Glass_Tinted: { rgb: [0.05, 0.08, 0.1], roughness: 0.03, metallic: 0.6 },
  Window_Frame: { rgb: [0.05, 0.05, 0.055], roughness: 0.4, metallic: 0.5 },
  Roof_Dark: { rgb: [0.14, 0.15, 0.16], roughness: 0.7 },
  Roof_Terracotta: { rgb: [0.5, 0.17, 0.08], roughness: 0.8 },
  Roof_Sedum: { rgb: [0.24, 0.32, 0.12], roughness: 0.95 },
  Roof_Gravel: { rgb: [0.55, 0.53, 0.5], roughness: 0.95 },
  Pool_Water: { rgb: [0.02, 0.32, 0.45], roughness: 0.05, metallic: 0.1 },
  Pool_Coping: { rgb: [0.8, 0.77, 0.7], roughness: 0.8 },
  Deck_Teak: { rgb: [0.42, 0.26, 0.14], roughness: 0.75 },
  Paving_Stone: { rgb: [0.6, 0.57, 0.52], roughness: 0.9 },
  Lawn: { rgb: [0.16, 0.34, 0.08], roughness: 1 },
  Hedge: { rgb: [0.06, 0.2, 0.05], roughness: 0.95 },
  Fabric_Canvas: { rgb: [0.85, 0.83, 0.78], roughness: 0.9 },
  Car_Paint: { rgb: [1, 1, 1], roughness: 0.3, metallic: 0.5 },
  Rubber: { rgb: [0.02, 0.02, 0.02], roughness: 0.9 },
  Metal_Steel: { rgb: [0.3, 0.31, 0.33], roughness: 0.45, metallic: 0.8 },
  Lamp_Glow: { rgb: [1, 0.86, 0.6], roughness: 0.5 },
  Terrain_Grass: { rgb: [1, 1, 1], roughness: 0.95 },
  Terrain_Soil: { rgb: [0.36, 0.25, 0.16], roughness: 1 },
  Road_Asphalt: { rgb: [0.12, 0.12, 0.13], roughness: 0.9 },
  Road_Curb: { rgb: [0.66, 0.64, 0.6], roughness: 0.9 },
  Road_Marking: { rgb: [0.9, 0.9, 0.86], roughness: 0.7 },
  Tree_Trunk: { rgb: [0.28, 0.2, 0.14], roughness: 0.95 },
  Tree_Foliage: { rgb: [1, 1, 1], roughness: 0.9 },
} satisfies Record<string, MaterialSpec>;

export type MaterialName = keyof typeof SPECS;
export type Palette = Record<MaterialName, Material>;

export function createPalette(doc: Document): Palette {
  const entries = Object.entries(SPECS) as Array<[MaterialName, MaterialSpec]>;
  return Object.fromEntries(
    entries.map(([name, spec]) => {
      const material = doc
        .createMaterial(name)
        .setBaseColorFactor([...spec.rgb, 1])
        .setRoughnessFactor(spec.roughness)
        .setMetallicFactor(spec.metallic ?? 0);
      if (name === "Lamp_Glow") material.setEmissiveFactor([1, 0.8, 0.5]);
      return [name, material];
    }),
  ) as Palette;
}
