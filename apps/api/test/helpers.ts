import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import {
  createDb,
  developments,
  floorPlans,
  galleryItems,
  leads,
  migrate,
  organizationMemberships,
  organizations,
  pointsOfInterest,
  sceneHotspots,
  scenes,
  unitTypes,
  units,
  users,
  type Db,
  type DbHandle,
} from "@synapse/db";
import type { Role } from "@synapse/domain";
import { buildApp, type BuildAppOptions } from "../src/app";

export const PASSWORD = "test-password-123";

export interface Fixtures {
  orgA: string;
  orgB: string;
  devA: string;
  devB: string;
  /** Org A units: V1 AVAILABLE, V2 UNLISTED, V3 RESERVED. */
  unitA1: string;
  unitA2: string;
  unitA3: string;
  unitB1: string;
  sceneA1: string;
  sceneA2: string;
  sceneB1: string;
  leadA: string;
  leadB: string;
}

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  storageDir: string;
  fx: Fixtures;
  /** Logs in and returns a `cookie` header value. */
  login(email: string): Promise<string>;
  close(): Promise<void>;
}

export const EMAILS = {
  owner: "owner@a.test",
  editor: "editor@a.test",
  sales: "sales@a.test",
  viewer: "viewer@a.test",
  ownerB: "owner@b.test",
} as const;

export const unitBody = (overrides: Record<string, unknown> = {}) => ({
  code: "V9",
  name: "Villa 9",
  status: "AVAILABLE",
  price: "700000",
  currency: "EUR",
  interiorArea: 200,
  plotArea: 600,
  terraceArea: 40,
  bedrooms: 4,
  bathrooms: 3,
  floors: 2,
  unitType: "Villa 4D",
  sector: "Norte",
  orientation: "Sur",
  description: "Villa de prueba",
  meshNames: ["Villa_09"],
  labelPosition: null,
  ...overrides,
});

async function seedFixtures(db: Db): Promise<Fixtures> {
  const hash = bcrypt.hashSync(PASSWORD, 4);
  const [orgA, orgB] = await db
    .insert(organizations)
    .values([
      { name: "Org A", slug: "org-a" },
      { name: "Org B", slug: "org-b" },
    ])
    .returning();
  const userRows = await db
    .insert(users)
    .values(Object.values(EMAILS).map((email) => ({ email, name: email.split("@")[0]!, passwordHash: hash })))
    .returning();
  const roleOf: Record<string, [string, Role]> = {
    [EMAILS.owner]: [orgA!.id, "OWNER"],
    [EMAILS.editor]: [orgA!.id, "EDITOR"],
    [EMAILS.sales]: [orgA!.id, "SALES"],
    [EMAILS.viewer]: [orgA!.id, "VIEWER"],
    [EMAILS.ownerB]: [orgB!.id, "OWNER"],
  };
  await db.insert(organizationMemberships).values(
    userRows.map((u) => ({ userId: u.id, organizationId: roleOf[u.email]![0], role: roleOf[u.email]![1] })),
  );

  const dev = (organizationId: string, slug: string, name: string) => ({
    organizationId,
    slug,
    name,
    city: "Ciudad Demo",
    country: "ES",
    lat: 36.51,
    lng: -4.88,
    currency: "EUR",
  });
  const [devA, devB] = await db
    .insert(developments)
    .values([dev(orgA!.id, "dev-a", "Desarrollo A"), dev(orgB!.id, "dev-b", "Desarrollo B")])
    .returning();

  const [type] = await db.insert(unitTypes).values({ organizationId: orgA!.id, developmentId: devA!.id, name: "Villa 3D" }).returning();
  const unit = (organizationId: string, developmentId: string, code: string, status: "AVAILABLE" | "RESERVED" | "UNLISTED", unitTypeId?: string) => ({
    organizationId,
    developmentId,
    unitTypeId,
    code,
    name: `Villa ${code}`,
    slug: `villa-${code.toLowerCase()}`,
    status,
    price: "800000.00",
    interiorArea: 200,
    plotArea: 600,
    terraceArea: 30,
    bedrooms: 4,
    bathrooms: 3,
    sector: "Norte",
  });
  const unitRows = await db
    .insert(units)
    .values([
      unit(orgA!.id, devA!.id, "V1", "AVAILABLE", type!.id),
      unit(orgA!.id, devA!.id, "V2", "UNLISTED", type!.id),
      unit(orgA!.id, devA!.id, "V3", "RESERVED", type!.id),
      unit(orgB!.id, devB!.id, "B1", "AVAILABLE"),
    ])
    .returning();
  const byCode = Object.fromEntries(unitRows.map((u) => [u.code, u.id])) as Record<string, string>;

  const scene = (organizationId: string, developmentId: string, slug: string, unitId: string | null, sortOrder: number) => ({
    organizationId,
    developmentId,
    unitId,
    slug,
    name: slug,
    sortOrder,
    panoramaPath: `demo/panoramas/${slug}.jpg`,
    floorPlanX: 0.5,
    floorPlanY: 0.5,
  });
  const sceneRows = await db
    .insert(scenes)
    .values([
      scene(orgA!.id, devA!.id, "living", byCode.V1!, 1),
      scene(orgA!.id, devA!.id, "cocina", byCode.V1!, 2),
      scene(orgB!.id, devB!.id, "living", byCode.B1!, 1),
    ])
    .returning();
  const [sceneA1, sceneA2, sceneB1] = sceneRows;
  await db.insert(sceneHotspots).values([
    { organizationId: orgA!.id, sceneId: sceneA1!.id, type: "NAVIGATION", label: "Cocina", yaw: 0.5, pitch: 0, targetSceneId: sceneA2!.id },
    { organizationId: orgA!.id, sceneId: sceneA2!.id, type: "NAVIGATION", label: "Salon", yaw: -0.5, pitch: 0, targetSceneId: sceneA1!.id },
  ]);
  await db.insert(floorPlans).values({
    organizationId: orgA!.id,
    developmentId: devA!.id,
    unitId: byCode.V1!,
    name: "Planta baja",
    imagePath: "demo/floorplans/villa-6.svg",
    width: 1000,
    height: 700,
  });
  await db.insert(galleryItems).values({ organizationId: orgA!.id, developmentId: devA!.id, title: "Fachada", imagePath: "demo/gallery/a.jpg", credit: "Render propio" });
  await db.insert(pointsOfInterest).values({ organizationId: orgA!.id, developmentId: devA!.id, name: "Playa", category: "BEACH", lat: 36.5, lng: -4.88, distanceText: "5 min" });

  const lead = (organizationId: string, developmentId: string, name: string, unitId: string | null) => ({
    organizationId,
    developmentId,
    unitId,
    name,
    email: `${name.toLowerCase()}@example.com`,
  });
  const [leadA, leadB] = await db
    .insert(leads)
    .values([lead(orgA!.id, devA!.id, "Ana", byCode.V1!), lead(orgB!.id, devB!.id, "Beto", null)])
    .returning();

  return {
    orgA: orgA!.id,
    orgB: orgB!.id,
    devA: devA!.id,
    devB: devB!.id,
    unitA1: byCode.V1!,
    unitA2: byCode.V2!,
    unitA3: byCode.V3!,
    unitB1: byCode.B1!,
    sceneA1: sceneA1!.id,
    sceneA2: sceneA2!.id,
    sceneB1: sceneB1!.id,
    leadA: leadA!.id,
    leadB: leadB!.id,
  };
}

