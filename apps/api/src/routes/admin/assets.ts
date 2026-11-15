import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UploadRequest, UploadTicket as UploadTicketSchema } from "@synapse/contracts";
import { assets } from "@synapse/db";
import { MAX_UPLOAD_BYTES, validateUpload } from "@synapse/domain";
import { audit } from "../../lib/audit";
import { session } from "../../lib/auth";
import { badRequest, conflict, HttpError, notFound, unauthorized } from "../../lib/errors";
import { assetToContract, iso } from "../../lib/mappers";
import { kindFromFilename, resolveInside, signUploadToken, UPLOAD_TOKEN_TTL_SECONDS, uploadPath, verifyUploadToken } from "../../lib/storage";

const UploadParams = z.object({ assetId: z.string().uuid() });
const UploadQuery = z.object({ token: z.string().min(10) });

/** `POST /assets/uploads` and `GET /assets` (mounted under /api/v1/admin). */
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
    const token = await signUploadToken(app.config, { assetId: id, organizationId: actor.organizationId });
    const ticket: z.infer<typeof UploadTicketSchema> = {
      assetId: id,
      uploadUrl: `${app.config.publicApiUrl}/api/v1/uploads/${id}?token=${encodeURIComponent(token)}`,
      expiresAt: iso(expiresAt),
    };
    return reply.status(201).send(ticket);
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

/** `PUT /api/v1/uploads/:assetId?token=` - raw body streaming, authenticated by the signed upload token. */
export async function uploadRoutes(app: FastifyInstance) {
  // Raw bodies are streamed to disk instead of buffered; the 1 MB limit applies to every other route.
  app.addContentTypeParser("*", (_request, payload, done) => done(null, payload));

  app.put("/uploads/:assetId", async (request, reply) => {
    const { assetId } = UploadParams.parse(request.params);
    const { token } = UploadQuery.parse(request.query);
    const claims = await verifyUploadToken(app.config, token);
    if (!claims || claims.assetId !== assetId) throw unauthorized("Invalid or expired upload token");

    const [asset] = await app.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.organizationId, claims.organizationId)));
    if (!asset) throw notFound("Asset");
    if (asset.status !== "PENDING_UPLOAD") throw conflict(`Asset is already ${asset.status}`, "UPLOAD_CLOSED");
    const declaredKind = kindFromFilename(asset.filename);
    if (!declaredKind) throw badRequest("Unsupported file extension");

    const finalPath = resolveInside(app.config.storageDir, uploadPath(asset.organizationId, asset.id));
    const tempPath = `${finalPath}.part`;
    await mkdir(path.dirname(finalPath), { recursive: true });

    const reject = async (reason: string, status: number, code: string) => {
      await rm(tempPath, { force: true });
      await app.db.update(assets).set({ status: "REJECTED", rejectionReason: reason }).where(eq(assets.id, asset.id));
      await audit(app.db, { userId: asset.uploadedBy, organizationId: asset.organizationId }, "asset.rejected", "asset", asset.id, { reason });
      reply.header("Connection", "close");
      return new HttpError(status, code, reason);
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
    if (received !== asset.declaredSize) {
      throw await reject(`Uploaded ${received} bytes but ${asset.declaredSize} were declared`, 422, "UPLOAD_REJECTED");
    }

    const handle = await open(tempPath, "r");
    const head = Buffer.alloc(Math.min(1024, received));
    try {
      await handle.read(head, 0, head.length, 0);
    } finally {
      await handle.close();
    }
    const validation = validateUpload(new Uint8Array(head), received, [declaredKind]);
    if (!validation.ok) {
      throw await reject(`File content does not match the declared type ${declaredKind}: ${validation.reason}`, 422, "UPLOAD_REJECTED");
    }

    await rename(tempPath, finalPath);
    const [updated] = await app.db
      .update(assets)
      .set({ status: "UPLOADED", size: received, kind: validation.kind, storagePath: uploadPath(asset.organizationId, asset.id) })
      .where(eq(assets.id, asset.id))
      .returning();
    return assetToContract(updated!);
  });
}
