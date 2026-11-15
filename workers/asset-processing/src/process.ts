import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { inspectDxf, inspectGlb, suggestMeshMappings, unsupportedFormatMessage, DXF_REFERENCE_NOTE } from "@synapse/cad-importer";
import { assets, importJobs, modelAssets, panoramaAssets, units, type Db, type JobLog, type JobRow } from "@synapse/db";
import { detectFileKind, retryDelayMs } from "@synapse/domain";

export type JobOutcome =
  | { status: "COMPLETED" | "REQUIRES_REVIEW"; result: Record<string, unknown> }
  | { status: "FAILED"; error: string }
  | { status: "RETRY"; error: string; delayMs: number };

class PermanentFailure extends Error {}

/** Output paths below STORAGE_DIR, relative with forward slashes (publicly servable under /media/). */
const processedPath = (organizationId: string, name: string) => `processed/${organizationId}/${name}`;

function resolveInside(storageDir: string, relative: string): string {
  const root = path.resolve(storageDir);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Storage path escapes STORAGE_DIR");
  return full;
}

/**
 * Processes one claimed IMPORT job and persists the outcome (status, error, result, logs).
 * Never pretends success: unsupported formats and invalid files end FAILED with an explicit message.
 */
export async function processJob(db: Db, job: JobRow, storageDir: string): Promise<JobOutcome> {
  const logs: JobLog[] = [];
  const log = (level: JobLog["level"], message: string) => logs.push({ at: new Date().toISOString(), level, message });
  let outcome: JobOutcome;
  try {
    outcome = await run(db, job, storageDir, log);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof PermanentFailure) {
      outcome = { status: "FAILED", error: message };
    } else if (job.attempts < job.maxAttempts) {
      outcome = { status: "RETRY", error: message, delayMs: retryDelayMs(job.attempts) };
    } else {
      outcome = { status: "FAILED", error: `${message} (gave up after ${job.attempts} attempts)` };
    }
  }

  if (outcome.status === "FAILED") log("error", outcome.error);
  else if (outcome.status === "RETRY") log("warn", `Unexpected error, retrying in ${outcome.delayMs} ms: ${outcome.error}`);
  else log("info", outcome.status === "REQUIRES_REVIEW" ? "Waiting for human review" : "Completed");

  await db
    .update(importJobs)
    .set({
      status: outcome.status === "RETRY" ? "PENDING" : outcome.status,
      error: "error" in outcome ? outcome.error : null,
      result: "result" in outcome ? outcome.result : job.result,
      runAfter: outcome.status === "RETRY" ? new Date(Date.now() + outcome.delayMs) : job.runAfter,
      lockedAt: null,
      logs: sql`${importJobs.logs} || ${JSON.stringify(logs)}::jsonb`,
    })
    .where(eq(importJobs.id, job.id));
  return outcome;
}

async function run(db: Db, job: JobRow, storageDir: string, log: (l: JobLog["level"], m: string) => void): Promise<JobOutcome> {
  if (!job.assetId) throw new PermanentFailure("Job has no asset");
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, job.assetId), eq(assets.organizationId, job.organizationId)));
  if (!asset) throw new PermanentFailure("Asset not found");
  if (asset.status !== "UPLOADED" || !asset.storagePath) throw new PermanentFailure(`Asset is ${asset.status}, expected UPLOADED`);

  const bytes = new Uint8Array(await readFile(resolveInside(storageDir, asset.storagePath)));
  const kind = detectFileKind(bytes);
  log("info", `Processing ${asset.filename} (${bytes.byteLength} bytes, detected ${kind ?? "unknown"})`);

  switch (kind) {
    case "glb":
      return processGlb(db, job, asset.id, bytes, log);
    case "jpeg":
    case "png":
      return processPanorama(db, job, asset.id, bytes, storageDir, log);
    case "dxf":
      return processDxf(bytes, log);
    case null:
      throw new PermanentFailure("Unrecognized file signature");
    default:
      // DWG / IFC / FBX / OBJ / glTF-JSON / PDF / SVG / WebP: never pretend a conversion happened.
      throw new PermanentFailure(unsupportedFormatMessage(kind));
  }
}

