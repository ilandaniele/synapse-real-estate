import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevelopmentManifest, Hotspot, Scene, Unit } from "@synapse/contracts";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

let ctx: TestContext;
let editor: string;
beforeAll(async () => {
  ctx = await createTestContext();
  editor = await ctx.login(EMAILS.owner);
});
afterAll(() => ctx.close());

const send = (method: "POST" | "PATCH" | "GET", url: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: { cookie: editor }, ...(payload ? { payload } : {}) });

describe("content translations", () => {
  it("saves a unit's English text and keeps it when another field is patched", async () => {
    const en = { name: "Villa One", description: "Sea views" };
    const saved = await send("PATCH", `${ADMIN}/units/${ctx.fx.unitA1}`, { translations: { en } });
    expect(saved.statusCode).toBe(200);
    expect(Unit.parse(saved.json()).translations).toEqual({ en });

    const patched = await send("PATCH", `${ADMIN}/units/${ctx.fx.unitA1}`, { bedrooms: 5 });
    expect(Unit.parse(patched.json()).translations).toEqual({ en });
  });

  it("saves scene and hotspot translations", async () => {
    const scene = await send("PATCH", `${ADMIN}/scenes/${ctx.fx.sceneA1}`, { translations: { en: { name: "Living room" } } });
    expect(scene.statusCode).toBe(200);
    expect(Scene.parse(scene.json()).translations).toEqual({ en: { name: "Living room" } });

    const hotspot = await send("POST", `${ADMIN}/scenes/${ctx.fx.sceneA1}/hotspots`, {
      type: "INFO",
      label: "Chimenea",
      yaw: 0,
      pitch: 0,
      targetSceneId: null,
      description: "De leña",
      translations: { en: { label: "Fireplace", description: "Wood-burning" } },
    });
    expect(hotspot.statusCode).toBe(201);
    expect(Hotspot.parse(hotspot.json()).translations).toEqual({ en: { label: "Fireplace", description: "Wood-burning" } });
  });

  it("saves development, point of interest, gallery and floor plan translations", async () => {
    const dev = await send("PATCH", `${ADMIN}/developments/${ctx.fx.devA}`, { translations: { en: { tagline: "By the sea" } } });
    expect(dev.json().translations).toEqual({ en: { tagline: "By the sea" } });

    const poi = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/points-of-interest`, {
      name: "Playa",
      category: "BEACH",
      lat: 36.5,
      lng: -4.8,
      distanceText: "5 min a pie",
      translations: { en: { name: "Beach", distanceText: "5 min walk" } },
    });
    expect(poi.statusCode).toBe(201);
    expect(poi.json().translations).toEqual({ en: { name: "Beach", distanceText: "5 min walk" } });

    const gallery = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/gallery`, {
      title: "Cocina",
      imageUrl: "/media/demo/gallery/cocina.jpg",
      translations: { en: { title: "Kitchen" } },
    });
    expect(gallery.json().translations).toEqual({ en: { title: "Kitchen" } });

    const plan = await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/floor-plans`, {
      name: "Planta baja",
      imageUrl: "/media/demo/floorplans/villa-6.svg",
      width: 1000,
      height: 700,
      translations: { en: { name: "Ground floor" } },
    });
    expect(plan.json().translations).toEqual({ en: { name: "Ground floor" } });
  });

  it("rejects an unsupported locale and over-long text, and ignores non-text fields", async () => {
    const url = `${ADMIN}/units/${ctx.fx.unitA1}`;
    expect((await send("PATCH", url, { translations: { fr: { name: "Villa Un" } } })).statusCode).toBe(400);
    expect((await send("PATCH", url, { translations: { en: { name: "x".repeat(121) } } })).statusCode).toBe(400);
    const smuggled = await send("PATCH", url, { translations: { en: { name: "Villa One", status: "SOLD" } } });
    expect(Unit.parse(smuggled.json())).toMatchObject({ status: "AVAILABLE", translations: { en: { name: "Villa One" } } });
  });

  it("publishes the translations in the manifest", async () => {
    expect((await send("POST", `${ADMIN}/developments/${ctx.fx.devA}/publish`)).statusCode).toBe(201);
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/public/developments/dev-a/manifest" });
    const m = DevelopmentManifest.parse(res.json());
    expect(m.development.translations.en?.tagline).toBe("By the sea");
    expect(m.units.find((u) => u.id === ctx.fx.unitA1)!.translations.en?.name).toBe("Villa One");
    expect(m.scenes.find((s) => s.id === ctx.fx.sceneA1)!.translations.en?.name).toBe("Living room");
    expect(m.pointsOfInterest.find((p) => p.distanceText === "5 min a pie")!.translations.en?.name).toBe("Beach");
  });

  it("reads a snapshot published before translations existed", () => {
    const res = DevelopmentManifest.safeParse({
      version: 1,
      publishedAt: new Date().toISOString(),
      development: {
        id: ctx.fx.devA,
        organizationId: ctx.fx.orgA,
        slug: "dev-a",
        name: "Dev A",
        tagline: "",
        description: "",
        city: "Marbella",
        country: "ES",
        lat: 0,
        lng: 0,
        heroImageUrl: null,
        modelUrl: null,
        currency: "EUR",
        updatedAt: new Date().toISOString(),
      },
      units: [],
      scenes: [],
      floorPlans: [],
      gallery: [],
      pointsOfInterest: [],
    });
    expect(res.success).toBe(true);
    expect(res.data?.development.translations).toEqual({});
  });
});
