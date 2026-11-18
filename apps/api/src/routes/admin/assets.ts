import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UploadRequest, UploadTicket as UploadTicketSchema } from "@synapse/contracts";
import { assets } from "@synapse/db";
import { MAX_UPLOAD_BYTES } from "@synapse/domain";
import { LocalStorage, S3Storage } from "@synapse/storage";
import { audit } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, HttpError, unauthorized } from "../../lib/errors";
import { assetToContract, iso } from "../../lib/mappers";
import { kindFromFilename, signUploadToken, UPLOAD_TOKEN_TTL_SECONDS, uploadPath, verifyUploadToken } from "../../lib/storage";
import { finalizeUpload, findPendingUpload, rejectUpload } from "../../lib/uploads";

const UploadParams = z.object({ assetId: z.string().uuid() });
const AssetParams = z.object({ id: z.string().uuid() });
const UploadQuery = z.object({ token: z.string().min(10) });

/** Presigned bucket PUT (S3), or the API's own token-authenticated PUT (local storage). */
async function uploadUrlFor(app: FastifyInstance, organizationId: string, assetId: string, input: z.infer<typeof UploadRequest>) {
  if (app.storage instanceof S3Storage) {
    return app.storage.presignPut(uploadPath(organizationId, assetId), {
      contentType: input.contentType,
      size: input.size,
      expiresInSeconds: UPLOAD_TOKEN_TTL_SECONDS,
    });
  }
  const token = await signUploadToken(app.config, { assetId, organizationId });
  return `${app.config.publicApiUrl}/api/v1/uploads/${assetId}?token=${encodeURIComponent(token)}`;
}

/** `POST /assets/uploads`, `POST /assets/:id/complete` and `GET /assets` (mounted under /api/v1/admin). */
export async function assetAdminRoutes(app: FastifyInstance) {
  app.post("/assets/uploads", { preHandler: app.requireAuth("asset:upload") }, async (request, reply) => {
    const actor = session(request);
    const input = UploadRequest.parse(request.body);
    const kind = kindFromFilename(input.filename);
    if (!kind) throw badRequest("Unsupported file extension");
    if (input.size > MAX_UPLOAD_BYTES[kind]) {
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", `File exceeds the ${MAX_UPLOAD_BYTES[kind] / (1024 * 1024)} MB limit for ${kind}`);
    }
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_SECONDS * 1000);
    await app.db.transaction(async (tx) => {
      await tx.insert(assets).values({
        id,
        organizationId: actor.organizationId,
        uploadedBy: actor.userId,
        filename: path.basename(input.filename.replace(/\\/g, "/")).slice(0, 200),
        kind,
        declaredContentType: input.contentType,
        declaredSize: input.size,
        status: "PENDING_UPLOAD",
      });
      await audit(tx, actor, "asset.upload_requested", "asset", id, { kind, size: input.size });
    });
    const ticket: z.infer<typeof UploadTicketSchema> = {
      assetId: id,
      uploadUrl: await uploadUrlFor(app, actor.organizationId, id, input),
      expiresAt: iso(expiresAt),
      requiresCompletion: !(app.storage instanceof LocalStorage),
    };
    return reply.status(201).send(ticket);
  });

  app.post("/assets/:id/complete", { preHandler: app.requireAuth("asset:upload") }, async (request) => {
    const { id } = AssetParams.parse(request.params);
    const asset = await findPendingUpload(app, id, session(request).organizationId);
    return finalizeUpload(app, asset);
  });

  app.get("/assets", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const rows = await app.db
      .select()
      .from(assets)
      .where(eq(assets.organizationId, organizationId))
      .orderBy(desc(assets.createdAt))
      .limit(200);
    return rows.map(assetToContract);
  });
}

/** `PUT /api/v1/uploads/:assetId?token=` - raw body streaming, authenticated by the signed upload token. Local storage only. */
export async function uploadRoutes(app: FastifyInstance) {
  const storage = app.storage;
  if (!(storage instanceof LocalStorage)) return;
  // Raw bodies are streamed to disk instead of buffered; the 1 MB limit applies to every other route.
  app.addContentTypeParser("*", (_request, payload, done) => done(null, payload));

  app.put("/uploads/:assetId", async (request, reply) => {
    const { assetId } = UploadParams.parse(request.params);
    const { token } = UploadQuery.parse(request.query);
    const claims = await verifyUploadToken(app.config, token);
    if (!claims || claims.assetId !== assetId) throw unauthorized("Invalid or expired upload token");

    const asset = await findPendingUpload(app, assetId, claims.organizationId);
    const finalPath = storage.resolve(uploadPath(asset.organizationId, asset.id));
    const tempPath = `${finalPath}.part`;
    await mkdir(path.dirname(finalPath), { recursive: true });

    const reject = async (reason: string, status: number, code: string) => {
      await rm(tempPath, { force: true });
      reply.header("Connection", "close");
      return rejectUpload(app, asset, reason, status, code);
    };

    // Manual copy instead of stream.pipeline: pipeline would destroy the request (and its socket) on error,
    // so the client would see a connection reset instead of the 413/422 response.
    const source = request.body as Readable;
    let received = 0;
    let exceeded = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tempPath);
        out.on("error", reject);
        out.on("close", () => resolve());
        source.on("error", reject);
        source.on("end", () => out.end());
        source.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > asset.declaredSize) {
            exceeded = true;
            source.pause();
            source.removeAllListeners("data");
            out.destroy();
          } else if (!out.write(chunk)) {
            source.pause();
            out.once("drain", () => source.resume());
          }
        });
      });
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
    if (exceeded) throw await reject(`Upload exceeds the declared size of ${asset.declaredSize} bytes`, 413, "PAYLOAD_TOO_LARGE");
    await rename(tempPath, finalPath);
    return finalizeUpload(app, asset);
  });
}
