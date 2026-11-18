import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { assets } from "@synapse/db";
import { badRequest } from "./errors";
import { toStoredPath } from "./storage";

const IMAGE_EXTENSION: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp", svg: "svg" };

/**
 * Resolves an image given as an uploaded asset (copied to published/<org>/ so it can be served)
 * or as a media path / https URL. Returns undefined when neither is given.
 */
export async function resolveImage(
  app: FastifyInstance,
  organizationId: string,
  input: { imageAssetId?: string; imageUrl?: string },
): Promise<string | undefined> {
  if (input.imageAssetId) {
    const [asset] = await app.db
      .select({ id: assets.id, kind: assets.kind, status: assets.status, storagePath: assets.storagePath })
      .from(assets)
      .where(and(eq(assets.id, input.imageAssetId), eq(assets.organizationId, organizationId)));
    const extension = asset?.kind ? IMAGE_EXTENSION[asset.kind] : undefined;
    if (!asset || asset.status !== "UPLOADED" || !asset.storagePath || !extension) {
      throw badRequest("imageAssetId must be an uploaded JPEG, PNG, WebP or SVG asset");
    }
    const published = `published/${organizationId}/${asset.id}.${extension}`;
    await app.storage.copy(asset.storagePath, published);
    return published;
  }
  if (input.imageUrl) {
    const stored = toStoredPath(app.config, input.imageUrl);
    if (!stored) throw badRequest("imageUrl must be an https URL or a path under /media/");
    return stored;
  }
  return undefined;
}
