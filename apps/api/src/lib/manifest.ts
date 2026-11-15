import { and, asc, eq } from "drizzle-orm";
import { DevelopmentManifest } from "@synapse/contracts";
import { floorPlans, galleryItems, pointsOfInterest, scenes as scenesTable, units, type Db, type schema } from "@synapse/db";
import { isPubliclyVisible } from "@synapse/domain";
import type { Config } from "../config";
import {
  developmentToContract,
  floorPlanToContract,
  galleryToContract,
  iso,
  loadScenes,
  loadUnits,
  poiToContract,
} from "./mappers";

type DevelopmentRow = (typeof schema.developments)["$inferSelect"];

/**
 * Builds the public snapshot from current rows. Only publicly visible units are included, and nothing that
 * references an excluded unit (scenes, floor plans, gallery items, hotspots into those scenes) leaks out.
 * Throws a ZodError if the result does not satisfy the contract.
 */
export async function buildManifest(
  db: Db,
  config: Config,
  development: DevelopmentRow,
  version: number,
  publishedAt: Date,
): Promise<DevelopmentManifest> {
  const orgId = development.organizationId;
  const [allUnits, allScenes, plans, gallery, pois] = await Promise.all([
    loadUnits(db, orgId, eq(units.developmentId, development.id)),
    loadScenes(db, config, orgId, eq(scenesTable.developmentId, development.id)),
    db
      .select()
      .from(floorPlans)
      .where(and(eq(floorPlans.organizationId, orgId), eq(floorPlans.developmentId, development.id)))
      .orderBy(asc(floorPlans.createdAt)),
    db
      .select()
      .from(galleryItems)
      .where(and(eq(galleryItems.organizationId, orgId), eq(galleryItems.developmentId, development.id)))
      .orderBy(asc(galleryItems.sortOrder)),
    db
      .select()
      .from(pointsOfInterest)
      .where(and(eq(pointsOfInterest.organizationId, orgId), eq(pointsOfInterest.developmentId, development.id)))
      .orderBy(asc(pointsOfInterest.name)),
  ]);

  const visibleUnits = allUnits.filter((u) => isPubliclyVisible(u.status));
  const visibleIds = new Set(visibleUnits.map((u) => u.id));
  const allowed = (unitId: string | null) => unitId === null || visibleIds.has(unitId);

  const visibleScenes = allScenes.filter((s) => allowed(s.unitId));
  const sceneIds = new Set(visibleScenes.map((s) => s.id));
  const scenesOut = visibleScenes.map((s) => ({
    ...s,
    hotspots: s.hotspots.filter((h) => h.targetSceneId === null || sceneIds.has(h.targetSceneId)),
  }));

  return DevelopmentManifest.parse({
    version,
    publishedAt: iso(publishedAt),
    development: developmentToContract(config, development),
    units: visibleUnits,
    scenes: scenesOut,
    floorPlans: plans.filter((p) => allowed(p.unitId)).map((p) => floorPlanToContract(config, p)),
    gallery: gallery.filter((g) => allowed(g.unitId)).map((g) => galleryToContract(config, g)),
    pointsOfInterest: pois.map(poiToContract),
  });
}
