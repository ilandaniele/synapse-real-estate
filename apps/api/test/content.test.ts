import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type SharpFn from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FloorPlan, GalleryItem, PointOfInterest, Scene } from "@synapse/contracts";
import { ADMIN, createTestContext, EMAILS, uploadFile, type TestContext } from "./helpers";

const sharp = createRequire(path.resolve(import.meta.dirname, "../../../workers/asset-processing/package.json"))("sharp") as typeof SharpFn;

let ctx: TestContext;
let editor: string;
let viewer: string;
let ownerB: string;
beforeAll(async () => {
  ctx = await createTestContext();
  [editor, viewer, ownerB] = await Promise.all([ctx.login(EMAILS.editor), ctx.login(EMAILS.viewer), ctx.login(EMAILS.ownerB)]);
});
afterAll(() => ctx.close());

const send = (method: "POST" | "PATCH" | "DELETE" | "GET", url: string, cookie: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

const galleryBody = { title: "Piscina", imageUrl: "/media/demo/gallery/b.jpg", credit: "Render propio", sortOrder: 2 };
const poiBody = { name: "Colegio", category: "SCHOOL", lat: 36.52, lng: -4.87, distanceText: "10 min" };
const floorPlanBody = { name: "Planta alta", imageUrl: "/media/demo/floorplans/villa-6.svg", width: 1000, height: 700 };

describe("gallery CRUD", () => {
  it("creates, updates and deletes an item with audit-friendly responses", async () => {
    const created = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, editor, { ...galleryBody, unitId: ctx.fx.unitA1 });
    expect(created.statusCode).toBe(201);
    const item = GalleryItem.parse(created.json());
    expect(item).toMatchObject({ title: "Piscina", unitId: ctx.fx.unitA1, sortOrder: 2 });
    expect(item.imageUrl).toMatch(/\/media\/demo\/gallery\/b\.jpg$/);

    const patched = await send("PATCH", `${ADMIN}/gallery/${item.id}`, editor, { title: "Piscina climatizada" });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ title: "Piscina climatizada", credit: "Render propio", sortOrder: 2, unitId: ctx.fx.unitA1 });

    expect((await send("DELETE", `${ADMIN}/gallery/${item.id}`, editor)).statusCode).toBe(204);
    const list = await send("GET", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, editor);
    expect((list.json() as GalleryItem[]).map((g) => g.id)).not.toContain(item.id);
  });

  it("publishes an uploaded image asset under published/<org>/", async () => {
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#3366aa" } }).png().toBuffer();
    const { putRes, assetId } = await uploadFile(ctx, editor, "fachada.png", png);
    expect(putRes?.statusCode).toBe(200);
    const res = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, editor, { title: "Fachada", imageAssetId: assetId });
    expect(res.statusCode).toBe(201);
    const published = `published/${ctx.fx.orgA}/${assetId}.png`;
    expect(res.json().imageUrl).toMatch(new RegExp(`/media/${published}$`));
    expect(existsSync(path.join(ctx.storageDir, published))).toBe(true);
  });

  it("rejects missing images, unsafe paths, non-image assets and foreign units", async () => {
    const url = `${ADMIN}/developments/${ctx.fx.devA}/gallery`;
    expect((await send("POST", url, editor, { title: "Sin imagen" })).statusCode).toBe(400);
    expect((await send("POST", url, editor, { title: "x", imageUrl: "/media/uploads/a.jpg" })).statusCode).toBe(400);
    expect((await send("POST", url, editor, { title: "x", imageUrl: "javascript:alert(1)" })).statusCode).toBe(400);
    expect((await send("POST", url, editor, { ...galleryBody, unitId: ctx.fx.unitB1 })).statusCode).toBe(400);
    expect((await send("POST", url, editor, { ...galleryBody, title: "" })).statusCode).toBe(400);
    const pdf = await uploadFile(ctx, editor, "memoria.pdf", Buffer.from("%PDF-1.4\n%test\n"));
    if (pdf.assetId) expect((await send("POST", url, editor, { title: "x", imageAssetId: pdf.assetId })).statusCode).toBe(400);
  });
});

