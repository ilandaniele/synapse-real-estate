import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createRequire } from "node:module";
import type SharpFn from "sharp";
import { Asset, Job } from "@synapse/contracts";
import { assets, claimJob, developments, importJobs, panoramaAssets, renderJobs, unitMeshMappings } from "@synapse/db";
import { processJob } from "../../../workers/asset-processing/src/process";
import { NO_RENDER_BACKEND_MESSAGE, processRenderJob } from "../../../workers/render-processing/src/index";
import { ADMIN, buildGlb, createTestContext, EMAILS, uploadFile, type TestContext } from "./helpers";

let ctx: TestContext;
let editor: string;
beforeAll(async () => {
  ctx = await createTestContext();
  editor = await ctx.login(EMAILS.editor);
});
afterAll(() => ctx.close());

// sharp is a dependency of the asset worker, not of the api: resolve it from there.
const sharp = createRequire(path.resolve(__dirname, "../../../workers/asset-processing/package.json"))("sharp") as typeof SharpFn;

const DWG_BYTES = Buffer.concat([Buffer.from("AC1032"), Buffer.alloc(64)]);

async function queueImport(assetId: string, developmentId?: string, cookie = editor) {
  return ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs`, headers: { cookie }, payload: { kind: "IMPORT", assetId, developmentId } });
}

async function claimAndProcess() {
  const job = await claimJob(ctx.db, "IMPORT");
  if (!job) throw new Error("no job claimed");
  const outcome = await processJob(ctx.db, job, ctx.storageDir);
  return { job, outcome };
}

describe("upload flow", () => {
  it("ticket then PUT of a tiny valid GLB is accepted and stored", async () => {
    const glb = buildGlb(["Villa_01"]);
    const { ticketRes, putRes } = await uploadFile(ctx, editor, "model.glb", glb);
    expect(ticketRes.statusCode).toBe(201);
    expect(putRes!.statusCode).toBe(200);
    const asset = Asset.parse(putRes!.json());
    expect(asset).toMatchObject({ status: "UPLOADED", kind: "glb", size: glb.length, rejectionReason: null });
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, asset.id));
    expect(row!.storagePath).toBeTruthy();
    expect(existsSync(path.join(ctx.storageDir, row!.storagePath!))).toBe(true);
    expect(existsSync(path.join(ctx.storageDir, "uploads", ctx.fx.orgA, `${asset.id}.part`))).toBe(false);
  });

  it("AC1032 bytes declared as .glb are REJECTED and the file is removed", async () => {
    const { putRes, assetId } = await uploadFile(ctx, editor, "plan.glb", DWG_BYTES);
    expect(putRes!.statusCode).toBe(422);
    expect(putRes!.json().error.code).toBe("UPLOAD_REJECTED");
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, assetId!));
    expect(row!.status).toBe("REJECTED");
    expect(row!.rejectionReason).toBeTruthy();
    expect(existsSync(path.join(ctx.storageDir, "uploads", ctx.fx.orgA, `${assetId}.part`))).toBe(false);
  });

  it("rejects unsupported extensions and oversize declarations at ticket time", async () => {
    const exe = await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: editor }, payload: { filename: "x.exe", size: 10, contentType: "application/octet-stream" } });
    expect(exe.statusCode).toBe(400);
    const huge = await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: editor }, payload: { filename: "x.glb", size: 5 * 1024 * 1024 * 1024, contentType: "model/gltf-binary" } });
    expect(huge.statusCode).toBe(413);
  });

  it("rejects a body larger than the declared size with 413", async () => {
    const ticket = (
      await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: editor }, payload: { filename: "big.glb", size: 24, contentType: "model/gltf-binary" } })
    ).json() as { assetId: string; uploadUrl: string };
    const url = new URL(ticket.uploadUrl);
    const res = await ctx.app.inject({ method: "PUT", url: `${url.pathname}${url.search}`, headers: { "content-type": "application/octet-stream" }, payload: Buffer.alloc(4096, 1) });
    expect(res.statusCode).toBe(413);
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, ticket.assetId));
    expect(row!.status).toBe("REJECTED");
  });

  it("rejects missing, forged and replayed tokens", async () => {
    const glb = buildGlb(["a"]);
    const ticket = (
      await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: editor }, payload: { filename: "a.glb", size: glb.length, contentType: "model/gltf-binary" } })
    ).json() as { assetId: string; uploadUrl: string };
    const put = (query: string) =>
      ctx.app.inject({ method: "PUT", url: `/api/v1/uploads/${ticket.assetId}${query}`, headers: { "content-type": "application/octet-stream" }, payload: glb });
    expect((await put("")).statusCode).toBe(400);
    expect((await put("?token=garbage-garbage")).statusCode).toBe(401);
    const real = new URL(ticket.uploadUrl).search;
    expect((await put(real)).statusCode).toBe(200);
    const replay = await put(real);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error.code).toBe("UPLOAD_CLOSED");
  });

  it("viewer cannot request an upload ticket", async () => {
    const viewer = await ctx.login(EMAILS.viewer);
    const res = await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: viewer }, payload: { filename: "a.glb", size: 24, contentType: "model/gltf-binary" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("import jobs", () => {
  it("DWG import ends FAILED with the unsupported-format message (never fake conversion)", async () => {
    // A DWG cannot be uploaded as .dwg unless the kind is allowed: use the allowed-extension path and expect a clear status.
    const { putRes, assetId } = await uploadFile(ctx, editor, "casa.dwg", DWG_BYTES);
    expect(putRes!.statusCode).toBe(200);
    const created = await queueImport(assetId!, ctx.fx.devA);
    expect(created.statusCode).toBe(201);
    const jobId = (created.json() as { id: string }).id;

    const { outcome } = await claimAndProcess();
    expect(outcome).toMatchObject({ status: "FAILED" });
    const res = await ctx.app.inject({ method: "GET", url: `${ADMIN}/jobs/${jobId}`, headers: { cookie: editor } });
    const job = Job.parse(res.json());
    expect(job.status).toBe("FAILED");
    expect(job.error).toBe(
      "Format DWG not supported by the automatic pipeline. Export to GLB/glTF from your CAD/BIM tool (e.g. Blender, Revit + exporter) and upload again.",
    );
    expect(job.logs.some((l) => l.level === "error")).toBe(true);
  });

  it("GLB with Villa_ nodes ends REQUIRES_REVIEW with suggestions; approval applies mappings", async () => {
    const glb = buildGlb(["Villa_01", "Villa_03", "Villa_77", "Terrain"]);
    const { putRes, assetId } = await uploadFile(ctx, editor, "masterplan.glb", glb);
    expect(putRes!.statusCode).toBe(200);
    const created = await queueImport(assetId!, ctx.fx.devA);
    const jobId = (created.json() as { id: string }).id;

    const { outcome } = await claimAndProcess();
    expect(outcome.status).toBe("REQUIRES_REVIEW");
    const job = Job.parse((await ctx.app.inject({ method: "GET", url: `${ADMIN}/jobs/${jobId}`, headers: { cookie: editor } })).json());
    expect(job.status).toBe("REQUIRES_REVIEW");
    const suggestions = (job.result as { suggestions: { meshName: string; unitCode: string; unitId: string | null }[] }).suggestions;
    expect(suggestions.map((s) => s.meshName).sort()).toEqual(["Villa_01", "Villa_03", "Villa_77"]);
    expect(suggestions.find((s) => s.meshName === "Villa_01")).toMatchObject({ unitCode: "V1", unitId: ctx.fx.unitA1 });
    expect(suggestions.find((s) => s.meshName === "Villa_03")).toMatchObject({ unitCode: "V3", unitId: ctx.fx.unitA3 });
    expect(suggestions.find((s) => s.meshName === "Villa_77")).toMatchObject({ unitCode: "V77", unitId: null });

    // Nothing is applied before a human approves.
    expect(await ctx.db.select().from(unitMeshMappings).where(eq(unitMeshMappings.developmentId, ctx.fx.devA))).toHaveLength(0);

    const viewer = await ctx.login(EMAILS.viewer);
    expect((await ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs/${jobId}/review`, headers: { cookie: viewer }, payload: { decision: "approve" } })).statusCode).toBe(403);

    const approved = await ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs/${jobId}/review`, headers: { cookie: editor }, payload: { decision: "approve", note: "ok" } });
    expect(approved.statusCode).toBe(200);
    expect(Job.parse(approved.json()).status).toBe("COMPLETED");
    const mappings = await ctx.db.select().from(unitMeshMappings).where(eq(unitMeshMappings.developmentId, ctx.fx.devA));
    expect(mappings.map((m) => m.meshName).sort()).toEqual(["Villa_01", "Villa_03"]);
    const [dev] = await ctx.db.select().from(developments).where(eq(developments.id, ctx.fx.devA));
    expect(dev!.modelPath).toBe(`published/${ctx.fx.orgA}/${assetId}.glb`);
    const served = await ctx.app.inject({ method: "GET", url: `/media/${dev!.modelPath}` });
    expect(served.statusCode).toBe(200);

    const again = await ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs/${jobId}/review`, headers: { cookie: editor }, payload: { decision: "approve" } });
    expect(again.statusCode).toBe(409);
  });

  it("invalid GLB structure fails permanently", async () => {
    const bad = buildGlb(["x"]);
    bad.writeUInt32LE(1, 4); // unsupported container version, magic still glTF
    const { putRes, assetId } = await uploadFile(ctx, editor, "broken.glb", bad);
    expect(putRes!.statusCode).toBe(200);
    await queueImport(assetId!, ctx.fx.devA);
    const { outcome } = await claimAndProcess();
    expect(outcome.status).toBe("FAILED");
    expect("error" in outcome && outcome.error).toMatch(/Invalid GLB/);
  });

  it("2:1 panorama is processed into full, preview and thumbnail files", async () => {
    const png = await sharp({ create: { width: 512, height: 256, channels: 3, background: "#3366aa" } }).png().toBuffer();
    const { putRes, assetId } = await uploadFile(ctx, editor, "pano.png", png);
    expect(putRes!.statusCode).toBe(200);
    await queueImport(assetId!);
    const { outcome } = await claimAndProcess();
    expect(outcome.status).toBe("COMPLETED");
    const [pano] = await ctx.db.select().from(panoramaAssets).where(eq(panoramaAssets.assetId, assetId!));
    expect(pano).toMatchObject({ width: 512, height: 256 });
    for (const p of [pano!.imagePath, pano!.previewPath, pano!.thumbnailPath]) expect(existsSync(path.join(ctx.storageDir, p!))).toBe(true);
    expect((await ctx.app.inject({ method: "GET", url: `/media/${pano!.previewPath}` })).statusCode).toBe(200);
  });

  it("non-2:1 image fails with a clear message", async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000" } }).png().toBuffer();
    const { assetId } = await uploadFile(ctx, editor, "square.png", png);
    await queueImport(assetId!);
    const { outcome } = await claimAndProcess();
    expect(outcome).toEqual({ status: "FAILED", error: "Panorama must be 2:1 equirectangular" });
  });

  it("DXF import requires review and says geometry is not converted", async () => {
    const dxf = Buffer.from("0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nWALLS\n10\n0\n20\n0\n11\n5\n21\n5\n0\nENDSEC\n0\nEOF\n");
    const { putRes, assetId } = await uploadFile(ctx, editor, "plan.dxf", dxf);
    expect(putRes!.statusCode).toBe(200);
    await queueImport(assetId!);
    const { outcome } = await claimAndProcess();
    expect(outcome.status).toBe("REQUIRES_REVIEW");
    expect(JSON.stringify("result" in outcome ? outcome.result : {})).toContain("reference only");
  });

  it("FAILED jobs can be retried, which re-queues them", async () => {
    const { assetId } = await uploadFile(ctx, editor, "again.dwg", DWG_BYTES);
    const jobId = ((await queueImport(assetId!)).json() as { id: string }).id;
    await claimAndProcess();
    const retry = await ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs/${jobId}/retry`, headers: { cookie: editor } });
    expect(retry.statusCode).toBe(200);
    expect(Job.parse(retry.json()).status).toBe("PENDING");
    const pending = await ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs/${jobId}/retry`, headers: { cookie: editor } });
    expect(pending.statusCode).toBe(409);
  });

  it("cannot queue a job for a REJECTED asset", async () => {
    const { assetId } = await uploadFile(ctx, editor, "evil.glb", DWG_BYTES);
    const res = await queueImport(assetId!);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ASSET_NOT_READY");
  });
});

