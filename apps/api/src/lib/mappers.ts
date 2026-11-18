import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import type { Asset, Development, FloorPlan, GalleryItem, Hotspot, Job, Lead, PointOfInterest, Reservation, Scene, Unit } from "@synapse/contracts";
import {
  sceneHotspots,
  scenes,
  unitMeshMappings,
  unitTypes,
  units,
  type Db,
  type JobRow,
  type schema,
} from "@synapse/db";
import type { JobKind } from "@synapse/domain";
import type { Config } from "../config";
import { mediaUrl } from "./storage";

type Row<T extends keyof typeof schema> = (typeof schema)[T] extends { $inferSelect: infer R } ? R : never;

export const iso = (d: Date) => d.toISOString();

export function developmentToContract(config: Config, d: Row<"developments">): Development {
  return {
    id: d.id,
    organizationId: d.organizationId,
    slug: d.slug,
    name: d.name,
    tagline: d.tagline,
    description: d.description,
    city: d.city,
    country: d.country,
    lat: d.lat,
    lng: d.lng,
    heroImageUrl: mediaUrl(config, d.heroImagePath),
    modelUrl: mediaUrl(config, d.modelPath),
    currency: d.currency,
    updatedAt: iso(d.updatedAt),
  };
}

export function unitToContract(u: Row<"units">, unitType: string | null, meshNames: string[]): Unit {
  return {
    id: u.id,
    developmentId: u.developmentId,
    code: u.code,
    name: u.name,
    slug: u.slug,
    status: u.status,
    price: u.price,
    currency: u.currency,
    interiorArea: u.interiorArea,
    plotArea: u.plotArea,
    terraceArea: u.terraceArea,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    floors: u.floors,
    unitType: unitType ?? "",
    sector: u.sector,
    orientation: u.orientation,
    description: u.description,
    meshNames,
    labelPosition: u.labelPosition ?? null,
    updatedAt: iso(u.updatedAt),
  };
}

/** Two queries total (units+type join, mesh mappings), regardless of how many units match. */
export async function loadUnits(db: Db, organizationId: string, where?: SQL): Promise<Unit[]> {
  const rows = await db
    .select({ unit: units, unitType: unitTypes.name })
    .from(units)
    .leftJoin(unitTypes, eq(units.unitTypeId, unitTypes.id))
    .where(and(eq(units.organizationId, organizationId), where))
    .orderBy(asc(units.createdAt), asc(units.code));
  if (rows.length === 0) return [];
  const meshes = await db
    .select({ unitId: unitMeshMappings.unitId, meshName: unitMeshMappings.meshName })
    .from(unitMeshMappings)
    .where(
      and(
        eq(unitMeshMappings.organizationId, organizationId),
        inArray(unitMeshMappings.unitId, rows.map((r) => r.unit.id)),
      ),
    )
    .orderBy(asc(unitMeshMappings.meshName));
  const byUnit = new Map<string, string[]>();
  for (const m of meshes) byUnit.set(m.unitId, [...(byUnit.get(m.unitId) ?? []), m.meshName]);
  return rows.map((r) => unitToContract(r.unit, r.unitType, byUnit.get(r.unit.id) ?? []));
}

export function hotspotToContract(h: Row<"sceneHotspots">): Hotspot {
  return {
    id: h.id,
    sceneId: h.sceneId,
    type: h.type,
    label: h.label,
    yaw: h.yaw,
    pitch: h.pitch,
    targetSceneId: h.targetSceneId,
    description: h.description,
  };
}

