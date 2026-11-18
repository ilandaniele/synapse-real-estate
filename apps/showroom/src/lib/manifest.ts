import { DevelopmentManifest, type Scene, type Unit } from "@synapse/contracts";
import { localize, type Locale } from "@synapse/domain";
import { MANIFEST_URL } from "./config";

export type ManifestErrorReason = "offline" | "notPublished" | "httpError" | "invalid";

export class ManifestError extends Error {
  constructor(
    readonly reason: ManifestErrorReason,
    readonly status?: number,
  ) {
    super(status ? `${reason} (${status})` : reason);
  }
}

export async function fetchManifest(signal?: AbortSignal): Promise<DevelopmentManifest> {
  let res: Response;
  try {
    res = await fetch(MANIFEST_URL, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ManifestError("offline");
  }
  if (!res.ok) {
    throw res.status === 404 ? new ManifestError("notPublished") : new ManifestError("httpError", res.status);
  }
  const parsed = DevelopmentManifest.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ManifestError("invalid");
  return parsed.data;
}

export function sortUnits(units: readonly Unit[]): Unit[] {
  return [...units].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

export function scenesForUnit(scenes: readonly Scene[], unitId: string): Scene[] {
  return scenes.filter((s) => s.unitId === unitId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function unitHasTour(scenes: readonly Scene[], unitId: string): boolean {
  return scenes.some((s) => s.unitId === unitId);
}

/** The manifest with every translatable text in the visitor's locale, falling back to the base text. */
export function localizeManifest(manifest: DevelopmentManifest, locale: Locale): DevelopmentManifest {
  const all = <T extends Parameters<typeof localize>[0]>(items: readonly T[]) => items.map((item) => localize(item, locale));
  return {
    ...manifest,
    development: localize(manifest.development, locale),
    units: all(manifest.units),
    scenes: manifest.scenes.map((scene) => ({ ...localize(scene, locale), hotspots: all(scene.hotspots) })),
    floorPlans: all(manifest.floorPlans),
    gallery: all(manifest.gallery),
    pointsOfInterest: all(manifest.pointsOfInterest),
  };
}
