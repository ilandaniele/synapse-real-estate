import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { assets } from "@synapse/db";
import { validateUpload } from "@synapse/domain";
import { audit } from "./audit";
import { badRequest, conflict, HttpError, notFound } from "./errors";
import { assetToContract } from "./mappers";
import { kindFromFilename, uploadPath } from "./storage";

type AssetRow = typeof assets.$inferSelect;

const HEAD_BYTES = 1024;

/** The organisation's asset, still waiting for its file; 404/409 otherwise. */
export async function findPendingUpload(app: FastifyInstance, assetId: string, organizationId: string): Promise<AssetRow> {
  const [asset] = await app.db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.organizationId, organizationId)));
  if (!asset) throw notFound("Asset");
  if (asset.status !== "PENDING_UPLOAD") throw conflict(`Asset is already ${asset.status}`, "UPLOAD_CLOSED");
  return asset;
}

/** Marks the asset REJECTED, deletes its stored file and returns the error to throw. */
export async function rejectUpload(app: FastifyInstance, asset: AssetRow, reason: string, status: number, code: string): Promise<HttpError> {
  await app.storage.remove(uploadPath(asset.organizationId, asset.id));
  await app.db.update(assets).set({ status: "REJECTED", rejectionReason: reason }).where(eq(assets.id, asset.id));
  await audit(app.db, { userId: asset.uploadedBy, organizationId: asset.organizationId }, "asset.rejected", "asset", asset.id, { reason });
  return new HttpError(status, code, reason);
}

/** Checks the stored file against the declared size and its magic bytes, then marks the asset UPLOADED. */
export async function finalizeUpload(app: FastifyInstance, asset: AssetRow) {
  const declaredKind = kindFromFilename(asset.filename);
  if (!declaredKind) throw badRequest("Unsupported file extension");
  const key = uploadPath(asset.organizationId, asset.id);
  const size = await app.storage.size(key);
  if (size === null) throw conflict("The file has not been uploaded yet", "UPLOAD_MISSING");
  if (size !== asset.declaredSize) {
    throw await rejectUpload(app, asset, `Uploaded ${size} bytes but ${asset.declaredSize} were declared`, 422, "UPLOAD_REJECTED");
  }
  const head = await app.storage.readHead(key, HEAD_BYTES);
  const validation = validateUpload(new Uint8Array(head), size, [declaredKind]);
  if (!validation.ok) {
    throw await rejectUpload(app, asset, `File content does not match the declared type ${declaredKind}: ${validation.reason}`, 422, "UPLOAD_REJECTED");
  }
  const [updated] = await app.db
    .update(assets)
    .set({ status: "UPLOADED", size, kind: validation.kind, storagePath: key })
    .where(eq(assets.id, asset.id))
    .returning();
  return assetToContract(updated!);
}
