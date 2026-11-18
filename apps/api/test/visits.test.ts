import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { VisitAnalytics } from "@synapse/contracts";
import { visitStats } from "@synapse/db";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

let ctx: TestContext;
let viewer: string;

beforeAll(async () => {
  ctx = await createTestContext();
  viewer = await ctx.login(EMAILS.viewer);
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.delete(visitStats);
});

const visit = (kind: "UNIT" | "SCENE", targetId: string, developmentSlug = "dev-a") =>
  ctx.app.inject({ method: "POST", url: "/api/v1/public/visits", payload: { developmentSlug, kind, targetId } });

const analytics = (cookie = viewer, developmentId = ctx.fx.devA, query = "") =>
  ctx.app.inject({ method: "GET", url: `${ADMIN}/developments/${developmentId}/analytics${query}`, headers: { cookie } });

describe("POST /public/visits", () => {
  it("adds up views per unit and scene in one daily counter", async () => {
    for (const _ of [1, 2, 3]) expect((await visit("UNIT", ctx.fx.unitA1)).statusCode).toBe(204);
    await visit("UNIT", ctx.fx.unitA3);
    await visit("SCENE", ctx.fx.sceneA2);
    await visit("SCENE", ctx.fx.sceneA2);

    expect(await ctx.db.select().from(visitStats)).toHaveLength(3);
    const res = await analytics();
    expect(res.statusCode).toBe(200);
    const body = VisitAnalytics.parse(res.json());
    expect(body.days).toBe(30);
    expect(body.units).toEqual([
      { id: ctx.fx.unitA1, code: "V1", name: expect.any(String), views: 3 },
      { id: ctx.fx.unitA3, code: "V3", name: expect.any(String), views: 1 },
    ]);
    expect(body.scenes).toEqual([{ id: ctx.fx.sceneA2, name: "cocina", unitCode: "V1", views: 2 }]);
  });

  it("ignores unlisted units, unknown ids and targets of another development", async () => {
    const ignored = [
      await visit("UNIT", ctx.fx.unitA2),
      await visit("UNIT", "00000000-0000-4000-8000-000000000000"),
      await visit("SCENE", ctx.fx.sceneB1),
      await visit("UNIT", ctx.fx.sceneA1),
      await visit("UNIT", ctx.fx.unitA1, "no-existe"),
    ];
    expect(ignored.map((res) => res.statusCode)).toEqual([204, 204, 204, 204, 204]);
    expect(await ctx.db.select().from(visitStats)).toHaveLength(0);
  });

  it("rejects malformed events", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/v1/public/visits", payload: { developmentSlug: "dev-a", kind: "PAGE", targetId: "x" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /admin/developments/:id/analytics", () => {
  it("returns empty lists for a development without visits", async () => {
    expect(VisitAnalytics.parse((await analytics()).json())).toEqual({ days: 30, units: [], scenes: [] });
  });

  it("only counts days inside the range", async () => {
    await visit("UNIT", ctx.fx.unitA1);
    const old = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString().slice(0, 10);
    await ctx.db.insert(visitStats).values({ organizationId: ctx.fx.orgA, developmentId: ctx.fx.devA, day: old, kind: "UNIT", targetId: ctx.fx.unitA1, views: 5 });

    expect(VisitAnalytics.parse((await analytics(viewer, ctx.fx.devA, "?days=7")).json()).units[0]!.views).toBe(1);
    expect(VisitAnalytics.parse((await analytics(viewer, ctx.fx.devA, "?days=30")).json()).units[0]!.views).toBe(6);
    expect((await analytics(viewer, ctx.fx.devA, "?days=15")).statusCode).toBe(400);
  });

  it("requires a session and hides other organizations' developments", async () => {
    const anonymous = await ctx.app.inject({ method: "GET", url: `${ADMIN}/developments/${ctx.fx.devA}/analytics` });
    expect(anonymous.statusCode).toBe(401);
    await visit("UNIT", ctx.fx.unitA1);
    const ownerB = await ctx.login(EMAILS.ownerB);
    expect((await analytics(ownerB)).statusCode).toBe(404);
  });
});
