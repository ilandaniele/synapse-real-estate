import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { PointOfInterestInput, PointOfInterestPatch } from "@synapse/contracts";
import { pointsOfInterest, type Db } from "@synapse/db";
import { audit, changedKeys } from "../../lib/audit";
import { session } from "../../lib/auth";
import { notFound } from "../../lib/errors";
import { poiToContract } from "../../lib/mappers";
import { IdParams } from "../../lib/params";
import { findDevelopment } from "./developments";

async function findPointOfInterest(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(pointsOfInterest)
    .where(and(eq(pointsOfInterest.id, id), eq(pointsOfInterest.organizationId, organizationId)));
  if (!row) throw notFound("Point of interest");
  return row;
}

export default async function pointOfInterestRoutes(app: FastifyInstance) {
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

  app.post("/developments/:id/points-of-interest", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id: developmentId } = IdParams.parse(request.params);
    const input = PointOfInterestInput.parse(request.body);
    await findDevelopment(app, actor.organizationId, developmentId);
    const row = await app.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(pointsOfInterest)
        .values({ ...input, organizationId: actor.organizationId, developmentId })
        .returning();
      await audit(tx, actor, "poi.create", "point_of_interest", created!.id, { developmentId });
      return created!;
    });
    return reply.status(201).send(poiToContract(row));
  });

  app.patch("/points-of-interest/:id", { preHandler: app.requireAuth("development:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const patch = PointOfInterestPatch.parse(request.body);
    const current = await findPointOfInterest(app.db, actor.organizationId, id);
    const row = await app.db.transaction(async (tx) => {
      const [updated] =
        Object.keys(patch).length > 0
          ? await tx
              .update(pointsOfInterest)
              .set(patch)
              .where(and(eq(pointsOfInterest.id, id), eq(pointsOfInterest.organizationId, actor.organizationId)))
              .returning()
          : [current];
      await audit(tx, actor, "poi.update", "point_of_interest", id, { fields: changedKeys(patch) });
      return updated!;
    });
    return poiToContract(row);
  });

  app.delete("/points-of-interest/:id", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const current = await findPointOfInterest(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await tx.delete(pointsOfInterest).where(and(eq(pointsOfInterest.id, id), eq(pointsOfInterest.organizationId, actor.organizationId)));
      await audit(tx, actor, "poi.delete", "point_of_interest", id, { developmentId: current.developmentId });
    });
    return reply.status(204).send();
  });
}
