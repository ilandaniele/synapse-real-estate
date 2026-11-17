import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { GalleryItemInput, GalleryItemPatch } from "@synapse/contracts";
import { galleryItems, type Db } from "@synapse/db";
import { audit, changedKeys } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, notFound } from "../../lib/errors";
import { resolveImage } from "../../lib/images";
import { galleryToContract } from "../../lib/mappers";
import { assertUnitInDevelopment } from "../../lib/ownership";
import { IdParams } from "../../lib/params";
import { findDevelopment } from "./developments";

async function findGalleryItem(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(galleryItems)
    .where(and(eq(galleryItems.id, id), eq(galleryItems.organizationId, organizationId)));
  if (!row) throw notFound("Gallery item");
  return row;
}

export default async function galleryRoutes(app: FastifyInstance) {
  app.get("/developments/:id/gallery", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findDevelopment(app, organizationId, id);
    const rows = await app.db
      .select()
      .from(galleryItems)
      .where(and(eq(galleryItems.developmentId, id), eq(galleryItems.organizationId, organizationId)))
      .orderBy(asc(galleryItems.sortOrder));
    return rows.map((g) => galleryToContract(app.config, g));
  });

  app.post("/developments/:id/gallery", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id: developmentId } = IdParams.parse(request.params);
    const { imageAssetId, imageUrl, ...fields } = GalleryItemInput.parse(request.body);
    await findDevelopment(app, actor.organizationId, developmentId);
    await assertUnitInDevelopment(app.db, actor.organizationId, developmentId, fields.unitId);
    const imagePath = await resolveImage(app, actor.organizationId, { imageAssetId, imageUrl });
    if (!imagePath) throw badRequest("imageAssetId or imageUrl is required");
    const row = await app.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(galleryItems)
        .values({ ...fields, imagePath, organizationId: actor.organizationId, developmentId })
        .returning();
      await audit(tx, actor, "gallery.create", "gallery_item", created!.id, { developmentId });
      return created!;
    });
    return reply.status(201).send(galleryToContract(app.config, row));
  });

  app.patch("/gallery/:id", { preHandler: app.requireAuth("development:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const { imageAssetId, imageUrl, ...fields } = GalleryItemPatch.parse(request.body);
    const current = await findGalleryItem(app.db, actor.organizationId, id);
    await assertUnitInDevelopment(app.db, actor.organizationId, current.developmentId, fields.unitId);
    const imagePath = await resolveImage(app, actor.organizationId, { imageAssetId, imageUrl });
    const set = { ...fields, ...(imagePath ? { imagePath } : {}) };
    const row = await app.db.transaction(async (tx) => {
      const [updated] =
        Object.keys(set).length > 0
          ? await tx
              .update(galleryItems)
              .set(set)
              .where(and(eq(galleryItems.id, id), eq(galleryItems.organizationId, actor.organizationId)))
              .returning()
          : [current];
      await audit(tx, actor, "gallery.update", "gallery_item", id, { fields: changedKeys(set) });
      return updated!;
    });
    return galleryToContract(app.config, row);
  });

  app.delete("/gallery/:id", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const current = await findGalleryItem(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await tx.delete(galleryItems).where(and(eq(galleryItems.id, id), eq(galleryItems.organizationId, actor.organizationId)));
      await audit(tx, actor, "gallery.delete", "gallery_item", id, { developmentId: current.developmentId });
    });
    return reply.status(204).send();
  });
}