describe("points of interest CRUD", () => {
  it("creates, updates and deletes a point of interest", async () => {
    const created = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/points-of-interest`, editor, poiBody);
    expect(created.statusCode).toBe(201);
    const poi = PointOfInterest.parse(created.json());

    const patched = await send("PATCH", `${ADMIN}/points-of-interest/${poi.id}`, editor, { distanceText: null });
    expect(patched.json()).toMatchObject({ name: "Colegio", category: "SCHOOL", distanceText: null });

    expect((await send("DELETE", `${ADMIN}/points-of-interest/${poi.id}`, editor)).statusCode).toBe(204);
    expect((await send("DELETE", `${ADMIN}/points-of-interest/${poi.id}`, editor)).statusCode).toBe(404);
  });

  it("validates category and coordinates", async () => {
    const url = `${ADMIN}/developments/${ctx.fx.devA}/points-of-interest`;
    expect((await send("POST", url, editor, { ...poiBody, category: "CASINO" })).statusCode).toBe(400);
    expect((await send("POST", url, editor, { ...poiBody, lat: 91 })).statusCode).toBe(400);
  });
});

describe("floor plans CRUD", () => {
  it("creates, updates and deletes a floor plan", async () => {
    const created = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/floor-plans`, editor, floorPlanBody);
    expect(created.statusCode).toBe(201);
    const plan = FloorPlan.parse(created.json());
    expect(plan.unitId).toBeNull();

    const patched = await send("PATCH", `${ADMIN}/floor-plans/${plan.id}`, editor, { unitId: ctx.fx.unitA2, width: 1200 });
    expect(patched.json()).toMatchObject({ unitId: ctx.fx.unitA2, width: 1200, height: 700, name: "Planta alta" });

    expect((await send("DELETE", `${ADMIN}/floor-plans/${plan.id}`, editor)).statusCode).toBe(204);
  });

  it("rejects non-positive dimensions", async () => {
    const res = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/floor-plans`, editor, { ...floorPlanBody, width: 0 });
    expect(res.statusCode).toBe(400);
  });
});

describe("scene patch", () => {
  it("keeps fields the patch leaves out, such as sortOrder", async () => {
    const url = `${ADMIN}/scenes/${ctx.fx.sceneA1}`;
    expect((await send("PATCH", url, editor, { sortOrder: 4 })).statusCode).toBe(200);
    const renamed = await send("PATCH", url, editor, { name: "Salón" });
    expect(Scene.parse(renamed.json())).toMatchObject({ name: "Salón", sortOrder: 4 });
  });
});

describe("content access control", () => {
  it("requires a session (401) and development:write (403)", async () => {
    const anonymous = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/points-of-interest`, payload: poiBody });
    expect(anonymous.statusCode).toBe(401);
    for (const [url, body] of [
      [`${ADMIN}/developments/${ctx.fx.devA}/gallery`, galleryBody],
      [`${ADMIN}/developments/${ctx.fx.devA}/points-of-interest`, poiBody],
      [`${ADMIN}/developments/${ctx.fx.devA}/floor-plans`, floorPlanBody],
    ] as const) {
      expect((await send("POST", url, viewer, body)).statusCode, url).toBe(403);
    }
  });

  it("hides org A content from org B (404) and leaves it unchanged", async () => {
    const [gallery, pois, plans] = await Promise.all(
      ["gallery", "points-of-interest", "floor-plans"].map((kind) => send("GET", `${ADMIN}/developments/${ctx.fx.devA}/${kind}`, editor)),
    );
    const ids = { gallery: gallery!.json()[0].id, poi: pois!.json()[0].id, plan: plans!.json()[0].id };
    const attempts = [
      send("POST", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, ownerB, galleryBody),
      send("PATCH", `${ADMIN}/gallery/${ids.gallery}`, ownerB, { title: "Pwned" }),
      send("DELETE", `${ADMIN}/gallery/${ids.gallery}`, ownerB),
      send("PATCH", `${ADMIN}/points-of-interest/${ids.poi}`, ownerB, { name: "Pwned" }),
      send("DELETE", `${ADMIN}/points-of-interest/${ids.poi}`, ownerB),
      send("PATCH", `${ADMIN}/floor-plans/${ids.plan}`, ownerB, { name: "Pwned" }),
      send("DELETE", `${ADMIN}/floor-plans/${ids.plan}`, ownerB),
    ];
    for (const res of await Promise.all(attempts)) expect(res.statusCode).toBe(404);
    const after = await send("GET", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, editor);
    expect((after.json() as GalleryItem[]).find((g) => g.id === ids.gallery)?.title).toBe("Fachada");
  });

  it("does not accept another org's uploaded asset as an image", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
    const { assetId } = await uploadFile(ctx, ownerB, "b.png", png);
    const res = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, editor, { title: "x", imageAssetId: assetId });
    expect(res.statusCode).toBe(400);
  });
});
