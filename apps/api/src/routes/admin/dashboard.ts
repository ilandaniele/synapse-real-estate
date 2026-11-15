import { and, count, desc, eq, gte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { developments, importJobs, leads, publications, renderJobs, units, users } from "@synapse/db";
import { JOB_STATUSES, UNIT_STATUSES } from "@synapse/domain";
import { session } from "../../lib/auth";
import { iso } from "../../lib/mappers";

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Five aggregate queries, run together; the cost does not depend on how much data exists.
    const [unitRows, leadRows, publicationRows, importRows, renderRows] = await Promise.all([
      app.db.select({ status: units.status, n: count() }).from(units).where(eq(units.organizationId, organizationId)).groupBy(units.status),
      app.db.select({ n: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), gte(leads.createdAt, since))),
      app.db
        .select({
          version: publications.version,
          publishedAt: publications.publishedAt,
          developmentId: publications.developmentId,
          developmentName: developments.name,
          publishedBy: users.name,
        })
        .from(publications)
        .innerJoin(developments, eq(developments.id, publications.developmentId))
        .leftJoin(users, eq(users.id, publications.publishedBy))
        .where(eq(publications.organizationId, organizationId))
        .orderBy(desc(publications.publishedAt))
        .limit(1),
      app.db.select({ status: importJobs.status, n: count() }).from(importJobs).where(eq(importJobs.organizationId, organizationId)).groupBy(importJobs.status),
      app.db.select({ status: renderJobs.status, n: count() }).from(renderJobs).where(eq(renderJobs.organizationId, organizationId)).groupBy(renderJobs.status),
    ]);

    const unitsByStatus = Object.fromEntries(UNIT_STATUSES.map((s) => [s, unitRows.find((r) => r.status === s)?.n ?? 0]));
    const jobsByStatus = Object.fromEntries(
      JOB_STATUSES.map((s) => [s, (importRows.find((r) => r.status === s)?.n ?? 0) + (renderRows.find((r) => r.status === s)?.n ?? 0)]),
    );
    const last = publicationRows[0];
    return {
      unitsByStatus,
      leadsLast30Days: leadRows[0]?.n ?? 0,
      lastPublication: last
        ? {
            version: last.version,
            publishedAt: iso(last.publishedAt),
            developmentId: last.developmentId,
            developmentName: last.developmentName,
            publishedBy: last.publishedBy ?? "unknown",
          }
        : null,
      jobsByStatus,
    };
  });
}