export async function createTestContext(options: Partial<Pick<BuildAppOptions, "rateLimit" | "config">> = {}): Promise<TestContext> {
  const handle: DbHandle = await createDb("memory://");
  await migrate(handle.db);
  const storageDir = mkdtempSync(path.join(tmpdir(), "synapse-api-test-"));
  const app = await buildApp({
    db: handle.db,
    storageDir,
    config: options.config,
    rateLimit: { global: 100_000, login: 100_000, leads: 100_000, ...options.rateLimit },
  });
  await app.ready();
  const fx = await seedFixtures(handle.db);

  const cookies = new Map<string, string>();
  return {
    app,
    db: handle.db,
    storageDir,
    fx,
    async login(email) {
      const cached = cookies.get(email);
      if (cached) return cached;
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password: PASSWORD } });
      if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.body}`);
      const cookie = res.cookies.find((c) => c.name === "synapse_session");
      if (!cookie) throw new Error("no session cookie");
      const header = `synapse_session=${cookie.value}`;
      cookies.set(email, header);
      return header;
    },
    async close() {
      await app.close();
      await handle.close();
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

export const ADMIN = "/api/v1/admin";

/** Minimal JSON-only GLB (valid container) with the given node names. */
export function buildGlb(nodeNames: string[]): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: nodeNames.map((_, i) => i) }],
    nodes: nodeNames.map((name) => ({ name })),
  });
  const body = Buffer.from(json + " ".repeat((4 - (json.length % 4)) % 4));
  const out = Buffer.alloc(20 + body.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(body.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  body.copy(out, 20);
  return out;
}

/** Requests a ticket and PUTs the bytes; returns both responses. */
export async function uploadFile(ctx: TestContext, cookie: string, filename: string, bytes: Buffer) {
  const ticketRes = await ctx.app.inject({
    method: "POST",
    url: `${ADMIN}/assets/uploads`,
    headers: { cookie },
    payload: { filename, size: bytes.length, contentType: "application/octet-stream" },
  });
  if (ticketRes.statusCode !== 201) return { ticketRes, putRes: null, assetId: null as string | null };
  const ticket = ticketRes.json() as { assetId: string; uploadUrl: string };
  const url = new URL(ticket.uploadUrl);
  const putRes = await ctx.app.inject({
    method: "PUT",
    url: `${url.pathname}${url.search}`,
    headers: { "content-type": "application/octet-stream" },
    payload: bytes,
  });
  return { ticketRes, putRes, assetId: ticket.assetId as string | null };
}
