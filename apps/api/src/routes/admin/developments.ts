import { and, asc, desc, eq, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DevelopmentInput, type Publication } from "@synapse/contracts";
import { developments, publications, users } from "@synapse/db";
import { audit, changedKeys } from "../../lib/audit";
import { session } from "../../lib/auth";
import { conflict, HttpError, isUniqueViolation, notFound } from "../../lib/errors";
import { buildManifest } from "../../lib/manifest";
import { developmentToContract, iso } from "../../lib/mappers";
import { IdParams } from "../../lib/params";

const DevelopmentPatch = DevelopmentInput.partial();

export async function findDevelopment(app: FastifyInstance, organizationId: string, id: string) {
  const [row] = await app.db
    .select()
    .from(developments)
    .where(and(eq(developments.id, id), eq(developments.organizationId, organizationId)));
  if (!row) throw notFound("Development");
  return row;
}

export default async function developmentRoutes(app: FastifyInstance) {
  app.get("/developments", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const rows = await app.db
      .select()
      .from(developments)
      .where(eq(developments.organizationId, organizationId))
      .orderBy(asc(developments.name));
    return rows.map((d) => developmentToContract(app.config, d));
  });

  app.get("/developments/:id", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { id } = IdParams.parse(request.params);
    return developmentToContract(app.config, await findDevelopment(app, session(request).organizationId, id));
  });

  app.post("/developments", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const input = DevelopmentInput.parse(request.body);
    try {
      const row = await app.db.transaction(async (tx) => {
        const [created] = await tx.insert(developments).values({ ...input, organizationId: actor.organizationId }).returning();
        await audit(tx, actor, "development.create", "development", created!.id, { slug: input.slug });
        return created!;
      });
      return reply.status(201).send(developmentToContract(app.config, row));
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(`Slug "${input.slug}" is already in use`);
      throw error;
    }
  });

  app.patch("/developments/:id", { preHandler: app.requireAuth("development:write") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const patch = DevelopmentPatch.parse(request.body);
    await findDevelopment(app, actor.organizationId, id);
    try {
      const row = await app.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(developments)
          .set(patch)
          .where(and(eq(developments.id, id), eq(developments.organizationId, actor.organizationId)))
          .returning();
        await audit(tx, actor, "development.update", "development", id, { fields: changedKeys(patch) });
        return updated!;
      });
      return developmentToContract(app.config, row);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Slug is already in use");
      throw error;
    }
  });

  app.delete("/developments/:id", { preHandler: app.requireAuth("development:write") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const development = await findDevelopment(app, actor.organizationId, id);
    await app.db.transaction(async (tx) => {
      await tx.delete(developments).where(and(eq(developments.id, id), eq(developments.organizationId, actor.organizationId)));
      await audit(tx, actor, "development.delete", "development", id, { slug: development.slug });
    });
    return reply.status(204).send();
  });

  app.post("/developments/:id/publish", { preHandler: app.requireAuth("development:publish") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const development = await findDevelopment(app, actor.organizationId, id);

    const [latest] = await app.db
      .select({ version: max(publications.version) })
      .from(publications)
      .where(eq(publications.developmentId, id));
    const version = (latest?.version ?? 0) + 1;
    const publishedAt = new Date();

    let manifest;
    try {
      manifest = await buildManifest(app.db, app.config, development, version, publishedAt);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpError(422, "MANIFEST_INVALID", "Current data does not produce a valid public manifest", error.issues);
      }
      throw error;
    }

    try {
      const [created] = await app.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(publications)
          .values({
            organizationId: actor.organizationId,
            developmentId: id,
            version,
            snapshot: manifest as unknown as Record<string, unknown>,
            publishedBy: actor.userId,
            publishedAt,
          })
          .returning();
        await audit(tx, actor, "development.publish", "development", id, {
          version,
          units: manifest.units.length,
          scenes: manifest.scenes.length,
        });
        return inserted;
      });
      const [author] = await app.db.select({ name: users.name }).from(users).where(eq(users.id, actor.userId));
      const body: Publication = {
        id: created!.id,
        developmentId: id,
        version,
        publishedBy: author?.name ?? actor.userId,
        publishedAt: iso(publishedAt),
      };
      return reply.status(201).send(body);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Another publish happened concurrently; retry", "PUBLISH_CONFLICT");
      throw error;
    }
  });

  app.get("/developments/:id/publications", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    await findDevelopment(app, organizationId, id);
    const rows = await app.db
      .select({
        id: publications.id,
        version: publications.version,
        publishedAt: publications.publishedAt,
        publishedByName: users.name,
      })
      .from(publications)
      .leftJoin(users, eq(users.id, publications.publishedBy))
      .where(and(eq(publications.developmentId, id), eq(publications.organizationId, organizationId)))
      .orderBy(desc(publications.version));
    return rows.map(
      (r): Publication => ({
        id: r.id,
        developmentId: id,
        version: r.version,
        publishedBy: r.publishedByName ?? "unknown",
        publishedAt: iso(r.publishedAt),
      }),
    );
  });
}
