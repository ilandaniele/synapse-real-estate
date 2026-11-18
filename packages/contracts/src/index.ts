import { z } from "zod";
import { ROLES, UNIT_STATUSES, JOB_KINDS, JOB_STATUSES, isValidDecimalAmount } from "@synapse/domain";

export const Uuid = z.string().uuid();
export const IsoDate = z.string().datetime({ offset: true });
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
export const Decimal = z.string().refine(isValidDecimalAmount, "Expected decimal string with up to 2 fractional digits");
export const Currency = z.string().regex(/^[A-Z]{3}$/);
export const UnitStatus = z.enum(UNIT_STATUSES);
export const Role = z.enum(ROLES);
export const JobKind = z.enum(JOB_KINDS);
export const JobStatus = z.enum(JOB_STATUSES);

export const PanoPosition = z.object({
  yaw: z.number().min(-Math.PI).max(Math.PI),
  pitch: z.number().min(-Math.PI / 2).max(Math.PI / 2),
});
export const NormalizedPoint = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const HotspotType = z.enum(["NAVIGATION", "INFO"]);
export const Hotspot = z.object({
  id: Uuid,
  sceneId: Uuid,
  type: HotspotType,
  label: z.string().min(1).max(80),
  yaw: z.number(),
  pitch: z.number(),
  targetSceneId: Uuid.nullable(),
  description: z.string().max(500).nullable(),
});
export type Hotspot = z.infer<typeof Hotspot>;

/** Marzipano cube tiles: `<baseUrl>/<z>/<face>/<row>/<col>.jpg`, with `<baseUrl>/preview.jpg` as level 0. */
export const CubeMapTiles = z.object({
  baseUrl: z.string(),
  tileSize: z.number().int().positive(),
  faceSizes: z.array(z.number().int().positive()).min(1),
});
export type CubeMapTiles = z.infer<typeof CubeMapTiles>;

export const Scene = z.object({
  id: Uuid,
  unitId: Uuid.nullable(),
  developmentId: Uuid,
  slug: Slug,
  name: z.string().min(1).max(80),
  sortOrder: z.number().int(),
  panoramaUrl: z.string(),
  previewUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  cubeMap: CubeMapTiles.nullable().default(null),
  initialView: PanoPosition.extend({ fov: z.number().min(0.3).max(2.2) }),
  floorPlanPoint: NormalizedPoint.nullable(),
  hotspots: z.array(Hotspot),
});
export type Scene = z.infer<typeof Scene>;