export function sceneToContract(config: Config, s: Row<"scenes">, hotspots: Hotspot[]): Scene {
  return {
    id: s.id,
    unitId: s.unitId,
    developmentId: s.developmentId,
    slug: s.slug,
    name: s.name,
    sortOrder: s.sortOrder,
    panoramaUrl: mediaUrl(config, s.panoramaPath),
    previewUrl: mediaUrl(config, s.previewPath),
    thumbnailUrl: mediaUrl(config, s.thumbnailPath),
    cubeMap: s.tiles ? { baseUrl: mediaUrl(config, s.tiles.path), tileSize: s.tiles.tileSize, faceSizes: s.tiles.faceSizes } : null,
    initialView: { yaw: s.initialYaw, pitch: s.initialPitch, fov: s.initialFov },
    floorPlanPoint: s.floorPlanX !== null && s.floorPlanY !== null ? { x: s.floorPlanX, y: s.floorPlanY } : null,
    hotspots,
  };
}

/** Two queries: scenes, then ALL their hotspots in one go (no per-scene lookups). */
export async function loadScenes(db: Db, config: Config, organizationId: string, where: SQL | undefined): Promise<Scene[]> {
  const sceneRows = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.organizationId, organizationId), where))
    .orderBy(asc(scenes.sortOrder), asc(scenes.name));
  if (sceneRows.length === 0) return [];
  const hotspotRows = await db
    .select()
    .from(sceneHotspots)
    .where(
      and(
        eq(sceneHotspots.organizationId, organizationId),
        inArray(sceneHotspots.sceneId, sceneRows.map((s) => s.id)),
      ),
    )
    .orderBy(asc(sceneHotspots.createdAt));
  const bySceneId = new Map<string, Hotspot[]>();
  for (const h of hotspotRows) bySceneId.set(h.sceneId, [...(bySceneId.get(h.sceneId) ?? []), hotspotToContract(h)]);
  return sceneRows.map((s) => sceneToContract(config, s, bySceneId.get(s.id) ?? []));
}

export function floorPlanToContract(config: Config, f: Row<"floorPlans">): FloorPlan {
  return { id: f.id, unitId: f.unitId, name: f.name, imageUrl: mediaUrl(config, f.imagePath), width: f.width, height: f.height };
}

export function galleryToContract(config: Config, g: Row<"galleryItems">): GalleryItem {
  return { id: g.id, unitId: g.unitId, title: g.title, imageUrl: mediaUrl(config, g.imagePath), credit: g.credit, sortOrder: g.sortOrder };
}

export function poiToContract(p: Row<"pointsOfInterest">): PointOfInterest {
  return { id: p.id, name: p.name, category: p.category, lat: p.lat, lng: p.lng, distanceText: p.distanceText };
}

export function assetToContract(a: Row<"assets">): Asset {
  return {
    id: a.id,
    filename: a.filename,
    kind: a.kind,
    size: a.size,
    status: a.status,
    url: null, // raw uploads are never public; processed outputs are exposed through panoramas/scenes
    rejectionReason: a.rejectionReason,
    createdAt: iso(a.createdAt),
  };
}

export function jobToContract(kind: JobKind, j: JobRow): Job & { developmentId: string | null } {
  return {
    id: j.id,
    kind,
    status: j.status,
    assetId: j.assetId,
    developmentId: j.developmentId,
    attempts: j.attempts,
    error: j.error,
    result: j.result ?? null,
    logs: j.logs,
    createdAt: iso(j.createdAt),
    updatedAt: iso(j.updatedAt),
  };
}

export function reservationToContract(r: Row<"reservations">, unitCode: string): Reservation {
  return {
    id: r.id,
    developmentId: r.developmentId,
    unitId: r.unitId,
    unitCode,
    name: r.name,
    email: r.email,
    phone: r.phone,
    depositAmount: r.depositAmount,
    currency: r.currency,
    status: r.status,
    paymentProvider: r.paymentProvider,
    paymentRef: r.paymentRef,
    paidAt: r.paidAt ? iso(r.paidAt) : null,
    createdAt: iso(r.createdAt),
  };
}

export function leadToContract(l: Row<"leads">, unitCode: string | null): Lead {
  return {
    id: l.id,
    developmentId: l.developmentId,
    unitId: l.unitId,
    unitCode,
    name: l.name,
    email: l.email,
    phone: l.phone,
    message: l.message,
    source: l.source,
    createdAt: iso(l.createdAt),
  };
}

