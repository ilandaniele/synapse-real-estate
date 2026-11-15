import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, createTestContext, EMAILS, unitBody, type TestContext } from "./helpers";

let ctx: TestContext;
let cookieB: string;
beforeAll(async () => {
  ctx = await createTestContext();
  cookieB = await ctx.login(EMAILS.ownerB);
});
afterAll(() => ctx.close());

const get = (url: string) => ctx.app.inject({ method: "GET", url, headers: { cookie: cookieB } });

describe("multitenant isolation (owner of org B against org A resources)", () => {
  it("returns 404 for org A unit, scene, hotspots, lead and development", async () => {
    for (const url of [
      `${ADMIN}/units/${ctx.fx.unitA1}`,
      `${ADMIN}/scenes/${ctx.fx.sceneA1}`,
      `${ADMIN}/scenes/${ctx.fx.sceneA1}/hotspots`,
      `${ADMIN}/leads/${ctx.fx.leadA}`,
      `${ADMIN}/developments/${ctx.fx.devA}`,
      `${ADMIN}/developments/${ctx.fx.devA}/units`,
      `${ADMIN}/developments/${ctx.fx.devA}/scenes`,
      `${ADMIN}/developments/${ctx.fx.devA}/publications`,
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    }
  });

  it("returns 404 for mutations against org A resources and changes nothing", async () => {
    const attempts = [
      ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA1}`, headers: { cookie: cookieB }, payload: { name: "Pwned" } }),
      ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA1}/availability`, headers: { cookie: cookieB }, payload: { status: "SOLD" } }),
      ctx.app.inject({ method: "DELETE", url: `${ADMIN}/units/${ctx.fx.unitA1}`, headers: { cookie: cookieB } }),
      ctx.app.inject({ method: "PATCH", url: `${ADMIN}/scenes/${ctx.fx.sceneA1}`, headers: { cookie: cookieB }, payload: { name: "Pwned" } }),
      ctx.app.inject({
        method: "POST",
        url: `${ADMIN}/scenes/${ctx.fx.sceneA1}/hotspots`,
        headers: { cookie: cookieB },
        payload: { type: "INFO", label: "x", yaw: 0, pitch: 0, targetSceneId: null },
      }),
      ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/units`, headers: { cookie: cookieB }, payload: unitBody() }),
      ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/publish`, headers: { cookie: cookieB } }),
      ctx.app.inject({ method: "DELETE", url: `${ADMIN}/developments/${ctx.fx.devA}`, headers: { cookie: cookieB } }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.statusCode).toBe(404);

    const cookieA = await ctx.login(EMAILS.owner);
    const unit = await ctx.app.inject({ method: "GET", url: `${ADMIN}/units/${ctx.fx.unitA1}`, headers: { cookie: cookieA } });
    expect(unit.json()).toMatchObject({ name: "Villa V1", status: "AVAILABLE" });
  });

  it("cannot link a hotspot or scene to another organization's resources", async () => {
    const hotspot = await ctx.app.inject({
      method: "POST",
      url: `${ADMIN}/scenes/${ctx.fx.sceneB1}/hotspots`,
      headers: { cookie: cookieB },
      payload: { type: "NAVIGATION", label: "Leak", yaw: 0, pitch: 0, targetSceneId: ctx.fx.sceneA1 },
    });
    expect(hotspot.statusCode).toBe(400);
    const scene = await ctx.app.inject({
      method: "POST",
      url: `${ADMIN}/developments/${ctx.fx.devB}/scenes`,
      headers: { cookie: cookieB },
      payload: { unitId: ctx.fx.unitA1, slug: "x", name: "X", panoramaUrl: "demo/panoramas/x.jpg" },
    });
    expect(scene.statusCode).toBe(400);
  });

  it("list endpoints never leak org A rows", async () => {
    const devs = (await get(`${ADMIN}/developments`)).json() as { id: string }[];
    expect(devs.map((d) => d.id)).toEqual([ctx.fx.devB]);

    const leads = (await get(`${ADMIN}/leads`)).json() as { items: { id: string }[]; total: number };
    expect(leads.items.map((l) => l.id)).toEqual([ctx.fx.leadB]);
    expect(leads.total).toBe(1);

    const filtered = (await get(`${ADMIN}/leads?developmentId=${ctx.fx.devA}`)).json() as { items: unknown[]; total: number };
    expect(filtered).toMatchObject({ items: [], total: 0 });

    const csv = (await get(`${ADMIN}/leads/export.csv`)).body;
    expect(csv).toContain("beto@example.com");
    expect(csv).not.toContain("ana@example.com");

    const dashboard = (await get(`${ADMIN}/dashboard`)).json() as { unitsByStatus: Record<string, number> };
    expect(dashboard.unitsByStatus).toMatchObject({ AVAILABLE: 1, RESERVED: 0, SOLD: 0, UNLISTED: 0 });

    expect((await get(`${ADMIN}/jobs`)).json()).toEqual([]);
    expect((await get(`${ADMIN}/assets`)).json()).toEqual([]);
  });

  it("an upload token from one organization cannot be used for another's asset", async () => {
    const cookieA = await ctx.login(EMAILS.owner);
    const ticketA = (
      await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: cookieA }, payload: { filename: "a.glb", size: 24, contentType: "model/gltf-binary" } })
    ).json() as { assetId: string };
    const ticketB = (
      await ctx.app.inject({ method: "POST", url: `${ADMIN}/assets/uploads`, headers: { cookie: cookieB }, payload: { filename: "b.glb", size: 24, contentType: "model/gltf-binary" } })
    ).json() as { uploadUrl: string };
    const tokenB = new URL(ticketB.uploadUrl).searchParams.get("token");
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${ticketA.assetId}?token=${tokenB}`,
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.alloc(24),
    });
    expect(res.statusCode).toBe(401);
  });
});