export const FloorPlan = z.object({
  id: Uuid,
  unitId: Uuid.nullable(),
  name: z.string(),
  imageUrl: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type FloorPlan = z.infer<typeof FloorPlan>;

export const GalleryItem = z.object({
  id: Uuid,
  unitId: Uuid.nullable(),
  title: z.string(),
  imageUrl: z.string(),
  credit: z.string(),
  sortOrder: z.number().int(),
});
export type GalleryItem = z.infer<typeof GalleryItem>;

export const PointOfInterest = z.object({
  id: Uuid,
  name: z.string(),
  category: z.enum(["BEACH", "SCHOOL", "HEALTH", "SHOPPING", "TRANSPORT", "GOLF", "RESTAURANT"]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  distanceText: z.string().nullable(),
});
export type PointOfInterest = z.infer<typeof PointOfInterest>;

export const Unit = z.object({
  id: Uuid,
  developmentId: Uuid,
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  slug: Slug,
  status: UnitStatus,
  price: Decimal,
  currency: Currency,
  interiorArea: z.number().nonnegative(),
  plotArea: z.number().nonnegative(),
  terraceArea: z.number().nonnegative(),
  bedrooms: z.number().int().nonnegative(),
  bathrooms: z.number().int().nonnegative(),
  floors: z.number().int().positive(),
  unitType: z.string(),
  sector: z.string(),
  orientation: z.string().nullable(),
  description: z.string().max(4000),
  meshNames: z.array(z.string()),
  labelPosition: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  updatedAt: IsoDate,
});
export type Unit = z.infer<typeof Unit>;

export const Development = z.object({
  id: Uuid,
  organizationId: Uuid,
  slug: Slug,
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  heroImageUrl: z.string().nullable(),
  modelUrl: z.string().nullable(),
  currency: Currency,
  updatedAt: IsoDate,
});
export type Development = z.infer<typeof Development>;

/** Public, versioned snapshot served to the showroom. */
export const DevelopmentManifest = z.object({
  version: z.number().int().positive(),
  publishedAt: IsoDate,
  development: Development,
  units: z.array(Unit),
  scenes: z.array(Scene),
  floorPlans: z.array(FloorPlan),
  gallery: z.array(GalleryItem),
  pointsOfInterest: z.array(PointOfInterest),
});
export type DevelopmentManifest = z.infer<typeof DevelopmentManifest>;

export const LeadInput = z.object({
  developmentSlug: Slug,
  unitId: Uuid.nullable().optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{6,25}$/)
    .optional()
    .or(z.literal("")),
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { message: "Consent is required" }),
  website: z.string().max(0).optional(),
});
export type LeadInput = z.infer<typeof LeadInput>;

export const Lead = z.object({
  id: Uuid,
  developmentId: Uuid,
  unitId: Uuid.nullable(),
  unitCode: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  message: z.string().nullable(),
  source: z.string(),
  createdAt: IsoDate,
});
export type Lead = z.infer<typeof Lead>;

export const LoginInput = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
export const SessionUser = z.object({
  id: Uuid,
  email: z.string(),
  name: z.string(),
  organizationId: Uuid,
  organizationName: z.string(),
  role: Role,
});
export type SessionUser = z.infer<typeof SessionUser>;

export const UnitInput = Unit.omit({ id: true, developmentId: true, updatedAt: true, slug: true }).extend({
  slug: Slug.optional(),
});
export type UnitInput = z.infer<typeof UnitInput>;
export const UnitPatch = UnitInput.partial();
export const AvailabilityInput = z.object({ status: UnitStatus, reason: z.string().max(300).optional() });

export const DevelopmentInput = Development.pick({
  name: true,
  tagline: true,
  description: true,
  city: true,
  country: true,
  lat: true,
  lng: true,
  currency: true,
}).extend({ slug: Slug });

export const SceneInput = z.object({
  unitId: Uuid.nullable(),
  slug: Slug,
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().default(0),
  panoramaAssetId: Uuid.nullable().optional(),
  panoramaUrl: z.string().optional(),
  initialView: Scene.shape.initialView.optional(),
  floorPlanPoint: NormalizedPoint.nullable().optional(),
});
export const ScenePatch = SceneInput.partial();
export const HotspotInput = Hotspot.omit({ id: true, sceneId: true }).extend({
  description: z.string().max(500).nullable().optional(),
});
export const HotspotPatch = HotspotInput.partial();

/** An image is given either as an uploaded asset (published on save) or as a media path / https URL. */
const ImageSource = z.object({
  imageAssetId: Uuid.optional(),
  imageUrl: z.string().min(1).max(2000).optional(),
});

const FloorPlanFields = ImageSource.extend({
  unitId: Uuid.nullable(),
  name: z.string().min(1).max(120),
  width: z.number().positive().max(100_000),
  height: z.number().positive().max(100_000),
});
export const FloorPlanInput = FloorPlanFields.extend({ unitId: Uuid.nullable().default(null) });
export type FloorPlanInput = z.infer<typeof FloorPlanInput>;
export const FloorPlanPatch = FloorPlanFields.partial();

const GalleryItemFields = ImageSource.extend({
  unitId: Uuid.nullable(),
  title: z.string().min(1).max(120),
  credit: z.string().max(200),
  sortOrder: z.number().int(),
});
export const GalleryItemInput = GalleryItemFields.extend({
  unitId: Uuid.nullable().default(null),
  credit: z.string().max(200).default(""),
  sortOrder: z.number().int().default(0),
});
export type GalleryItemInput = z.infer<typeof GalleryItemInput>;
export const GalleryItemPatch = GalleryItemFields.partial();

const PointOfInterestFields = PointOfInterest.omit({ id: true }).extend({
  name: z.string().min(1).max(120),
  distanceText: z.string().max(80).nullable(),
});
export const PointOfInterestInput = PointOfInterestFields.extend({
  distanceText: z.string().max(80).nullable().default(null),
});
export type PointOfInterestInput = z.infer<typeof PointOfInterestInput>;
export const PointOfInterestPatch = PointOfInterestFields.partial();

export const NewPassword = z.string().min(12).max(200);
export const PasswordChangeInput = z.object({ currentPassword: z.string().min(1).max(200), newPassword: NewPassword });
export type PasswordChangeInput = z.infer<typeof PasswordChangeInput>;

export const Member = z.object({
  id: Uuid,
  userId: Uuid,
  email: z.string(),
  name: z.string(),
  role: Role,
  createdAt: IsoDate,
});
export type Member = z.infer<typeof Member>;
export const MemberInput = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120),
  role: Role,
  password: NewPassword,
});
export type MemberInput = z.infer<typeof MemberInput>;
export const MemberPatch = z.object({ role: Role });

const Email = z.string().trim().email().max(254);
const Token = z.string().min(20).max(200);
export const TokenBody = z.object({ token: Token });

export const Invitation = z.object({
  id: Uuid,
  email: z.string(),
  role: Role,
  expiresAt: IsoDate,
  createdAt: IsoDate,
});
export type Invitation = z.infer<typeof Invitation>;
export const InvitationInput = z.object({ email: Email, role: Role });
export type InvitationInput = z.infer<typeof InvitationInput>;
export const InvitationPreview = z.object({ email: z.string(), role: Role, organizationName: z.string(), expiresAt: IsoDate });
export type InvitationPreview = z.infer<typeof InvitationPreview>;
export const InvitationAccept = z.object({ token: Token, name: z.string().trim().min(1).max(120), password: NewPassword });
export type InvitationAccept = z.infer<typeof InvitationAccept>;
export const PasswordResetRequest = z.object({ email: Email });
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;
export const PasswordResetConfirm = z.object({ token: Token, password: NewPassword });
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirm>;

