import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { JOB_STATUSES, RESERVATION_STATUSES, ROLES, UNIT_STATUSES, type ContentTranslations } from "@synapse/domain";

export const roleEnum = pgEnum("role", ROLES);
export const unitStatusEnum = pgEnum("unit_status", UNIT_STATUSES);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const hotspotTypeEnum = pgEnum("hotspot_type", ["NAVIGATION", "INFO"]);
export const assetStatusEnum = pgEnum("asset_status", ["PENDING_UPLOAD", "UPLOADED", "REJECTED"]);
export const visitKindEnum = pgEnum("visit_kind", ["UNIT", "SCENE"]);
export const reservationStatusEnum = pgEnum("reservation_status", RESERVATION_STATUSES);
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", ["PENDING", "DELIVERED", "FAILED"]);
export const poiCategoryEnum = pgEnum("poi_category", [
  "BEACH",
  "SCHOOL",
  "HEALTH",
  "SHOPPING",
  "TRANSPORT",
  "GOLF",
  "RESTAURANT",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const translations = () => jsonb("translations").$type<ContentTranslations>().notNull().default({});
const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("memberships_org_idx").on(t.organizationId), unique("memberships_org_user_uq").on(t.organizationId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: orgId(),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId, t.email)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

export const developments = pgTable(
  "developments",
  {
    id: id(),
    organizationId: orgId(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    description: text("description").notNull().default(""),
    city: text("city").notNull(),
    country: text("country").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** Path relative to STORAGE_DIR (e.g. "demo/hero.jpg") or an absolute http(s) URL. */
    heroImagePath: text("hero_image_path"),
    modelPath: text("model_path"),
    currency: text("currency").notNull().default("EUR"),
    translations: translations(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("developments_org_idx").on(t.organizationId)],
);

export const buildings = pgTable(
  "buildings",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("buildings_org_idx").on(t.organizationId), unique("buildings_dev_code_uq").on(t.developmentId, t.code)],
);

export const unitTypes = pgTable(
  "unit_types",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("unit_types_org_idx").on(t.organizationId), unique("unit_types_dev_name_uq").on(t.developmentId, t.name)],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    unitTypeId: uuid("unit_type_id").references(() => unitTypes.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: unitStatusEnum("status").notNull().default("UNLISTED"),
    /** numeric(14,2) is returned as a decimal string; never a float. */
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    interiorArea: numeric("interior_area", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
    plotArea: numeric("plot_area", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
    terraceArea: numeric("terrace_area", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
    bedrooms: integer("bedrooms").notNull().default(0),
    bathrooms: integer("bathrooms").notNull().default(0),
    floors: integer("floors").notNull().default(1),
    sector: text("sector").notNull().default(""),
    orientation: text("orientation"),
    description: text("description").notNull().default(""),
    translations: translations(),
    labelPosition: jsonb("label_position").$type<[number, number, number] | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("units_org_idx").on(t.organizationId),
    index("units_dev_idx").on(t.developmentId),
    unique("units_dev_code_uq").on(t.developmentId, t.code),
    unique("units_dev_slug_uq").on(t.developmentId, t.slug),
  ],
);

export const unitAvailabilityHistory = pgTable(
  "unit_availability_history",
  {
    id: id(),
    organizationId: orgId(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    fromStatus: unitStatusEnum("from_status"),
    toStatus: unitStatusEnum("to_status").notNull(),
    reason: text("reason"),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("availability_org_idx").on(t.organizationId), index("availability_unit_idx").on(t.unitId)],
);

export const floorPlans = pgTable(
  "floor_plans",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    imagePath: text("image_path").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    translations: translations(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("floor_plans_org_idx").on(t.organizationId), index("floor_plans_dev_idx").on(t.developmentId)],
);

/** Binary uploads (GLB, images, CAD files). Files live under STORAGE_DIR/uploads/<org>/<id>. */
export const assets = pgTable(
  "assets",
  {
    id: id(),
    organizationId: orgId(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    kind: text("kind"),
    declaredContentType: text("declared_content_type").notNull(),
    declaredSize: bigint("declared_size", { mode: "number" }).notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    status: assetStatusEnum("status").notNull().default("PENDING_UPLOAD"),
    storagePath: text("storage_path"),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assets_org_idx").on(t.organizationId)],
);

/** Marzipano cube tiles of a panorama: `<path>/<z>/<face>/<row>/<col>.jpg` and `<path>/preview.jpg`. */
export interface StoredCubeTiles {
  path: string;
  tileSize: number;
  faceSizes: number[];
}

export const panoramaAssets = pgTable(
  "panorama_assets",
  {
    id: id(),
    organizationId: orgId(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Re-encoded full-size JPEG under STORAGE_DIR (publicly servable; the raw upload is not). */
    imagePath: text("image_path"),
    previewPath: text("preview_path"),
    thumbnailPath: text("thumbnail_path"),
    tiles: jsonb("tiles").$type<StoredCubeTiles | null>(),
    createdAt: createdAt(),
  },
  (t) => [index("panorama_assets_org_idx").on(t.organizationId)],
);

export const modelAssets = pgTable(
  "model_assets",
  {
    id: id(),
    organizationId: orgId(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    developmentId: uuid("development_id").references(() => developments.id, { onDelete: "set null" }),
    nodeNames: jsonb("node_names").$type<string[]>().notNull().default([]),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("model_assets_org_idx").on(t.organizationId)],
);

export const unitMeshMappings = pgTable(
  "unit_mesh_mappings",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    modelAssetId: uuid("model_asset_id").references(() => modelAssets.id, { onDelete: "set null" }),
    meshName: text("mesh_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("mesh_mappings_org_idx").on(t.organizationId),
    index("mesh_mappings_unit_idx").on(t.unitId),
    unique("mesh_mappings_dev_mesh_uq").on(t.developmentId, t.meshName),
  ],
);

export const scenes = pgTable(
  "scenes",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    panoramaAssetId: uuid("panorama_asset_id").references(() => panoramaAssets.id, { onDelete: "set null" }),
    /** Paths relative to STORAGE_DIR, or absolute http(s) URLs. */
    panoramaPath: text("panorama_path").notNull(),
    previewPath: text("preview_path"),
    thumbnailPath: text("thumbnail_path"),
    tiles: jsonb("tiles").$type<StoredCubeTiles | null>(),
    initialYaw: doublePrecision("initial_yaw").notNull().default(0),
    initialPitch: doublePrecision("initial_pitch").notNull().default(0),
    initialFov: doublePrecision("initial_fov").notNull().default(1.2),
    translations: translations(),
    floorPlanX: doublePrecision("floor_plan_x"),
    floorPlanY: doublePrecision("floor_plan_y"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("scenes_org_idx").on(t.organizationId),
    index("scenes_dev_idx").on(t.developmentId),
    unique("scenes_dev_slug_uq").on(t.developmentId, t.slug),
  ],
);

export const sceneHotspots = pgTable(
  "scene_hotspots",
  {
    id: id(),
    organizationId: orgId(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    type: hotspotTypeEnum("type").notNull(),
    label: text("label").notNull(),
    yaw: doublePrecision("yaw").notNull(),
    pitch: doublePrecision("pitch").notNull(),
    targetSceneId: uuid("target_scene_id").references(() => scenes.id, { onDelete: "set null" }),
    translations: translations(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("hotspots_org_idx").on(t.organizationId), index("hotspots_scene_idx").on(t.sceneId)],
);

export const galleryItems = pgTable(
  "gallery_items",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    imagePath: text("image_path").notNull(),
    credit: text("credit").notNull().default(""),
    translations: translations(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_org_idx").on(t.organizationId), index("gallery_dev_idx").on(t.developmentId)],
);

export const pointsOfInterest = pgTable(
  "points_of_interest",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: poiCategoryEnum("category").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    translations: translations(),
    distanceText: text("distance_text"),
    createdAt: createdAt(),
  },
  (t) => [index("poi_org_idx").on(t.organizationId), index("poi_dev_idx").on(t.developmentId)],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message"),
    source: text("source").notNull().default("showroom"),
    /** sha256(ip + SESSION_SECRET); the raw IP is never stored. */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    consentAt: timestamp("consent_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("leads_org_idx").on(t.organizationId),
    index("leads_dev_idx").on(t.developmentId),
    index("leads_created_idx").on(t.organizationId, t.createdAt),
  ],
);

const jobColumns = () => ({
  id: id(),
  organizationId: orgId(),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
  developmentId: uuid("development_id").references(() => developments.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  status: jobStatusEnum("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: timestamp("run_after", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
  error: text("error"),
  result: jsonb("result").$type<Record<string, unknown> | null>(),
  logs: jsonb("logs")
    .$type<{ at: string; level: "info" | "warn" | "error"; message: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const importJobs = pgTable("import_jobs", jobColumns(), (t) => [
  index("import_jobs_org_idx").on(t.organizationId),
  index("import_jobs_queue_idx").on(t.status, t.runAfter),
]);

export const renderJobs = pgTable("render_jobs", jobColumns(), (t) => [
  index("render_jobs_org_idx").on(t.organizationId),
  index("render_jobs_queue_idx").on(t.status, t.runAfter),
]);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    organizationId: orgId(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_idx").on(t.organizationId, t.createdAt)],
);

export const publications = pgTable(
  "publications",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    restoredFromVersion: integer("restored_from_version"),
  },
  (t) => [index("publications_org_idx").on(t.organizationId), unique("publications_dev_version_uq").on(t.developmentId, t.version)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    organizationId: orgId(),
    url: text("url").notNull(),
    description: text("description"),
    /** HMAC signing key; needed in clear to sign, never returned after creation. */
    secret: text("secret").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_endpoints_org_idx").on(t.organizationId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    organizationId: orgId(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    /** Next try; while a worker holds the row it is pushed forward as a lease. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("webhook_deliveries_queue_idx").on(t.status, t.nextAttemptAt),
    index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.createdAt),
  ],
);

/** Daily view counters per unit or tour scene. Aggregates only: no IP, cookie or visitor id is stored. */
export const visitStats = pgTable(
  "visit_stats",
  {
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    kind: visitKindEnum("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [unique("visit_stats_target_day_uq").on(t.developmentId, t.day, t.kind, t.targetId)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    organizationId: orgId(),
    developmentId: uuid("development_id")
      .notNull()
      .references(() => developments.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    depositAmount: numeric("deposit_amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    status: reservationStatusEnum("status").notNull().default("PENDING"),
    /** sha256 of the checkout token held only by the visitor's browser. */
    checkoutTokenHash: text("checkout_token_hash").notNull(),
    paymentProvider: text("payment_provider").notNull(),
    paymentRef: text("payment_ref"),
    consentAt: timestamp("consent_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("reservations_org_created_idx").on(t.organizationId, t.createdAt), index("reservations_unit_idx").on(t.unitId)],
);

export const buyers = pgTable("buyers", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Null for accounts created with Google. */
  passwordHash: text("password_hash"),
  sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const buyerFavorites = pgTable(
  "buyer_favorites",
  {
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.buyerId, t.unitId] }), index("buyer_favorites_unit_idx").on(t.unitId)],
);
