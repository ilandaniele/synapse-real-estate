import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevelopmentManifest, Publication } from "@synapse/contracts";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

let ctx: TestContext;
let owner: string;
beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(EMAILS.owner);
});
afterAll(() => ctx.close());

const publish = () => ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/publish`, headers: { cookie: owner } });
const manifest = (headers: Record<string, string> = {}) =>
  ctx.app.inject({ method: "GET", url: "/api/v1/public/developments/dev-a/manifest", headers });

describe("publishing", () => {
  it("has no public manifest before the first publication", async () => {
    expect((await manifest()).statusCode).toBe(404);
  });

  it("creates version 1, then N+1, and the manifest excludes UNLISTED units", async () => {
    const first = await publish();
    expect(first.statusCode).toBe(201);
    expect(Publication.parse(first.json()).version).toBe(1);
    const second = await publish();
    expect(Publication.parse(second.json()).version).toBe(2);

    const list = await ctx.app.inject({ method: "GET", url: `${ADMIN}/developments/${ctx.fx.devA}/publications`, headers: { cookie: owner } });
    expect((list.json() as { version: number }[]).map((p) => p.version).sort()).toEqual([1, 2]);

    const res = await manifest();
    expect(res.statusCode).toBe(200);
    const m = DevelopmentManifest.parse(res.json());
    expect(m.version).toBe(2);
    const codes = m.units.map((u) => u.code).sort();
    expect(codes).toEqual(["V1", "V3"]);
    expect(JSON.stringify(m)).not.toContain(ctx.fx.unitA2);
    expect(m.units.find((u) => u.code === "V3")!.status).toBe("RESERVED");
    expect(m.scenes.map((s) => s.slug).sort()).toEqual(["cocina", "living"]);
  });

  it("serves ETag + Cache-Control and answers 304 for If-None-Match", async () => {
    const res = await manifest();
    const etag = String(res.headers.etag);
    expect(etag).toMatch(/^"[0-9a-f-]{36}"$/);
    expect(res.headers["cache-control"]).toContain("public");
    const cached = await manifest({ "if-none-match": etag });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
  });

  it("a status change shows up only after the next publish", async () => {
    const sales = await ctx.login(EMAILS.sales);
    await ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA1}/availability`, headers: { cookie: sales }, payload: { status: "SOLD" } });
    const before = DevelopmentManifest.parse((await manifest()).json());
    expect(before.units.find((u) => u.code === "V1")!.status).toBe("AVAILABLE");
    await publish();
    const after = DevelopmentManifest.parse((await manifest()).json());
    expect(after.version).toBe(3);
    expect(after.units.find((u) => u.code === "V1")!.status).toBe("SOLD");
  });

  it("drops hotspots whose target scene is no longer published", async () => {
    // Un-list V1: its scenes belong to V1, so they disappear from the manifest and nothing dangles.
    await ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA1}`, headers: { cookie: owner }, payload: { status: "UNLISTED" } });
    expect((await publish()).statusCode).toBe(201);
    const m = DevelopmentManifest.parse((await manifest()).json());
    expect(m.units.map((u) => u.code)).toEqual(["V3"]);
    const sceneIds = new Set(m.scenes.map((s) => s.id));
    for (const s of m.scenes) for (const h of s.hotspots) if (h.targetSceneId) expect(sceneIds.has(h.targetSceneId)).toBe(true);
  });

  it("returns 404 for a slug of a development that was never published", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/public/developments/dev-b/manifest" })).statusCode).toBe(404);
  });
});