export const UploadRequest = z.object({
  filename: z.string().min(1).max(200),
  size: z.number().int().positive(),
  contentType: z.string().max(100),
});
export const UploadTicket = z.object({
  assetId: Uuid,
  uploadUrl: z.string(),
  expiresAt: IsoDate,
  /** True when the PUT goes straight to object storage: the client must then call `POST /admin/assets/:id/complete`. */
  requiresCompletion: z.boolean(),
});

export const Asset = z.object({
  id: Uuid,
  filename: z.string(),
  kind: z.string().nullable(),
  size: z.number(),
  status: z.enum(["PENDING_UPLOAD", "UPLOADED", "REJECTED"]),
  url: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: IsoDate,
});
export type Asset = z.infer<typeof Asset>;

export const JobInput = z.object({ kind: JobKind, assetId: Uuid, developmentId: Uuid.optional() });
export const Job = z.object({
  id: Uuid,
  kind: JobKind,
  status: JobStatus,
  assetId: Uuid.nullable(),
  attempts: z.number().int(),
  error: z.string().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  logs: z.array(z.object({ at: IsoDate, level: z.enum(["info", "warn", "error"]), message: z.string() })),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type Job = z.infer<typeof Job>;

export const Publication = z.object({
  id: Uuid,
  developmentId: Uuid,
  version: z.number().int(),
  publishedBy: z.string(),
  publishedAt: IsoDate,
  restoredFromVersion: z.number().int().nullable(),
});
export type Publication = z.infer<typeof Publication>;

export const PublicationDiffSection = z.enum(["development", "units", "scenes", "floorPlans", "gallery", "pointsOfInterest"]);
export type PublicationDiffSection = z.infer<typeof PublicationDiffSection>;

export const FieldChange = z.object({ field: z.string(), before: z.unknown(), after: z.unknown() });
export type FieldChange = z.infer<typeof FieldChange>;

export const EntityChange = z.object({
  section: PublicationDiffSection,
  id: z.string(),
  label: z.string(),
  kind: z.enum(["added", "removed", "changed"]),
  fields: z.array(FieldChange),
});
export type EntityChange = z.infer<typeof EntityChange>;

export const PublicationDiff = z.object({
  from: z.number().int(),
  to: z.number().int(),
  changes: z.array(EntityChange),
});
export type PublicationDiff = z.infer<typeof PublicationDiff>;

export const CompareQuery = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
});
export type CompareQuery = z.infer<typeof CompareQuery>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof ApiError>;

export const WEBHOOK_EVENTS = ["lead.created"] as const;
export const WebhookEndpointInput = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((value) => /^https?:\/\//i.test(value), "URL must use http or https"),
  description: z.string().trim().max(200).optional(),
});
export type WebhookEndpointInput = z.infer<typeof WebhookEndpointInput>;
export const WebhookEndpoint = z.object({
  id: Uuid,
  url: z.string(),
  description: z.string().nullable(),
  createdAt: IsoDate,
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpoint>;
/** Only the creation response carries the signing secret. */
export const WebhookEndpointCreated = WebhookEndpoint.extend({ secret: z.string() });
export type WebhookEndpointCreated = z.infer<typeof WebhookEndpointCreated>;
export const WebhookDelivery = z.object({
  id: Uuid,
  event: z.enum(WEBHOOK_EVENTS),
  status: z.enum(["PENDING", "DELIVERED", "FAILED"]),
  attempts: z.number().int(),
  responseStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: IsoDate,
  deliveredAt: IsoDate.nullable(),
  createdAt: IsoDate,
});
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;

export const VISIT_KINDS = ["UNIT", "SCENE"] as const;
export const ANALYTICS_RANGES = [7, 30, 90] as const;
/** Sent by the showroom when a visitor opens a unit sheet or a tour scene. */
export const VisitEventInput = z.object({
  developmentSlug: Slug,
  kind: z.enum(VISIT_KINDS),
  targetId: Uuid,
});
export type VisitEventInput = z.infer<typeof VisitEventInput>;
export const AnalyticsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (ANALYTICS_RANGES as readonly number[]).includes(value), "days must be 7, 30 or 90")
    .default(30),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;
export const VisitAnalytics = z.object({
  days: z.number().int(),
  units: z.array(z.object({ id: Uuid, code: z.string(), name: z.string(), views: z.number().int() })),
  scenes: z.array(z.object({ id: Uuid, name: z.string(), unitCode: z.string().nullable(), views: z.number().int() })),
});
export type VisitAnalytics = z.infer<typeof VisitAnalytics>;
