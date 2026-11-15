import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { DevelopmentManifest, LeadInput } from "@synapse/contracts";
import { developments, leads, publications, units } from "@synapse/db";
import { isPubliclyVisible } from "@synapse/domain";
import { hashIp } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { SlugParams } from "../lib/params";

export interface PublicRouteOptions {
  leadRateLimit: number;
}

export default async function publicRoutes(app: FastifyInstance, opts: PublicRouteOptions) {
  app.get("/developments/:slug/manifest", async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const [row] = await app.db
      .select({ id: publications.id, version: publications.version, snapshot: publications.snapshot })
      .from(publications)
      .innerJoin(developments, eq(developments.id, publications.developmentId))
      .where(eq(developments.slug, slug))
      .orderBy(desc(publications.version))
      .limit(1);
    if (!row) throw notFound("Published development");

    const etag = `"${row.id}"`;
    reply.header("ETag", etag);
    reply.header("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    if (request.headers["if-none-match"] === etag) return reply.status(304).send();
    return DevelopmentManifest.parse(row.snapshot);
  });

  app.post(
    "/leads",
    { config: { rateLimit: { max: opts.leadRateLimit, timeWindow: "1 minute" } } },
    async (request, reply) => {
      // Honeypot is checked before validation so bots get no signal: silently accept, store nothing.
      const raw = request.body as { website?: unknown } | null;
      if (raw && typeof raw === "object" && typeof raw.website === "string" && raw.website.length > 0) {
        return reply.status(202).send({ accepted: true });
      }
      const input = LeadInput.parse(request.body);

      const [development] = await app.db
        .select({ id: developments.id, organizationId: developments.organizationId })
        .from(developments)
        .where(eq(developments.slug, input.developmentSlug));
      if (!development) throw notFound("Development");

      if (input.unitId) {
        const [unit] = await app.db
          .select({ status: units.status })
          .from(units)
          .where(and(eq(units.id, input.unitId), eq(units.developmentId, development.id)));
        if (!unit || !isPubliclyVisible(unit.status)) throw badRequest("Unknown unit for this development");
      }

      const id = randomUUID();
      await app.db.insert(leads).values({
        id,
        organizationId: development.organizationId,
        developmentId: development.id,
        unitId: input.unitId ?? null,
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        message: input.message || null,
        source: "showroom",
        ipHash: hashIp(request.ip, app.config.sessionSecret),
        userAgent: (request.headers["user-agent"] ?? "").slice(0, 255) || null,
        consentAt: new Date(),
      });
      return reply.status(201).send({ id });
    },
  );
}
