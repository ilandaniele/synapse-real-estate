import { NodeIO } from "@gltf-transform/core";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { buildCubeTiles, decodeEquirect } from "@synapse/cubemap";
import {
  convertIfcToGlb,
  inspectDxf,
  inspectGlb,
  suggestMeshMappings,
  unsupportedFormatMessage,
  DXF_REFERENCE_NOTE,
  IFC_REVIEW_NOTE,
} from "@synapse/cad-importer";
import { assets, importJobs, modelAssets, panoramaAssets, units, type Db, type JobLog, type JobRow } from "@synapse/db";
import { detectFileKind, retryDelayMs } from "@synapse/domain";
import type { ObjectStorage } from "@synapse/storage";

export type JobOutcome =
  | { status: "COMPLETED" | "REQUIRES_REVIEW"; result: Record<string, unknown> }
  | { status: "FAILED"; error: string }
  | { status: "RETRY"; error: string; delayMs: number };

class PermanentFailure extends Error {}

/** Output storage keys (publicly servable under the media base URL). */
const processedPath = (organizationId: string, name: string) => `processed/${organizationId}/${name}`;

/**
 * Processes one claimed IMPORT job and persists the outcome (status, error, result, logs).
 * Never pretends success: unsupported formats and invalid files end FAILED with an explicit message.
 */
export async function processJob(db: Db, job: JobRow, storage: ObjectStorage): Promise<JobOutcome> {
  const logs: JobLog[] = [];
  const log = (level: JobLog["level"], message: string) => logs.push({ at: new Date().toISOString(), level, message });
  let outcome: JobOutcome;
  try {
    outcome = await run(db, job, storage, log);
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

async function run(db: Db, job: JobRow, storage: ObjectStorage, log: (l: JobLog["level"], m: string) => void): Promise<JobOutcome> {
  if (!job.assetId) throw new PermanentFailure("Job has no asset");
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, job.assetId), eq(assets.organizationId, job.organizationId)));
  if (!asset) throw new PermanentFailure("Asset not found");
  if (asset.status !== "UPLOADED" || !asset.storagePath) throw new PermanentFailure(`Asset is ${asset.status}, expected UPLOADED`);

  const bytes = new Uint8Array(await storage.read(asset.storagePath));
  const kind = detectFileKind(bytes);
  log("info", `Processing ${asset.filename} (${bytes.byteLength} bytes, detected ${kind ?? "unknown"})`);

  switch (kind) {
    case "glb":
      return processGlb(db, job, asset.id, bytes, log);
    case "jpeg":
    case "png":
      return processPanorama(db, job, asset.id, bytes, storage, log);
    case "dxf":
      return processDxf(bytes, log);
    case "ifc":
      return processIfc(db, job, asset.id, bytes, storage, log);
    case null:
      throw new PermanentFailure("Unrecognized file signature");
    default:
      // DWG / FBX / OBJ / glTF-JSON / PDF / SVG / WebP: never pretend a conversion happened.
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
  const stats = { meshCount: info.meshCount, materialCount: info.materialCount, sceneCount: info.sceneCount };
  const { modelAssetId, suggestions } = await recordModel(db, job, assetId, info.nodeNames, stats, log);

  return {
    status: "REQUIRES_REVIEW",
    result: {
      kind: "glb",
      modelAssetId,
      nodeCount: info.nodeNames.length,
      meshCount: info.meshCount,
      suggestions,
      note: "Mesh -> unit mappings are suggestions; a human must approve them.",
    },
  };
}

