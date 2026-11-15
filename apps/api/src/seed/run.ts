import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import {
  createDb,
  developments,
  floorPlans,
  galleryItems,
  migrate,
  organizationMemberships,
  organizations,
  pointsOfInterest,
  publications,
  REPO_ROOT,
  sceneHotspots,
  scenes,
  unitAvailabilityHistory,
  unitMeshMappings,
  unitTypes,
  units,
  users,
  type Db,
} from "@synapse/db";
import type { Role, UnitStatus } from "@synapse/domain";
import { loadConfig } from "../config";
import { buildManifest } from "../lib/manifest";
import { seedPassword } from "./guard";

/**
 * Idempotent demo seed. Reads `<repo>/storage/demo/manifest.json` (written by `pnpm assets:generate`) and rebuilds
 * the two demo organizations from scratch (cascade delete by slug, then insert), then publishes version 1.
 * Production runs need an explicit opt-in and a strong password (see ./guard).
 */

const DEMO_DIR = process.env.SEED_DEMO_DIR ? path.resolve(process.env.SEED_DEMO_DIR) : path.join(REPO_ROOT, "storage", "demo");
const MANIFEST_FILE = path.join(DEMO_DIR, "manifest.json");

const ORG_SLUGS = ["synapse-demo", "otra-inmobiliaria"];
const USERS: { email: string; name: string; role: Role; org: "demo" | "other" }[] = [
  { email: "owner@synapse.local", name: "Marta Propietaria", role: "OWNER", org: "demo" },
  { email: "editor@synapse.local", name: "Eduardo Editor", role: "EDITOR", org: "demo" },
  { email: "sales@synapse.local", name: "Sara Ventas", role: "SALES", org: "demo" },
  { email: "viewer@synapse.local", name: "Victor Lector", role: "VIEWER", org: "demo" },
  { email: "other-owner@otra.local", name: "Olga Otra", role: "OWNER", org: "other" },
];

type Point3 = [number, number, number];
const Tuple3 = z.tuple([z.number(), z.number(), z.number()]);
const Point2 = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const HotspotHint = z.object({
  label: z.string(),
  targetSlug: z.string().nullable().optional(),
  type: z.enum(["NAVIGATION", "INFO"]).optional(),
  yaw: z.number(),
  pitch: z.number().optional(),
  description: z.string().optional(),
});
const PanoramaHint = z
  .object({
    slug: z.string().optional(),
    name: z.string().optional(),
    initialView: z.object({ yaw: z.number(), pitch: z.number(), fov: z.number() }).partial().optional(),
    floorPlanPoint: Point2.nullable().optional(),
    hotspots: z.array(HotspotHint).optional(),
  })
  .passthrough();
const UnitHint = z.object({ code: z.string().optional(), labelPosition: Tuple3.nullable().optional() }).passthrough();

/** The generator output is not versioned yet: accept arrays or `{ key: entry }` records, ignore unknown keys. */
function entries<T extends z.ZodType>(value: unknown, schema: T, keyName: string): (z.infer<T> & Record<string, unknown>)[] {
  const items: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([key, entry]) => (entry && typeof entry === "object" ? { [keyName]: key, ...entry } : entry))
      : [];
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data as z.infer<T> & Record<string, unknown>] : [];
  });
}

