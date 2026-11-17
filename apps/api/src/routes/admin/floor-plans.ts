import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { FloorPlanInput, FloorPlanPatch } from "@synapse/contracts";
import { floorPlans, type Db } from "@synapse/db";
import { audit, changedKeys } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, notFound } from "../../lib/errors";
import { resolveImage } from "../../lib/images";
import { floorPlanToContract } from "../../lib/mappers";
import { assertUnitInDevelopment } from "../../lib/ownership";
import { IdParams } from "../../lib/params";
import { findDevelopment } from "./developments";

async function findFloorPlan(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(floorPlans)
    .where(and(eq(floorPlans.id, id), eq(floorPlans.organizationId, organizationId)));
  if (!row) throw notFound("Floor plan");
  return row;
}

export default async function floorPlanRoutes(app: FastifyInstance) {
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

  app.post("/developments/:id/floor-plans", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id: developmentId } = IdParams.parse(request.params);
    const { imageAssetId, imageUrl, ...fields } = FloorPlanInput.parse(request.body);
    await findDevelopment(app, actor.organizationId, developmentId);
    await assertUnitInDevelopment(app.db, actor.organizationId, developmentId, fields.unitId);
    const imagePath = await resolveImage(app, actor.organizationId, { imageAssetId, imageUrl });
    if (!imagePath) throw badRequest("imageAssetId or imageUrl is required");
    const row = await app.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(floorPlans)
        .values({ ...fields, imagePath, organizationId: actor.organizationId, developmentId })
        .returning();
      await audit(tx, actor, "floorplan.create", "floor_plan", created!.id, { developmentId });
      return created!;
    });
    return reply.status(201).send(floorPlanToContract(app.config, row));
  });

  app.patch("/floor-plans/:id", { preHandler: app.requireAuth("development:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const { imageAssetId, imageUrl, ...fields } = FloorPlanPatch.parse(request.body);
    const current = await findFloorPlan(app.db, actor.organizationId, id);
    await assertUnitInDevelopment(app.db, actor.organizationId, current.developmentId, fields.unitId);
    const imagePath = await resolveImage(app, actor.organizationId, { imageAssetId, imageUrl });
    const set = { ...fields, ...(imagePath ? { imagePath } : {}) };
    const row = await app.db.transaction(async (tx) => {
      const [updated] =
        Object.keys(set).length > 0
          ? await tx
              .update(floorPlans)
              .set(set)
              .where(and(eq(floorPlans.id, id), eq(floorPlans.organizationId, actor.organizationId)))
              .returning()
          : [current];
      await audit(tx, actor, "floorplan.update", "floor_plan", id, { fields: changedKeys(set) });
      return updated!;
    });
    return floorPlanToContract(app.config, row);
  });

  app.delete("/floor-plans/:id", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const current = await findFloorPlan(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await tx.delete(floorPlans).where(and(eq(floorPlans.id, id), eq(floorPlans.organizationId, actor.organizationId)));
      await audit(tx, actor, "floorplan.delete", "floor_plan", id, { developmentId: current.developmentId });
    });
    return reply.status(204).send();
  });
}