async function processGlb(
  db: Db,
  job: JobRow,
  assetId: string,
  bytes: Uint8Array,
  log: (l: JobLog["level"], m: string) => void,
): Promise<JobOutcome> {
  const info = inspectGlb(bytes);
  if (!info.ok) throw new PermanentFailure(`Invalid GLB: ${info.error}`);
  try {
    await new NodeIO().readBinary(bytes); // strict structural validation (accessors, buffers, references)
  } catch (error) {
    throw new PermanentFailure(`Invalid GLB: ${error instanceof Error ? error.message : String(error)}`);
  }
  log("info", `GLB valid: ${info.nodeNames.length} named nodes, ${info.meshCount} meshes, ${info.materialCount} materials`);

  const [model] = await db
    .insert(modelAssets)
    .values({
      organizationId: job.organizationId,
      assetId,
      developmentId: job.developmentId,
      nodeNames: info.nodeNames,
      stats: { meshCount: info.meshCount, materialCount: info.materialCount, sceneCount: info.sceneCount },
    })
    .returning();

  const unitRows = job.developmentId
    ? await db
        .select({ id: units.id, code: units.code })
        .from(units)
        .where(and(eq(units.developmentId, job.developmentId), eq(units.organizationId, job.organizationId)))
    : [];
  const unitByCode = new Map(unitRows.map((u) => [u.code, u.id]));
  const suggestions = suggestMeshMappings(info.nodeNames).map((s) => ({ ...s, unitId: unitByCode.get(s.unitCode) ?? null }));
  log("info", `${suggestions.length} mesh -> unit mappings suggested; ${suggestions.filter((s) => !s.unitId).length} without a matching unit`);

  return {
    status: "REQUIRES_REVIEW",
    result: {
      kind: "glb",
      modelAssetId: model?.id,
      nodeCount: info.nodeNames.length,
      meshCount: info.meshCount,
      suggestions,
      note: "Mesh -> unit mappings are suggestions; a human must approve them.",
    },
  };
}

async function processPanorama(
  db: Db,
  job: JobRow,
  assetId: string,
  bytes: Uint8Array,
  storageDir: string,
  log: (l: JobLog["level"], m: string) => void,
): Promise<JobOutcome> {
  let width: number;
  let height: number;
  try {
    const meta = await sharp(bytes).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (error) {
    throw new PermanentFailure(`Invalid image: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!width || !height || Math.abs(width - 2 * height) > 2) {
    throw new PermanentFailure("Panorama must be 2:1 equirectangular");
  }
  log("info", `Equirectangular ${width}x${height}`);

  const dir = resolveInside(storageDir, processedPath(job.organizationId, ""));
  await mkdir(dir, { recursive: true });
  const outputs = {
    imagePath: processedPath(job.organizationId, `${assetId}.jpg`),
    previewPath: processedPath(job.organizationId, `${assetId}-preview.jpg`),
    thumbnailPath: processedPath(job.organizationId, `${assetId}-thumb.jpg`),
  };
  // Re-encoding strips metadata and guarantees a browser-safe JPEG.
  const source = () => sharp(bytes).rotate();
  await Promise.all([
    source().resize({ width: 8192, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer().then((b) => writeFile(resolveInside(storageDir, outputs.imagePath), b)),
    source().resize(1024, 512, { fit: "fill" }).jpeg({ quality: 80 }).toBuffer().then((b) => writeFile(resolveInside(storageDir, outputs.previewPath), b)),
    source().resize(320, 180, { fit: "cover" }).jpeg({ quality: 75 }).toBuffer().then((b) => writeFile(resolveInside(storageDir, outputs.thumbnailPath), b)),
  ]);

  const [pano] = await db
    .insert(panoramaAssets)
    .values({ organizationId: job.organizationId, assetId, width, height, ...outputs })
    .returning();
  log("info", "Generated full image, 1024x512 preview and thumbnail");
  return { status: "COMPLETED", result: { kind: "panorama", panoramaAssetId: pano?.id, width, height, ...outputs } };
}

function processDxf(bytes: Uint8Array, log: (l: JobLog["level"], m: string) => void): JobOutcome {
  const info = inspectDxf(new TextDecoder().decode(bytes));
  log("warn", DXF_REFERENCE_NOTE);
  return { status: "REQUIRES_REVIEW", result: { kind: "dxf", ...info } };
}
