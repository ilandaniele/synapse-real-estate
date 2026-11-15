import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AvailabilityInput, UnitInput, UnitPatch } from "@synapse/contracts";
import { unitAvailabilityHistory, unitMeshMappings, unitTypes, units, type Db } from "@synapse/db";
import { canTransition } from "@synapse/domain";
import { audit, changedKeys, type Executor } from "../../lib/audit";
import { session } from "../../lib/auth";
import { conflict, isUniqueViolation, notFound } from "../../lib/errors";
import { loadUnits } from "../../lib/mappers";
import { IdParams, slugify } from "../../lib/params";
import { findDevelopment } from "./developments";

async function loadUnit(db: Db, organizationId: string, id: string) {
  const [unit] = await loadUnits(db, organizationId, eq(units.id, id));
  if (!unit) throw notFound("Unit");
  return unit;
}

async function resolveUnitTypeId(tx: Executor, organizationId: string, developmentId: string, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [existing] = await tx
    .select({ id: unitTypes.id })
    .from(unitTypes)
    .where(and(eq(unitTypes.developmentId, developmentId), eq(unitTypes.name, trimmed)));
  if (existing) return existing.id;
  const [created] = await tx.insert(unitTypes).values({ organizationId, developmentId, name: trimmed }).returning({ id: unitTypes.id });
  return created!.id;
}

async function replaceMeshNames(tx: Executor, organizationId: string, developmentId: string, unitId: string, names: string[]) {
  await tx.delete(unitMeshMappings).where(eq(unitMeshMappings.unitId, unitId));
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length > 0) {
    await tx.insert(unitMeshMappings).values(unique.map((meshName) => ({ organizationId, developmentId, unitId, meshName })));
  }
}

export default async function unitRoutes(app: FastifyInstance) {
  app.get("/developments/:id/units", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findDevelopment(app, organizationId, id);
    return loadUnits(app.db, organizationId, eq(units.developmentId, id));
  });

  app.get("/units/:id", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { id } = IdParams.parse(request.params);
    return loadUnit(app.db, session(request).organizationId, id);
  });

  app.post("/developments/:id/units", { preHandler: app.requireAuth("unit:write") }, async (request, reply) => {
    const actor = session(request);
    const { id: developmentId } = IdParams.parse(request.params);
    const { unitType, meshNames, slug, ...rest } = UnitInput.parse(request.body);
    await findDevelopment(app, actor.organizationId, developmentId);
    try {
      const unitId = await app.db.transaction(async (tx) => {
        const unitTypeId = await resolveUnitTypeId(tx, actor.organizationId, developmentId, unitType);
        const [created] = await tx
          .insert(units)
          .values({ ...rest, slug: slug ?? slugify(rest.name), organizationId: actor.organizationId, developmentId, unitTypeId })
          .returning({ id: units.id });
        const id = created!.id;
        await tx.insert(unitAvailabilityHistory).values({
          organizationId: actor.organizationId,
          unitId: id,
          fromStatus: null,
          toStatus: rest.status,
          reason: "Unit created",
          changedBy: actor.userId,
        });
        await replaceMeshNames(tx, actor.organizationId, developmentId, id, meshNames);
        await audit(tx, actor, "unit.create", "unit", id, { code: rest.code, status: rest.status });
        return id;
      });
      return reply.status(201).send(await loadUnit(app.db, actor.organizationId, unitId));
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Unit code, slug or mesh name is already in use in this development");
      throw error;
    }
  });

  app.patch("/units/:id", { preHandler: app.requireAuth("unit:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const { unitType, meshNames, slug, ...rest } = UnitPatch.parse(request.body);
    const current = await loadUnit(app.db, actor.organizationId, id);
    if (rest.status && !canTransition(current.status, rest.status)) {
      throw conflict(`Cannot move unit from ${current.status} to ${rest.status}`, "INVALID_TRANSITION");
    }
    try {
      await app.db.transaction(async (tx) => {
        const set: Partial<typeof units.$inferInsert> = { ...rest };
        if (slug !== undefined) set.slug = slug;
        if (unitType !== undefined) set.unitTypeId = await resolveUnitTypeId(tx, actor.organizationId, current.developmentId, unitType);
        if (Object.keys(set).length > 0) {
          await tx.update(units).set(set).where(and(eq(units.id, id), eq(units.organizationId, actor.organizationId)));
        }
        if (rest.status && rest.status !== current.status) {
          await tx.insert(unitAvailabilityHistory).values({
            organizationId: actor.organizationId,
            unitId: id,
            fromStatus: current.status,
            toStatus: rest.status,
            reason: "Updated via unit edit",
            changedBy: actor.userId,
          });
        }
        if (meshNames !== undefined) await replaceMeshNames(tx, actor.organizationId, current.developmentId, id, meshNames);
        await audit(tx, actor, "unit.update", "unit", id, {
          fields: changedKeys({ ...rest, slug, unitType, meshNames }),
          ...(rest.status && rest.status !== current.status ? { status: { from: current.status, to: rest.status } } : {}),
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Unit code, slug or mesh name is already in use in this development");
      throw error;
    }
    return loadUnit(app.db, actor.organizationId, id);
  });

  app.patch("/units/:id/availability", { preHandler: app.requireAuth("unit:availability") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const { status, reason } = AvailabilityInput.parse(request.body);
    const current = await loadUnit(app.db, actor.organizationId, id);
    if (!canTransition(current.status, status)) {
      throw conflict(`Cannot move unit from ${current.status} to ${status}`, "INVALID_TRANSITION");
    }
    if (status !== current.status) {
      await app.db.transaction(async (tx) => {
        await tx.update(units).set({ status }).where(and(eq(units.id, id), eq(units.organizationId, actor.organizationId)));
        await tx.insert(unitAvailabilityHistory).values({
          organizationId: actor.organizationId,
          unitId: id,
          fromStatus: current.status,
          toStatus: status,
          reason: reason ?? null,
          changedBy: actor.userId,
        });
        await audit(tx, actor, "unit.availability", "unit", id, { from: current.status, to: status, reason: reason ?? null });
      });
    }
    return loadUnit(app.db, actor.organizationId, id);
  });

  app.delete("/units/:id", { preHandler: app.requireAuth("unit:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const current = await loadUnit(app.db, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await tx.delete(units).where(and(eq(units.id, id), eq(units.organizationId, actor.organizationId)));
      await audit(tx, actor, "unit.delete", "unit", id, { code: current.code });
    });
    return reply.status(204).send();
  });
}
