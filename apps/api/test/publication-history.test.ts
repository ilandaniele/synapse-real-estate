import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevelopmentManifest, Publication, PublicationDiff } from "@synapse/contracts";
import { auditEvents } from "@synapse/db";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

let ctx: TestContext;
let owner: string;
beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(EMAILS.owner);
});
afterAll(() => ctx.close());

const dev = () => `${ADMIN}/developments/${ctx.fx.devA}`;
const publish = () => ctx.app.inject({ method: "POST", url: `${dev()}/publish`, headers: { cookie: owner } });
const restore = (version: number | string, cookie = owner, devPath = dev()) =>
  ctx.app.inject({ method: "POST", url: `${devPath}/publications/${version}/restore`, headers: { cookie } });
const compare = (query: string, cookie = owner) =>
  ctx.app.inject({ method: "GET", url: `${dev()}/publications/compare?${query}`, headers: { cookie } });
const liveManifest = async () =>
  DevelopmentManifest.parse((await ctx.app.inject({ method: "GET", url: "/api/v1/public/developments/dev-a/manifest" })).json());

describe("publication diff and rollback", () => {
  let originalName: string;

  it("compares two versions entity by entity", async () => {
    expect((await publish()).statusCode).toBe(201);
    originalName = (await liveManifest()).development.name;
    await ctx.app.inject({ method: "PATCH", url: dev(), headers: { cookie: owner }, payload: { name: "Nombre nuevo" } });
    expect((await publish()).statusCode).toBe(201);

    const res = await compare("from=1&to=2");
    expect(res.statusCode).toBe(200);
    const diff = PublicationDiff.parse(res.json());
    expect(diff).toMatchObject({ from: 1, to: 2 });
    expect(diff.changes).toEqual([
      { section: "development", id: ctx.fx.devA, label: "Nombre nuevo", kind: "changed", fields: [{ field: "name", before: originalName, after: "Nombre nuevo" }] },
    ]);
    expect(PublicationDiff.parse((await compare("from=2&to=2")).json()).changes).toEqual([]);
  });

  it("restores an old snapshot as a new version but keeps current commercial status", async () => {
    const sales = await ctx.login(EMAILS.sales);
    await ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA3}/availability`, headers: { cookie: sales }, payload: { status: "SOLD" } });

    const res = await restore(1);
    expect(res.statusCode).toBe(201);
    expect(Publication.parse(res.json())).toMatchObject({ version: 3, restoredFromVersion: 1 });

    const live = await liveManifest();
    expect(live.version).toBe(3);
    expect(live.development.name).toBe(originalName);
    expect(live.units.find((u) => u.code === "V3")!.status).toBe("SOLD");

    const audit = await ctx.db.select().from(auditEvents).where(eq(auditEvents.entityId, ctx.fx.devA));
    expect(audit.find((a) => a.action === "development.restore")?.summary).toMatchObject({ version: 3, restoredFromVersion: 1 });
  });

  it("drops units that are no longer public, with their scenes", async () => {
    await ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA1}`, headers: { cookie: owner }, payload: { status: "UNLISTED" } });
    expect((await restore(1)).statusCode).toBe(201);
    const live = await liveManifest();
    expect(live.units.map((u) => u.code)).toEqual(["V3"]);
    expect(JSON.stringify(live)).not.toContain(ctx.fx.unitA1);
    const sceneIds = new Set(live.scenes.map((s) => s.id));
    for (const s of live.scenes) for (const h of s.hotspots) if (h.targetSceneId) expect(sceneIds.has(h.targetSceneId)).toBe(true);
  });

  it("lists restored versions with their source", async () => {
    const list = await ctx.app.inject({ method: "GET", url: `${dev()}/publications`, headers: { cookie: owner } });
    const rows = (list.json() as unknown[]).map((p) => Publication.parse(p));
    expect(rows.map((p) => [p.version, p.restoredFromVersion])).toEqual([
      [4, 1],
      [3, 1],
      [2, null],
      [1, null],
    ]);
  });

  it("rejects unknown versions, bad queries, other roles and other organizations", async () => {
    expect((await restore(99)).statusCode).toBe(404);
    expect((await restore("abc")).statusCode).toBe(400);
    expect((await compare("from=1&to=99")).statusCode).toBe(404);
    expect((await compare("from=1")).statusCode).toBe(400);
    expect((await restore(1, await ctx.login(EMAILS.sales))).statusCode).toBe(403);
    expect((await compare("from=1&to=2", await ctx.login(EMAILS.viewer))).statusCode).toBe(200);
    const ownerB = await ctx.login(EMAILS.ownerB);
    expect((await restore(1, ownerB)).statusCode).toBe(404);
    expect((await compare("from=1&to=2", ownerB)).statusCode).toBe(404);
    expect((await restore(1, "")).statusCode).toBe(401);
  });
});
