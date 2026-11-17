import { and, eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HotspotInput, HotspotPatch, SceneInput, ScenePatch, Uuid } from "@synapse/contracts";
import { panoramaAssets, sceneHotspots, scenes, type Db } from "@synapse/db";
import { audit, changedKeys } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, conflict, isUniqueViolation, notFound } from "../../lib/errors";
import { hotspotToContract, loadScenes } from "../../lib/mappers";
import { assertUnitInDevelopment } from "../../lib/ownership";
import { IdParams } from "../../lib/params";
import { toStoredPath } from "../../lib/storage";
import { findDevelopment } from "./developments";

const HotspotParams = z.object({ id: Uuid, hotspotId: Uuid });

async function findScene(db: Db, organizationId: string, id: string) {
  const [scene] = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.id, id), eq(scenes.organizationId, organizationId)));
  if (!scene) throw notFound("Scene");
  return scene;
}

interface PanoramaFields {
  panoramaAssetId?: string | null;
  panoramaPath?: string;
  previewPath?: string | null;
  thumbnailPath?: string | null;
}

/** Accepts either a processed panorama asset (preferred) or a media URL/path. */
async function resolvePanorama(
  app: FastifyInstance,
  organizationId: string,
  input: { panoramaAssetId?: string | null; panoramaUrl?: string },
): Promise<PanoramaFields> {
  if (input.panoramaAssetId) {
    const [pano] = await app.db
      .select()
      .from(panoramaAssets)
      .where(
        and(
          eq(panoramaAssets.organizationId, organizationId),
          or(eq(panoramaAssets.id, input.panoramaAssetId), eq(panoramaAssets.assetId, input.panoramaAssetId)),
        ),
      );
    if (!pano || !pano.imagePath) throw badRequest("Panorama asset not found or not processed yet");
    return { panoramaAssetId: pano.id, panoramaPath: pano.imagePath, previewPath: pano.previewPath, thumbnailPath: pano.thumbnailPath };
  }
  if (input.panoramaUrl) {
    const stored = toStoredPath(app.config, input.panoramaUrl);
    if (!stored) throw badRequest("panoramaUrl must be an https URL or a path under /media/");
    return { panoramaAssetId: null, panoramaPath: stored, previewPath: null, thumbnailPath: null };
  }
  return {};
}