describe("render jobs", () => {
  it("always FAILED with an explicit message when no render backend exists", async () => {
    const { assetId } = await uploadFile(ctx, editor, "scene.glb", buildGlb(["a"]));
    const created = await ctx.app.inject({ method: "POST", url: `${ADMIN}/jobs`, headers: { cookie: editor }, payload: { kind: "RENDER", assetId } });
    expect(created.statusCode).toBe(201);
    const job = await claimJob(ctx.db, "RENDER");
    expect(job).toBeTruthy();
    const outcome = await processRenderJob(ctx.db, job!, {});
    expect(outcome).toBe("FAILED");
    const [row] = await ctx.db.select().from(renderJobs).where(eq(renderJobs.id, job!.id));
    expect(row!.status).toBe("FAILED");
    expect(row!.error).toContain("No render backend");
    // import queue untouched
    expect((await ctx.db.select().from(importJobs).where(eq(importJobs.status, "PROCESSING"))).length).toBe(0);
  });
});

describe("media serving", () => {
  it("never serves raw uploads; serves public output with nosniff and cache headers", async () => {
    const { assetId } = await uploadFile(ctx, editor, "raw.glb", buildGlb(["a"]));
    const [row] = await ctx.db.select().from(assets).where(eq(assets.id, assetId!));
    const raw = await ctx.app.inject({ method: "GET", url: `/media/${row!.storagePath}` });
    expect(raw.statusCode).toBe(404);
    const traversal = await ctx.app.inject({ method: "GET", url: "/media/..%2f..%2fpackage.json" });
    expect([400, 403, 404]).toContain(traversal.statusCode);

    const [pano] = await ctx.db.select().from(panoramaAssets);
    const ok = await ctx.app.inject({ method: "GET", url: `/media/${pano!.thumbnailPath}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["x-content-type-options"]).toBe("nosniff");
    expect(String(ok.headers["cache-control"])).toContain("max-age=");
  });
});
