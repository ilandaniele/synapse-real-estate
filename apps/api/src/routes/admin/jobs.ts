import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { JobInput } from "@synapse/contracts";
import { appendJobLog, assets, developments, importJobs, jobTable, renderJobs, unitMeshMappings, type JobRow } from "@synapse/db";
import { canMoveJob, canRetry, type JobKind } from "@synapse/domain";
import { audit } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { jobToContract } from "../../lib/mappers";
import { IdParams } from "../../lib/params";
import { copyToPublished } from "../../lib/storage";

const ReviewInput = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() });

interface GlbSuggestion {
  meshName: string;
  unitId: string | null;
}

export default async function jobRoutes(app: FastifyInstance) {
  async function findJob(organizationId: string, id: string): Promise<{ kind: JobKind; job: JobRow }> {
    // Two tables, one lookup each (run together); never per-row queries.
    const [imports, renders] = await Promise.all([
      app.db.select().from(importJobs).where(and(eq(importJobs.id, id), eq(importJobs.organizationId, organizationId))),
      app.db.select().from(renderJobs).where(and(eq(renderJobs.id, id), eq(renderJobs.organizationId, organizationId))),
    ]);
    if (imports[0]) return { kind: "IMPORT", job: imports[0] };
    if (renders[0]) return { kind: "RENDER", job: renders[0] };
    throw notFound("Job");
  }

  app.post("/jobs", { preHandler: app.requireAuth("job:create") }, async (request, reply) => {
    const actor = session(request);
    const input = JobInput.parse(request.body);
    const [asset] = await app.db
      .select({ id: assets.id, status: assets.status })
      .from(assets)
      .where(and(eq(assets.id, input.assetId), eq(assets.organizationId, actor.organizationId)));
    if (!asset) throw notFound("Asset");
    if (asset.status !== "UPLOADED") throw conflict(`Asset is ${asset.status}; only UPLOADED assets can be processed`, "ASSET_NOT_READY");
    if (input.developmentId) {
      const [dev] = await app.db
        .select({ id: developments.id })
        .from(developments)
        .where(and(eq(developments.id, input.developmentId), eq(developments.organizationId, actor.organizationId)));
      if (!dev) throw badRequest("developmentId not found");
    }
    const table = jobTable(input.kind);
    const row = await app.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(table)
        .values({
          organizationId: actor.organizationId,
          assetId: input.assetId,
          developmentId: input.developmentId ?? null,
          createdBy: actor.userId,
          logs: [{ at: new Date().toISOString(), level: "info", message: "Job queued" }],
        })
        .returning();
      await audit(tx, actor, "job.create", "job", created!.id, { kind: input.kind, assetId: input.assetId });
      return created!;
    });
    return reply.status(201).send(jobToContract(input.kind, row));
  });

  app.get("/jobs", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const [imports, renders] = await Promise.all([
      app.db.select().from(importJobs).where(eq(importJobs.organizationId, organizationId)).orderBy(desc(importJobs.createdAt)).limit(100),
      app.db.select().from(renderJobs).where(eq(renderJobs.organizationId, organizationId)).orderBy(desc(renderJobs.createdAt)).limit(100),
    ]);
    return [...imports.map((j) => jobToContract("IMPORT", j)), ...renders.map((j) => jobToContract("RENDER", j))]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  });

  app.get("/jobs/:id", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { kind, job } = await findJob(session(request).organizationId, id);
    return jobToContract(kind, job);
  });

  app.post("/jobs/:id/retry", { preHandler: app.requireAuth("job:create") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const { kind, job } = await findJob(actor.organizationId, id);
    if (!canRetry(job.status, job.attempts)) {
      throw conflict(`Job cannot be retried (status ${job.status}, attempts ${job.attempts})`, "NOT_RETRYABLE");
    }
    const table = jobTable(kind);
    await app.db.transaction(async (tx) => {
      await tx.update(table).set({ status: "PENDING", error: null, runAfter: new Date(), lockedAt: null }).where(eq(table.id, id));
      await audit(tx, actor, "job.retry", "job", id, { kind, attempts: job.attempts });
    });
    await appendJobLog(app.db, kind, id, "info", "Retry requested");
    return jobToContract(kind, (await findJob(actor.organizationId, id)).job);
  });

  app.post("/jobs/:id/review", { preHandler: app.requireAuth("job:create") }, async (request) => {
    const actor = session(request);
    const { id } = IdParams.parse(request.params);
    const input = ReviewInput.parse(request.body);
    const { kind, job } = await findJob(actor.organizationId, id);
    if (job.status !== "REQUIRES_REVIEW") throw conflict(`Job is ${job.status}, not REQUIRES_REVIEW`, "NOT_REVIEWABLE");
    const next = input.decision === "approve" ? "COMPLETED" : "FAILED";
    if (!canMoveJob(job.status, next)) throw conflict(`Cannot move job from ${job.status} to ${next}`);
    const table = jobTable(kind);

    let approvedMappings = 0;
    if (input.decision === "approve") approvedMappings = await applyApprovedGlb(actor.organizationId, job);

    await app.db.transaction(async (tx) => {
      await tx
        .update(table)
        .set({
          status: next,
          error: input.decision === "reject" ? input.note ?? "Rejected by reviewer" : null,
          result: input.decision === "approve" ? { ...(job.result ?? {}), approvedMappings, reviewNote: input.note ?? null } : job.result,
        })
        .where(eq(table.id, id));
      await audit(tx, actor, `job.review.${input.decision}`, "job", id, { kind, approvedMappings, note: input.note ?? null });
    });
    await appendJobLog(app.db, kind, id, "info", `Review ${input.decision}d by ${actor.userId}`);
    return jobToContract(kind, (await findJob(actor.organizationId, id)).job);
  });

  /**
   * Approving a GLB import persists the suggested mesh -> unit mappings (only those that matched a unit) and
   * publishes a copy of the model under published/<org>/ so it can be served; nothing happens without approval.
   */
  async function applyApprovedGlb(organizationId: string, job: JobRow): Promise<number> {
    const result = (job.result ?? {}) as { kind?: string; modelAssetId?: string; suggestions?: GlbSuggestion[] };
    if (result.kind !== "glb" || !job.developmentId || !job.assetId) return 0;
    const developmentId = job.developmentId;
    const mappable = (result.suggestions ?? []).filter((s): s is { meshName: string; unitId: string } => s.unitId !== null);

    const [asset] = await app.db.select().from(assets).where(and(eq(assets.id, job.assetId), eq(assets.organizationId, organizationId)));
    const publishedRelative = `published/${organizationId}/${job.assetId}.glb`;
    if (asset?.storagePath) {
      await copyToPublished(app.config.storageDir, asset.storagePath, publishedRelative);
    }
    await app.db.transaction(async (tx) => {
      if (mappable.length > 0) {
        await tx
          .delete(unitMeshMappings)
          .where(and(eq(unitMeshMappings.developmentId, developmentId), inArray(unitMeshMappings.meshName, mappable.map((m) => m.meshName))));
        await tx.insert(unitMeshMappings).values(
          mappable.map((m) => ({
            organizationId,
            developmentId,
            unitId: m.unitId,
            meshName: m.meshName,
            modelAssetId: result.modelAssetId ?? null,
          })),
        );
      }
      if (asset?.storagePath) {
        await tx
          .update(developments)
          .set({ modelPath: publishedRelative })
          .where(and(eq(developments.id, developmentId), eq(developments.organizationId, organizationId)));
      }
    });
    return mappable.length;
  }
}
