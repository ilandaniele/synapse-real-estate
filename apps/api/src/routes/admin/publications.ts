import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CompareQuery, type Publication, type PublicationDiff } from "@synapse/contracts";
import { publications, units, users } from "@synapse/db";
import { session } from "../../lib/auth";
import { buildManifest } from "../../lib/manifest";
import { iso, loadUnits } from "../../lib/mappers";
import { IdParams } from "../../lib/params";
import { diffManifests } from "../../lib/publication-diff";
import { loadSnapshots, nextVersion, storePublication, validManifest } from "../../lib/publications";
import { restoreManifest } from "../../lib/restore-manifest";
import { findDevelopment } from "./developments";

const VersionParams = IdParams.extend({ version: z.coerce.number().int().positive() });

export default async function publicationRoutes(app: FastifyInstance) {
  app.post("/developments/:id/publish", { preHandler: app.requireAuth("development:publish") }, async (request, reply) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const development = await findDevelopment(app, actor.organizationId, id);
    const version = await nextVersion(app.db, id);
    const manifest = await validManifest(() => buildManifest(app.db, app.config, development, version, new Date()));
    const body = await storePublication(app, actor, id, manifest, { action: "development.publish", restoredFromVersion: null });
    return reply.status(201).send(body);
  });

  app.post(
    "/developments/:id/publications/:version/restore",
    { preHandler: app.requireAuth("development:publish") },
    async (request, reply) => {
      const actor = session(request);
      const { id, version: source } = VersionParams.parse(request.params);
      await findDevelopment(app, actor.organizationId, id);
      const [snapshots, currentUnits, version] = await Promise.all([
        loadSnapshots(app.db, actor.organizationId, id, [source]),
        loadUnits(app.db, actor.organizationId, eq(units.developmentId, id)),
        nextVersion(app.db, id),
      ]);
      const manifest = await validManifest(() => restoreManifest(snapshots.get(source)!, currentUnits, version, iso(new Date())));
      const body = await storePublication(app, actor, id, manifest, { action: "development.restore", restoredFromVersion: source });
      return reply.status(201).send(body);
    },
  );

  app.get("/developments/:id/publications/compare", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    const { from, to } = CompareQuery.parse(request.query);
    await findDevelopment(app, organizationId, id);
    const snapshots = await loadSnapshots(app.db, organizationId, id, [from, to]);
    const body: PublicationDiff = { from, to, changes: diffManifests(snapshots.get(from)!, snapshots.get(to)!) };
    return body;
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
        restoredFromVersion: publications.restoredFromVersion,
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
        restoredFromVersion: r.restoredFromVersion,
      }),
    );
  });
}