export default async function sceneRoutes(app: FastifyInstance) {
  app.get("/developments/:id/scenes", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findDevelopment(app, organizationId, id);
    return loadScenes(app.db, app.config, organizationId, eq(scenes.developmentId, id));
  });

  app.get("/scenes/:id", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    const [scene] = await loadScenes(app.db, app.config, organizationId, eq(scenes.id, id));
    if (!scene) throw notFound("Scene");
    return scene;
  });

  app.post("/developments/:id/scenes", { preHandler: app.requireAuth("scene:write") }, async (request, reply) => {
    const actor = session(request);
    const { id: developmentId } = IdParams.parse(request.params);
    const input = SceneInput.parse(request.body);
    await findDevelopment(app, actor.organizationId, developmentId);
    await assertUnitInDevelopment(app.db, actor.organizationId, developmentId, input.unitId);
    const pano = await resolvePanorama(app, actor.organizationId, input);
    if (!pano.panoramaPath) throw badRequest("panoramaAssetId or panoramaUrl is required");
    try {
      const created = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(scenes)
          .values({
            organizationId: actor.organizationId,
            developmentId,
            unitId: input.unitId,
            slug: input.slug,
            name: input.name,
            sortOrder: input.sortOrder,
            panoramaAssetId: pano.panoramaAssetId ?? null,
            panoramaPath: pano.panoramaPath!,
            previewPath: pano.previewPath ?? null,
            thumbnailPath: pano.thumbnailPath ?? null,
            ...(input.initialView ? { initialYaw: input.initialView.yaw, initialPitch: input.initialView.pitch, initialFov: input.initialView.fov } : {}),
            floorPlanX: input.floorPlanPoint?.x ?? null,
            floorPlanY: input.floorPlanPoint?.y ?? null,
          })
          .returning({ id: scenes.id });
        await audit(tx, actor, "scene.create", "scene", row!.id, { slug: input.slug });
        return row!;
      });
      const [scene] = await loadScenes(app.db, app.config, actor.organizationId, eq(scenes.id, created.id));
      return reply.status(201).send(scene);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(`Scene slug "${input.slug}" is already in use in this development`);
      throw error;
    }
  });

  app.patch("/scenes/:id", { preHandler: app.requireAuth("scene:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const patch = ScenePatch.parse(request.body);
    const current = await findScene(app.db, actor.organizationId, id);
    if (patch.unitId !== undefined) await assertUnitInDevelopment(app.db, actor.organizationId, current.developmentId, patch.unitId);
    const pano = await resolvePanorama(app, actor.organizationId, patch);

    const set: Partial<typeof scenes.$inferInsert> = { ...pano };
    if (patch.unitId !== undefined) set.unitId = patch.unitId;
    if (patch.slug !== undefined) set.slug = patch.slug;
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
    if (patch.initialView) Object.assign(set, { initialYaw: patch.initialView.yaw, initialPitch: patch.initialView.pitch, initialFov: patch.initialView.fov });
    if (patch.floorPlanPoint !== undefined) {
      set.floorPlanX = patch.floorPlanPoint?.x ?? null;
      set.floorPlanY = patch.floorPlanPoint?.y ?? null;
    }
    try {
      await app.db.transaction(async (tx) => {
        if (Object.keys(set).length > 0) {
          await tx.update(scenes).set(set).where(and(eq(scenes.id, id), eq(scenes.organizationId, actor.organizationId)));
        }
        await audit(tx, actor, "scene.update", "scene", id, { fields: changedKeys(patch) });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Scene slug is already in use in this development");
      throw error;
    }
    const [scene] = await loadScenes(app.db, app.config, actor.organizationId, eq(scenes.id, id));
    return scene;
  });

  app.delete("/scenes/:id", { preHandler: app.requireAuth("scene:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const current = await findScene(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await tx.delete(scenes).where(and(eq(scenes.id, id), eq(scenes.organizationId, actor.organizationId)));
      await audit(tx, actor, "scene.delete", "scene", id, { slug: current.slug });
    });
    return reply.status(204).send();
  });

  // ------------------------------------------------------------ hotspots

  async function assertHotspotTarget(organizationId: string, scene: typeof scenes.$inferSelect, targetSceneId: string | null | undefined) {
    if (!targetSceneId) return;
    if (targetSceneId === scene.id) throw badRequest("A hotspot cannot link to its own scene");
    const [target] = await app.db
      .select({ id: scenes.id })
      .from(scenes)
      .where(and(eq(scenes.id, targetSceneId), eq(scenes.organizationId, organizationId), eq(scenes.developmentId, scene.developmentId)));
    if (!target) throw badRequest("targetSceneId does not belong to the same development");
  }

  app.get("/scenes/:id/hotspots", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findScene(app.db, organizationId, id);
    const rows = await app.db
      .select()
      .from(sceneHotspots)
      .where(and(eq(sceneHotspots.sceneId, id), eq(sceneHotspots.organizationId, organizationId)))
      .orderBy(sceneHotspots.createdAt);
    return rows.map(hotspotToContract);
  });

  app.post("/scenes/:id/hotspots", { preHandler: app.requireAuth("scene:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const input = HotspotInput.parse(request.body);
    const scene = await findScene(app.db, actor.organizationId, id);
    if (input.type === "NAVIGATION" && !input.targetSceneId) throw badRequest("NAVIGATION hotspots require targetSceneId");
    await assertHotspotTarget(actor.organizationId, scene, input.targetSceneId);
    const row = await app.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(sceneHotspots)
        .values({ ...input, description: input.description ?? null, organizationId: actor.organizationId, sceneId: id })
        .returning();
      await audit(tx, actor, "hotspot.create", "hotspot", created!.id, { sceneId: id, type: input.type });
      return created!;
    });
    return reply.status(201).send(hotspotToContract(row));
  });

  app.patch("/scenes/:id/hotspots/:hotspotId", { preHandler: app.requireAuth("scene:write") }, async (request) => {
    const actor = session(request);
    const { id, hotspotId } = HotspotParams.parse(request.params);
    const patch = HotspotPatch.parse(request.body);
    const scene = await findScene(app.db, actor.organizationId, id);
    const [current] = await app.db
      .select()
      .from(sceneHotspots)
      .where(and(eq(sceneHotspots.id, hotspotId), eq(sceneHotspots.sceneId, id), eq(sceneHotspots.organizationId, actor.organizationId)));
    if (!current) throw notFound("Hotspot");
    const type = patch.type ?? current.type;
    const target = patch.targetSceneId === undefined ? current.targetSceneId : patch.targetSceneId;
    if (type === "NAVIGATION" && !target) throw badRequest("NAVIGATION hotspots require targetSceneId");
    await assertHotspotTarget(actor.organizationId, scene, patch.targetSceneId);
    const row = await app.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(sceneHotspots)
        .set({ ...patch, description: patch.description === undefined ? undefined : patch.description })
        .where(and(eq(sceneHotspots.id, hotspotId), eq(sceneHotspots.organizationId, actor.organizationId)))
        .returning();
      await audit(tx, actor, "hotspot.update", "hotspot", hotspotId, { sceneId: id, fields: changedKeys(patch) });
      return updated!;
    });
    return hotspotToContract(row);
  });

  app.delete("/scenes/:id/hotspots/:hotspotId", { preHandler: app.requireAuth("scene:write") }, async (request, reply) => {
    const actor = session(request);
    const { id, hotspotId } = HotspotParams.parse(request.params);
    await findScene(app.db, actor.organizationId, id);
    const deleted = await app.db.transaction(async (tx) => {
      const rows = await tx
        .delete(sceneHotspots)
        .where(and(eq(sceneHotspots.id, hotspotId), eq(sceneHotspots.sceneId, id), eq(sceneHotspots.organizationId, actor.organizationId)))
        .returning({ id: sceneHotspots.id });
      if (rows.length > 0) await audit(tx, actor, "hotspot.delete", "hotspot", hotspotId, { sceneId: id });
      return rows.length;
    });
    if (!deleted) throw notFound("Hotspot");
    return reply.status(204).send();
  });
}
