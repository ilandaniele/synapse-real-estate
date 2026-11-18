import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { assets, importJobs, renderJobs, REPO_ROOT, type Db, type JobLog, type JobRow } from "@synapse/db";
import { storageFromEnv, type ObjectStorage } from "@synapse/storage";
import { blenderPath, blenderRenderer, renderSettings, type Log, type PanoramaRenderer, type RenderedView } from "./blender";

export const NO_RENDER_BACKEND_MESSAGE =
  "No render backend configured (Blender CLI not available). See docs/RENDER_PIPELINE.md";

type RenderOutcome = { status: "REQUIRES_REVIEW"; result: Record<string, unknown> } | { status: "FAILED"; error: string };

const uploadPath = (organizationId: string, assetId: string) => `uploads/${organizationId}/${assetId}`;

/**
 * Renders the job's GLB into panoramas and registers each image as an uploaded asset with its own IMPORT job,
 * so the regular panorama pipeline validates it and builds the preview and thumbnail. Ends REQUIRES_REVIEW.
 */
export async function processRenderJob(
  db: Db,
  job: JobRow,
  env: NodeJS.ProcessEnv = process.env,
  renderer?: PanoramaRenderer,
): Promise<RenderOutcome["status"]> {
  const logs: JobLog[] = [];
  const log: Log = (level, message) => logs.push({ at: new Date().toISOString(), level, message });
  const executable = blenderPath(env);
  const render = renderer ?? (executable ? blenderRenderer(executable) : null);

  let outcome: RenderOutcome;
  try {
    if (!render) throw new Error(NO_RENDER_BACKEND_MESSAGE);
    outcome = await run(db, job, env, render, log);
    log("info", "Waiting for human review");
  } catch (error) {
    outcome = { status: "FAILED", error: error instanceof Error ? error.message : String(error) };
    log("error", outcome.error);
  }

  await db
    .update(renderJobs)
    .set({
      status: outcome.status,
      error: outcome.status === "FAILED" ? outcome.error : null,
      result: outcome.status === "REQUIRES_REVIEW" ? outcome.result : job.result,
      lockedAt: null,
      logs: sql`${renderJobs.logs} || ${JSON.stringify(logs)}::jsonb`,
    })
    .where(eq(renderJobs.id, job.id));
  return outcome.status;
}

async function run(db: Db, job: JobRow, env: NodeJS.ProcessEnv, render: PanoramaRenderer, log: Log): Promise<RenderOutcome> {
  if (!job.assetId) throw new Error("Job has no asset");
  const [asset] = await db
    .select({ filename: assets.filename, kind: assets.kind, status: assets.status, storagePath: assets.storagePath })
    .from(assets)
    .where(and(eq(assets.id, job.assetId), eq(assets.organizationId, job.organizationId)));
  if (!asset) throw new Error("Asset not found");
  if (asset.status !== "UPLOADED" || !asset.storagePath) throw new Error(`Asset is ${asset.status}, expected UPLOADED`);
  if (asset.kind !== "glb") throw new Error(`Only GLB models can be rendered, got ${asset.kind ?? "unknown"}`);

  const storage = storageFromEnv(env, path.resolve(REPO_ROOT, env.STORAGE_DIR ?? "./storage"));
  const settings = renderSettings(env);
  const workDir = await mkdtemp(path.join(tmpdir(), "synapse-render-"));
  const inputFile = path.join(workDir, "input.glb");
  const outputDir = path.join(workDir, "out");
  try {
    await writeFile(inputFile, await storage.read(asset.storagePath));
    await mkdir(outputDir);
    log("info", `Rendering ${asset.filename} at ${settings.width}x${settings.width / 2}, ${settings.samples} samples on ${settings.device}`);
    const started = Date.now();
    const views = await render({ inputFile, outputDir, settings }, log);
    if (views.length === 0) throw new Error("Render produced no images");
    const registered = await registerViews(db, job, storage, views);
    log("info", `${registered.length} panorama(s) queued for import`);
    return {
      status: "REQUIRES_REVIEW",
      result: {
        kind: "render",
        device: settings.device,
        width: settings.width,
        samples: settings.samples,
        durationMs: Date.now() - started,
        views: registered,
        note: "Rendered panoramas go through the import pipeline; review them before assigning them to scenes.",
      },
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function registerViews(db: Db, job: JobRow, storage: ObjectStorage, views: RenderedView[]) {
  const rows = await Promise.all(
    views.map(async (view) => {
      const id = randomUUID();
      const storagePath = uploadPath(job.organizationId, id);
      const image = await readFile(view.file);
      await storage.write(storagePath, image, "image/jpeg");
      return { view, asset: { id, storagePath, size: image.length } };
    }),
  );

  await db.transaction(async (tx) => {
    await tx.insert(assets).values(
      rows.map(({ view, asset }) => ({
        id: asset.id,
        organizationId: job.organizationId,
        uploadedBy: job.createdBy,
        filename: `${view.slug}.jpg`,
        kind: "jpeg",
        declaredContentType: "image/jpeg",
        declaredSize: asset.size,
        size: asset.size,
        status: "UPLOADED" as const,
        storagePath: asset.storagePath,
      })),
    );
    await tx.insert(importJobs).values(
      rows.map(({ asset }) => ({
        organizationId: job.organizationId,
        assetId: asset.id,
        developmentId: job.developmentId,
        createdBy: job.createdBy,
      })),
    );
  });
  return rows.map(({ view, asset }) => ({ slug: view.slug, assetId: asset.id, seconds: view.seconds }));
}
