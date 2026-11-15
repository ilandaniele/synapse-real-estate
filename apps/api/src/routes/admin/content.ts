import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Uuid } from "@synapse/contracts";
import { floorPlans, galleryItems, pointsOfInterest, units } from "@synapse/db";
import { audit, changedKeys } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, notFound } from "../../lib/errors";
import { floorPlanToContract, galleryToContract, poiToContract } from "../../lib/mappers";
import { IdParams } from "../../lib/params";
import { findDevelopment } from "./developments";

const FloorPlanPatch = z.object({ name: z.string().min(1).max(120), unitId: Uuid.nullable() }).partial();

/** Read-only lists (gallery, points of interest) and floor plan metadata updates. */
export default async function contentRoutes(app: FastifyInstance) {
  app.get("/developments/:id/floor-plans", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findDevelopment(app, organizationId, id);
    const rows = await app.db
      .select()
      .from(floorPlans)
      .where(and(eq(floorPlans.developmentId, id), eq(floorPlans.organizationId, organizationId)))
      .orderBy(asc(floorPlans.createdAt));
    return rows.map((f) => floorPlanToContract(app.config, f));
  });

  app.patch("/floor-plans/:id", { preHandler: app.requireAuth("development:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const patch = FloorPlanPatch.parse(request.body);
    const [current] = await app.db
      .select()
      .from(floorPlans)
      .where(and(eq(floorPlans.id, id), eq(floorPlans.organizationId, actor.organizationId)));
    if (!current) throw notFound("Floor plan");
    if (patch.unitId) {
      const [unit] = await app.db
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.id, patch.unitId), eq(units.developmentId, current.developmentId), eq(units.organizationId, actor.organizationId)));
      if (!unit) throw badRequest("unitId does not belong to this development");
    }
    const updated = await app.db.transaction(async (tx) => {
      const [row] =
        Object.keys(patch).length > 0
          ? await tx.update(floorPlans).set(patch).where(eq(floorPlans.id, id)).returning()
          : [current];
      await audit(tx, actor, "floorplan.update", "floor_plan", id, { fields: changedKeys(patch) });
      return row!;
    });
    return floorPlanToContract(app.config, updated);
  });

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

  app.get("/developments/:id/points-of-interest", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findDevelopment(app, organizationId, id);
    const rows = await app.db
      .select()
      .from(pointsOfInterest)
      .where(and(eq(pointsOfInterest.developmentId, id), eq(pointsOfInterest.organizationId, organizationId)))
      .orderBy(asc(pointsOfInterest.name));
    return rows.map(poiToContract);
  });
}