/** Converts IFC geometry to a GLB under processed/; the GLB is only used by the showroom after a human approves it. */
async function processIfc(
  db: Db,
  job: JobRow,
  assetId: string,
  bytes: Uint8Array,
  storage: ObjectStorage,
  log: (l: JobLog["level"], m: string) => void,
): Promise<JobOutcome> {
  let conversion: Awaited<ReturnType<typeof convertIfcToGlb>>;
  try {
    conversion = await convertIfcToGlb(bytes);
  } catch (error) {
    throw new PermanentFailure(`Invalid IFC: ${error instanceof Error ? error.message : String(error)}`);
  }
  const info = inspectGlb(conversion.glb);
  if (!info.ok) throw new PermanentFailure(`IFC conversion produced an invalid GLB: ${info.error}`);
  const glbPath = processedPath(job.organizationId, `${assetId}.glb`);
  await storage.write(glbPath, Buffer.from(conversion.glb), "model/gltf-binary");
  log("info", `IFC converted: ${conversion.buildings.length} buildings, ${conversion.elementCount} elements, ${conversion.triangleCount} triangles`);
  log("warn", IFC_REVIEW_NOTE);

  const stats = { meshCount: info.meshCount, materialCount: info.materialCount, triangleCount: conversion.triangleCount };
  const { modelAssetId, suggestions } = await recordModel(db, job, assetId, info.nodeNames, stats, log);
  return {
    status: "REQUIRES_REVIEW",
    result: {
      kind: "ifc",
      modelAssetId,
      glbPath,
      buildings: conversion.buildings,
      elementCount: conversion.elementCount,
      triangleCount: conversion.triangleCount,
      suggestions,
      note: IFC_REVIEW_NOTE,
    },
  };
}

async function recordModel(
  db: Db,
  job: JobRow,
  assetId: string,
  nodeNames: string[],
  stats: Record<string, unknown>,
  log: (l: JobLog["level"], m: string) => void,
) {
  const [model] = await db
    .insert(modelAssets)
    .values({ organizationId: job.organizationId, assetId, developmentId: job.developmentId, nodeNames, stats })
    .returning();

  const unitRows = job.developmentId
    ? await db
        .select({ id: units.id, code: units.code })
        .from(units)
        .where(and(eq(units.developmentId, job.developmentId), eq(units.organizationId, job.organizationId)))
    : [];
  const unitByCode = new Map(unitRows.map((u) => [u.code, u.id]));
  const suggestions = suggestMeshMappings(nodeNames).map((s) => ({ ...s, unitId: unitByCode.get(s.unitCode) ?? null }));
  log("info", `${suggestions.length} mesh -> unit mappings suggested; ${suggestions.filter((s) => !s.unitId).length} without a matching unit`);
  return { modelAssetId: model?.id, suggestions };
}

async function processPanorama(
  db: Db,
  job: JobRow,
  assetId: string,
  bytes: Uint8Array,
  storage: ObjectStorage,
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

  const outputs = {
    imagePath: processedPath(job.organizationId, `${assetId}.jpg`),
    previewPath: processedPath(job.organizationId, `${assetId}-preview.jpg`),
    thumbnailPath: processedPath(job.organizationId, `${assetId}-thumb.jpg`),
  };
  // Re-encoding strips metadata and guarantees a browser-safe JPEG.
  const source = () => sharp(bytes).rotate();
  const fullImage = await source().resize({ width: 8192, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  await Promise.all([
    storage.write(outputs.imagePath, fullImage, "image/jpeg"),
    source().resize(1024, 512, { fit: "fill" }).jpeg({ quality: 80 }).toBuffer().then((b) => storage.write(outputs.previewPath, b, "image/jpeg")),
    source().resize(320, 180, { fit: "cover" }).jpeg({ quality: 75 }).toBuffer().then((b) => storage.write(outputs.thumbnailPath, b, "image/jpeg")),
  ]);
  const tilesPath = processedPath(job.organizationId, `${assetId}-tiles`);
  const layout = await buildCubeTiles(await decodeEquirect(fullImage), (key, data) => storage.write(`${tilesPath}/${key}`, data, "image/jpeg"));
  const tiles = { path: tilesPath, ...layout };

  const [pano] = await db
    .insert(panoramaAssets)
    .values({ organizationId: job.organizationId, assetId, width, height, ...outputs, tiles })
    .returning();
  log("info", `Generated full image, 1024x512 preview, thumbnail and cube tiles (faces ${layout.faceSizes.join(", ")} px)`);
  return { status: "COMPLETED", result: { kind: "panorama", panoramaAssetId: pano?.id, width, height, ...outputs, tiles } };
}

function processDxf(bytes: Uint8Array, log: (l: JobLog["level"], m: string) => void): JobOutcome {
  const info = inspectDxf(new TextDecoder().decode(bytes));
  log("warn", DXF_REFERENCE_NOTE);
  return { status: "REQUIRES_REVIEW", result: { kind: "dxf", ...info } };
}