function readDemoManifest() {
  if (!existsSync(MANIFEST_FILE)) {
    console.error(`Missing ${MANIFEST_FILE}. Run pnpm assets:generate first.`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Record<string, unknown>;
  const labelPositions = new Map<string, Point3>();
  for (const u of entries((raw.model as { units?: unknown } | undefined)?.units ?? raw.units, UnitHint, "code")) {
    if (u.code && u.labelPosition) labelPositions.set(u.code, u.labelPosition);
  }
  const panoramas = new Map<string, z.infer<typeof PanoramaHint>>();
  for (const p of entries(raw.panoramas ?? raw.scenes, PanoramaHint, "slug")) {
    if (p.slug) panoramas.set(p.slug, p);
  }
  const gallery = entries(raw.gallery, z.object({ file: z.string(), title: z.string().optional() }), "file");
  return { labelPositions, panoramas, gallery };
}

interface VillaSeed {
  code: string;
  type: "Villa 3D" | "Villa 4D" | "Villa 5D";
  sector: "Norte" | "Sur";
  status: UnitStatus;
  price: string;
  bedrooms: number;
  bathrooms: number;
  interior: number;
  plot: number;
  terrace: number;
  orientation: string;
  description: string;
}

const VILLAS: VillaSeed[] = [
  { code: "V1", type: "Villa 3D", sector: "Norte", status: "SOLD", price: "640000", bedrooms: 3, bathrooms: 2, interior: 180, plot: 600, terrace: 40, orientation: "Sur", description: "Villa de tres dormitorios en el sector norte, con jardín privado y porche cubierto." },
  { code: "V2", type: "Villa 3D", sector: "Norte", status: "RESERVED", price: "665000", bedrooms: 3, bathrooms: 2, interior: 190, plot: 620, terrace: 45, orientation: "Sur", description: "Villa luminosa de tres dormitorios con piscina privada y cocina abierta al salón." },
  { code: "V3", type: "Villa 4D", sector: "Norte", status: "AVAILABLE", price: "780000", bedrooms: 4, bathrooms: 3, interior: 220, plot: 700, terrace: 55, orientation: "Sureste", description: "Villa de cuatro dormitorios con suite en planta baja y terraza orientada al mar." },
  { code: "V4", type: "Villa 4D", sector: "Norte", status: "SOLD", price: "820000", bedrooms: 4, bathrooms: 3, interior: 230, plot: 720, terrace: 50, orientation: "Sur", description: "Villa de cuatro dormitorios con amplio salón de doble altura y piscina." },
  { code: "V5", type: "Villa 4D", sector: "Sur", status: "AVAILABLE", price: "860000", bedrooms: 4, bathrooms: 3, interior: 235, plot: 780, terrace: 55, orientation: "Suroeste", description: "Villa en el sector sur con vistas abiertas, jardín mediterráneo y piscina." },
  { code: "V6", type: "Villa 4D", sector: "Sur", status: "AVAILABLE", price: "895000", bedrooms: 4, bathrooms: 3, interior: 240, plot: 820, terrace: 60, orientation: "Sur", description: "Villa de cuatro dormitorios con salón de doble altura, cocina abierta, terraza y piscina privada. Incluye recorrido 360 por todas las estancias." },
  { code: "V7", type: "Villa 5D", sector: "Sur", status: "RESERVED", price: "1090000", bedrooms: 5, bathrooms: 4, interior: 320, plot: 1100, terrace: 90, orientation: "Sur", description: "Villa de cinco dormitorios con zona de bienestar, gran terraza y piscina infinita." },
  { code: "V8", type: "Villa 5D", sector: "Sur", status: "UNLISTED", price: "1250000", bedrooms: 5, bathrooms: 5, interior: 380, plot: 1400, terrace: 120, orientation: "Sur", description: "Villa singular de cinco suites en la parcela más grande del desarrollo. Aún no publicada." },
];

/** Villa 6 tour defaults, used only when the demo manifest does not provide hotspots (plan meters, see assets generator). */
const TOUR: { slug: string; name: string; camera: Point3 }[] = [
  { slug: "exterior", name: "Exterior", camera: [9, 1.7, 19.5] },
  { slug: "living", name: "Living", camera: [4.3, 1.55, 8.3] },
  { slug: "comedor", name: "Comedor", camera: [12.3, 1.55, 6.9] },
  { slug: "cocina", name: "Cocina", camera: [12.9, 1.55, 4.2] },
  { slug: "dormitorio", name: "Dormitorio principal", camera: [3.7, 1.5, 2.6] },
  { slug: "bano", name: "Baño", camera: [7.6, 1.5, 2.7] },
];

/** Plan meters -> normalized floor plan point (SVG 1000x700, 40 px/m, origin 40,50). Null when outside the plan. */
function planPoint(camera: Point3): { x: number; y: number } | null {
  const x = (40 + 40 * camera[0]) / 1000;
  const y = (50 + 40 * camera[2]) / 700;
  return x <= 1 && y <= 1 ? { x: Math.round(x * 1e4) / 1e4, y: Math.round(y * 1e4) / 1e4 } : null;
}
const DOORS: { between: [string, string]; at: Point3 }[] = [
  { between: ["exterior", "living"], at: [9.0, 1.17, 12] },
  { between: ["living", "comedor"], at: [10, 1.22, 8] },
  { between: ["comedor", "cocina"], at: [14.5, 0.99, 5] },
  { between: ["living", "dormitorio"], at: [3, 0.99, 5] },
  { between: ["dormitorio", "bano"], at: [6, 0.99, 1.7] },
];

function yawPitch(from: Point3, to: Point3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(to[1] - from[1], Math.hypot(dx, dz)) };
}

interface HotspotSeed {
  label: string;
  targetSlug: string | null;
  type: "NAVIGATION" | "INFO";
  yaw: number;
  pitch: number;
  description: string | null;
}

function defaultHotspots(slug: string): HotspotSeed[] {
  const from = TOUR.find((t) => t.slug === slug)!;
  return DOORS.flatMap((door) => {
    const [a, b] = door.between;
    const target = a === slug ? b : b === slug ? a : null;
    if (!target) return [];
    const targetName = TOUR.find((t) => t.slug === target)!.name;
    return [{ label: targetName, targetSlug: target, type: "NAVIGATION" as const, ...yawPitch(from.camera, door.at), description: null }];
  });
}

const POIS = [
  { name: "Playa del Faro", category: "BEACH", lat: 36.5062, lng: -4.8751, distanceText: "5 min en coche" },
  { name: "Colegio Internacional Mirador", category: "SCHOOL", lat: 36.5183, lng: -4.8917, distanceText: "10 min en coche" },
  { name: "Centro de Salud Costa Sol", category: "HEALTH", lat: 36.5139, lng: -4.8802, distanceText: "8 min en coche" },
  { name: "Centro Comercial Las Terrazas", category: "SHOPPING", lat: 36.5224, lng: -4.8689, distanceText: "12 min en coche" },
  { name: "Estación de autobuses Faro", category: "TRANSPORT", lat: 36.5156, lng: -4.8845, distanceText: "7 min en coche" },
  { name: "Club de Golf Las Dunas", category: "GOLF", lat: 36.4983, lng: -4.8964, distanceText: "15 min en coche" },
  { name: "Restaurante La Almadraba", category: "RESTAURANT", lat: 36.5078, lng: -4.8779, distanceText: "6 min andando" },
] as const;

const humanise = (file: string) => {
  const text = path.basename(file, path.extname(file)).replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function galleryFiles(): string[] {
  const dir = path.join(DEMO_DIR, "gallery");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();
}

async function wipe(db: Db) {
  // Organizations cascade to everything tenant-owned; users are global and removed by email.
  await db.delete(organizations).where(inArray(organizations.slug, ORG_SLUGS));
  await db.delete(users).where(inArray(users.email, USERS.map((u) => u.email)));
}

async function main() {
  const password = seedPassword(process.env);
  const demo = readDemoManifest();
  const config = loadConfig();
  const handle = await createDb(config.databaseUrl);
  const db = handle.db;
  try {
    await migrate(db);
    for (const rel of ["hero.jpg", "models/masterplan.glb", "floorplans/villa-6.svg"]) {
      if (!existsSync(path.join(DEMO_DIR, rel))) console.warn(`warning: storage/demo/${rel} not found; the demo will show a broken media link`);
    }
    await wipe(db);
    const passwordHash = bcrypt.hashSync(password, 10);
    const gallery = demo.gallery.length > 0 ? demo.gallery.map((g) => ({ file: g.file, title: g.title ?? humanise(g.file) })) : galleryFiles().map((file) => ({ file: `gallery/${file}`, title: humanise(file) }));

    const ids = await db.transaction(async (tx) => {
      const [demoOrg, otherOrg] = await tx
        .insert(organizations)
        .values([
          { name: "Synapse Demo Realty", slug: "synapse-demo" },
          { name: "Otra Inmobiliaria", slug: "otra-inmobiliaria" },
        ])
        .returning();
      const orgIdOf = { demo: demoOrg!.id, other: otherOrg!.id };

      const userRows = await tx.insert(users).values(USERS.map((u) => ({ email: u.email, name: u.name, passwordHash }))).returning();
      await tx.insert(organizationMemberships).values(
        USERS.map((u) => ({ organizationId: orgIdOf[u.org], userId: userRows.find((r) => r.email === u.email)!.id, role: u.role })),
      );
      const ownerId = userRows.find((r) => r.email === "owner@synapse.local")!.id;
      const otherOwnerId = userRows.find((r) => r.email === "other-owner@otra.local")!.id;

      const [dev, otherDev] = await tx
        .insert(developments)
        .values([
          {
            organizationId: orgIdOf.demo,
            slug: "lomas-del-faro",
            name: "Lomas del Faro",
            tagline: "Ocho villas frente al Mediterráneo",
            description:
              "Desarrollo residencial de ocho villas independientes con piscina privada, parcelas amplias y acceso a la playa en cinco minutos. Datos y renders ficticios para demostración.",
            city: "Costa del Faro",
            country: "ES",
            lat: 36.5101,
            lng: -4.8826,
            heroImagePath: "demo/hero.jpg",
            modelPath: "demo/models/masterplan.glb",
            currency: "EUR",
          },
          {
            organizationId: orgIdOf.other,
            slug: "vista-alta",
            name: "Vista Alta",
            tagline: "Dos villas en la colina",
            description: "Pequeño desarrollo de la segunda organización, usado para probar el aislamiento entre inmobiliarias.",
            city: "Colina Alta",
            country: "ES",
            lat: 36.62,
            lng: -4.95,
            heroImagePath: "demo/hero.jpg",
            modelPath: "demo/models/masterplan.glb",
            currency: "EUR",
          },
        ])
        .returning();

      const typeRows = await tx
        .insert(unitTypes)
        .values(["Villa 3D", "Villa 4D", "Villa 5D"].map((name) => ({ organizationId: orgIdOf.demo, developmentId: dev!.id, name })))
        .returning();
      const typeId = new Map(typeRows.map((t) => [t.name, t.id]));

      const unitRows = await tx
        .insert(units)
        .values(
          VILLAS.map((v) => ({
            organizationId: orgIdOf.demo,
            developmentId: dev!.id,
            unitTypeId: typeId.get(v.type)!,
            code: v.code,
            name: `Villa ${v.code.slice(1)}`,
            slug: `villa-${v.code.slice(1)}`,
            status: v.status,
            price: `${v.price}.00`,
            currency: "EUR",
            interiorArea: v.interior,
            plotArea: v.plot,
            terraceArea: v.terrace,
            bedrooms: v.bedrooms,
            bathrooms: v.bathrooms,
            floors: 2,
            sector: v.sector,
            orientation: v.orientation,
            description: v.description,
            labelPosition: demo.labelPositions.get(v.code) ?? null,
          })),
        )
        .returning();
      const unitId = new Map(unitRows.map((u) => [u.code, u.id]));

      await tx.insert(unitMeshMappings).values(
        VILLAS.map((v) => ({
          organizationId: orgIdOf.demo,
          developmentId: dev!.id,
          unitId: unitId.get(v.code)!,
          meshName: `Villa_0${v.code.slice(1)}`,
        })),
      );
      await tx.insert(unitAvailabilityHistory).values(
        VILLAS.map((v) => ({
          organizationId: orgIdOf.demo,
          unitId: unitId.get(v.code)!,
          fromStatus: null,
          toStatus: v.status,
          reason: "Carga inicial de datos demo",
          changedBy: ownerId,
        })),
      );

      // Villa 6 tour: scenes first, then hotspots (they reference scene ids).
      const villa6 = unitId.get("V6")!;
      const sceneRows = await tx
        .insert(scenes)
        .values(
          TOUR.map((t, index) => {
            const hint = demo.panoramas.get(t.slug);
            return {
              organizationId: orgIdOf.demo,
              developmentId: dev!.id,
              unitId: villa6,
              slug: t.slug,
              name: hint?.name ?? t.name,
              sortOrder: index,
              panoramaPath: `demo/panoramas/${t.slug}.jpg`,
              previewPath: `demo/panoramas/${t.slug}-preview.jpg`,
              thumbnailPath: `demo/thumbs/${t.slug}.jpg`,
              initialYaw: hint?.initialView?.yaw ?? 0,
              initialPitch: hint?.initialView?.pitch ?? 0,
              initialFov: hint?.initialView?.fov ?? 1.2,
              floorPlanX: (hint?.floorPlanPoint !== undefined ? hint.floorPlanPoint : planPoint(t.camera))?.x ?? null,
              floorPlanY: (hint?.floorPlanPoint !== undefined ? hint.floorPlanPoint : planPoint(t.camera))?.y ?? null,
            };
          }),
        )
        .returning();
      const sceneId = new Map(sceneRows.map((s) => [s.slug, s.id]));
      const hotspotRows = TOUR.flatMap((t) => {
        const hinted = demo.panoramas.get(t.slug)?.hotspots;
        const list: HotspotSeed[] = hinted
          ? hinted.map((h) => ({ label: h.label, targetSlug: h.targetSlug ?? null, type: h.type ?? (h.targetSlug ? "NAVIGATION" : "INFO"), yaw: h.yaw, pitch: h.pitch ?? 0, description: h.description ?? null }))
          : defaultHotspots(t.slug);
        return list.flatMap((h) => {
          const target = h.targetSlug ? sceneId.get(h.targetSlug) : null;
          if (h.targetSlug && !target) return [];
          return [{ organizationId: orgIdOf.demo, sceneId: sceneId.get(t.slug)!, type: h.type, label: h.label, yaw: h.yaw, pitch: h.pitch, targetSceneId: target ?? null, description: h.description }];
        });
      });
      if (hotspotRows.length > 0) await tx.insert(sceneHotspots).values(hotspotRows);

      await tx.insert(floorPlans).values({
        organizationId: orgIdOf.demo,
        developmentId: dev!.id,
        unitId: villa6,
        name: "Villa 6 · Planta baja",
        imagePath: "demo/floorplans/villa-6.svg",
        width: 1000,
        height: 700,
      });
      if (gallery.length > 0) {
        await tx.insert(galleryItems).values(
          gallery.map((item, index) => ({
            organizationId: orgIdOf.demo,
            developmentId: dev!.id,
            title: item.title,
            imagePath: `demo/${item.file}`,
            credit: "Render propio generado por código (Synapse demo)",
            sortOrder: index,
          })),
        );
      }
      await tx.insert(pointsOfInterest).values(POIS.map((p) => ({ organizationId: orgIdOf.demo, developmentId: dev!.id, ...p })));

      // Smaller development for the second organization (tenant isolation demo).
      const otherUnits = await tx
        .insert(units)
        .values([
          { code: "A1", name: "Villa A1", slug: "villa-a1", status: "AVAILABLE" as const, price: "520000.00", interiorArea: 150, plotArea: 450, terraceArea: 30, bedrooms: 3, bathrooms: 2, sector: "Colina", description: "Villa de tres dormitorios con vistas a la sierra." },
          { code: "A2", name: "Villa A2", slug: "villa-a2", status: "RESERVED" as const, price: "575000.00", interiorArea: 170, plotArea: 500, terraceArea: 35, bedrooms: 4, bathrooms: 3, sector: "Colina", description: "Villa de cuatro dormitorios con piscina." },
        ].map((u) => ({ organizationId: orgIdOf.other, developmentId: otherDev!.id, ...u })))
        .returning();
      await tx.insert(unitAvailabilityHistory).values(
        otherUnits.map((u) => ({ organizationId: orgIdOf.other, unitId: u.id, fromStatus: null, toStatus: u.status, reason: "Carga inicial de datos demo", changedBy: otherOwnerId })),
      );

      return { dev: dev!, otherDev: otherDev!, ownerId, otherOwnerId };
    });

    // Publish v1 of each development exactly like POST /publish does (manifest is validated by the contract).
    for (const [development, publishedBy] of [[ids.dev, ids.ownerId], [ids.otherDev, ids.otherOwnerId]] as const) {
      const publishedAt = new Date();
      const manifest = await buildManifest(db, config, development, 1, publishedAt);
      await db.insert(publications).values({
        organizationId: development.organizationId,
        developmentId: development.id,
        version: 1,
        snapshot: manifest as unknown as Record<string, unknown>,
        publishedBy,
        publishedAt,
      });
    }

    console.log("\nSeed complete (database: " + handle.driver + ")");
    console.log(`  Development: Lomas del Faro (slug lomas-del-faro), ${VILLAS.length} villas, ${TOUR.length} tour scenes, ${gallery.length} gallery images, ${POIS.length} POIs, publication v1`);
    console.log("  Second org: Otra Inmobiliaria (slug vista-alta), 2 villas, publication v1");
    console.log(`\nLogin credentials (local demo only). Password for all users: ${password}`);
    for (const u of USERS) console.log(`  ${u.role.padEnd(6)} ${u.email}`);
    console.log(`\nManifest: ${config.publicApiUrl}/api/v1/public/developments/lomas-del-faro/manifest`);
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
