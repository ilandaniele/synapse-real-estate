import { DevelopmentManifest, type Unit } from "@synapse/contracts";
import { isPubliclyVisible } from "@synapse/domain";
import { restrictToUnits } from "./manifest";

/**
 * Rebuilds an old snapshot as a new version. Content (texts, media, scenes) comes from the snapshot, but each
 * unit keeps its current commercial data: a sold villa must not reappear as available. Units that were deleted
 * or are no longer publicly visible are dropped, together with everything that references them.
 */
export function restoreManifest(
  snapshot: DevelopmentManifest,
  currentUnits: readonly Unit[],
  version: number,
  publishedAt: string,
): DevelopmentManifest {
  const current = new Map(currentUnits.filter((u) => isPubliclyVisible(u.status)).map((u) => [u.id, u]));
  const units = snapshot.units.flatMap((u) => {
    const now = current.get(u.id);
    return now ? [{ ...u, status: now.status, price: now.price, currency: now.currency }] : [];
  });
  const content = restrictToUnits({ ...snapshot, units }, new Set(units.map((u) => u.id)));
  return DevelopmentManifest.parse({ ...content, version, publishedAt });
}
