import { describe, expect, it } from "vitest";
import type { DevelopmentManifest } from "@synapse/contracts";
import { localizeManifest } from "./manifest";

const manifest = {
  version: 1,
  development: { name: "Lomas", tagline: "Villas junto al mar", translations: { en: { tagline: "Villas by the sea" } } },
  units: [{ name: "Villa Uno", description: "Luminosa", translations: { en: { name: "Villa One", description: "" } } }],
  scenes: [
    {
      name: "Salón",
      translations: { en: { name: "Living room" } },
      hotspots: [{ label: "Cocina", translations: { en: { label: "Kitchen" } } }],
    },
  ],
  floorPlans: [{ name: "Planta baja", translations: {} }],
  gallery: [{ title: "Piscina", translations: { en: { title: "Pool" } } }],
  pointsOfInterest: [{ name: "Playa", distanceText: "5 min a pie", translations: { en: { name: "Beach" } } }],
} as unknown as DevelopmentManifest;

describe("localizeManifest", () => {
  it("overlays the English text on every entity, nested hotspots included", () => {
    const en = localizeManifest(manifest, "en");
    expect(en.development.tagline).toBe("Villas by the sea");
    expect(en.units[0]).toMatchObject({ name: "Villa One", description: "Luminosa" });
    expect(en.scenes[0]).toMatchObject({ name: "Living room", hotspots: [{ label: "Kitchen" }] });
    expect(en.floorPlans[0]?.name).toBe("Planta baja");
    expect(en.gallery[0]?.title).toBe("Pool");
    expect(en.pointsOfInterest[0]).toMatchObject({ name: "Beach", distanceText: "5 min a pie" });
  });

  it("keeps the Spanish base text for the default locale", () => {
    const es = localizeManifest(manifest, "es");
    expect(es.units[0]?.name).toBe("Villa Uno");
    expect(es.scenes[0]?.hotspots[0]?.label).toBe("Cocina");
  });
});
