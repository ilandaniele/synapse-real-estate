import { randomUUID } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Asset } from "@synapse/contracts";
import { assets } from "@synapse/db";
import { S3Storage } from "@synapse/storage";
import { ADMIN, buildGlb, createTestContext, EMAILS, uploadFile, type TestContext } from "./helpers";

/** S3 tests need an S3-compatible server: `docker compose up -d s3` and S3_TEST_ENDPOINT=http://localhost:9000. */
const S3_TEST_ENDPOINT = process.env.S3_TEST_ENDPOINT;

async function requestTicket(ctx: TestContext, cookie: string, filename: string, size: number) {
  const res = await ctx.app.inject({
    method: "POST",
    url: `${ADMIN}/assets/uploads`,
    headers: { cookie },
    payload: { filename, size, contentType: "model/gltf-binary" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { assetId: string; uploadUrl: string; requiresCompletion: boolean };
}

const complete = (ctx: TestContext, cookie: string, assetId: string) =>
  ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/${assetId}/complete`, headers: { cookie } });

describe("upload completion with local storage", () => {
  let ctx: TestContext;
  let editor: string;
  beforeAll(async () => {
    ctx = await createTestContext();
    editor = await ctx.login(EMAILS.editor);
  });
  afterAll(() => ctx.close());

  it("issues an API upload URL that needs no completion call", async () => {
    const ticket = await requestTicket(ctx, editor, "model.glb", 64);
    expect(ticket.requiresCompletion).toBe(false);
    expect(ticket.uploadUrl).toContain(`/api/v1/uploads/${ticket.assetId}?token=`);
  });

  it("answers 409 UPLOAD_MISSING before the file arrives", async () => {
    const ticket = await requestTicket(ctx, editor, "model.glb", 64);
    const res = await complete(ctx, editor, ticket.assetId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("UPLOAD_MISSING");
  });

  it("answers 409 UPLOAD_CLOSED once the asset is uploaded", async () => {
    const { assetId } = await uploadFile(ctx, editor, "model.glb", buildGlb(["Villa_01"]));
    const res = await complete(ctx, editor, assetId!);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("UPLOAD_CLOSED");
  });

  it("hides other organisations' assets and refuses roles without asset:upload", async () => {
    const ticket = await requestTicket(ctx, editor, "model.glb", 64);
    expect((await complete(ctx, await ctx.login(EMAILS.ownerB), ticket.assetId)).statusCode).toBe(404);
    expect((await complete(ctx, await ctx.login(EMAILS.viewer), ticket.assetId)).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/${ticket.assetId}/complete` })).statusCode).toBe(401);
  });
});

describe.skipIf(!S3_TEST_ENDPOINT)("presigned uploads with S3 storage", () => {
  const storage = new S3Storage({
    bucket: `synapse-api-test-${randomUUID()}`,
    region: "us-east-1",
    endpoint: S3_TEST_ENDPOINT,
    accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "synapse",
    secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "synapse-dev-only",
    forcePathStyle: true,
  });
  let ctx: TestContext;
  let editor: string;
  beforeAll(async () => {
    await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
    ctx = await createTestContext({ storage, config: { mediaBaseUrl: "https://cdn.example.test" } });
    editor = await ctx.login(EMAILS.editor);
  });
  afterAll(() => ctx?.close());

  const put = (url: string, body: Buffer) => fetch(url, { method: "PUT", headers: { "content-type": "model/gltf-binary" }, body });

  it("uploads straight to the bucket and validates on completion", async () => {
    const glb = buildGlb(["Villa_01"]);
    const ticket = await requestTicket(ctx, editor, "model.glb", glb.length);
    expect(ticket.requiresCompletion).toBe(true);
    expect(ticket.uploadUrl.startsWith(S3_TEST_ENDPOINT!)).toBe(true);
    expect((await put(ticket.uploadUrl, glb)).status).toBe(200);

    const res = await complete(ctx, editor, ticket.assetId);
    expect(res.statusCode).toBe(200);
    expect(Asset.parse(res.json())).toMatchObject({ status: "UPLOADED", kind: "glb", size: glb.length });
  });

  it("rejects content that does not match the extension and deletes the object", async () => {
    const bytes = Buffer.concat([Buffer.from("AC1032"), Buffer.alloc(64)]);
    const ticket = await requestTicket(ctx, editor, "plan.glb", bytes.length);
    expect((await put(ticket.uploadUrl, bytes)).status).toBe(200);

    const res = await complete(ctx, editor, ticket.assetId);
    expect(res.statusCode).toBe(422);
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, ticket.assetId));
    expect(row!.status).toBe("REJECTED");
    expect(await storage.size(`uploads/${ctx.fx.orgA}/${ticket.assetId}`)).toBeNull();
  });

  it("does not expose the API's local upload or media routes", async () => {
    expect((await ctx.app.inject({ method: "PUT", url: `/api/v1/uploads/${randomUUID()}?token=xxxxxxxxxxxx` })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "GET", url: "/media/demo/hero.jpg" })).statusCode).toBe(404);
  });
});
