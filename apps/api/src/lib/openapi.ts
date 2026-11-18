import { z } from "zod";
import {
  ApiError,
  Asset,
  AvailabilityInput,
  Development,
  DevelopmentInput,
  DevelopmentManifest,
  FloorPlan,
  FloorPlanInput,
  FloorPlanPatch,
  GalleryItem,
  GalleryItemInput,
  GalleryItemPatch,
  Hotspot,
  HotspotInput,
  HotspotPatch,
  Job,
  JobInput,
  Lead,
  LeadInput,
  LoginInput,
  Member,
  MemberInput,
  MemberPatch,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointCreated,
  WebhookEndpointInput,
  PasswordChangeInput,
  PointOfInterest,
  PointOfInterestInput,
  PointOfInterestPatch,
  Publication,
  PublicationDiff,
  Scene,
  SceneInput,
  ScenePatch,
  SessionUser,
  Unit,
  VisitAnalytics,
  VisitEventInput,
  UnitInput,
  UnitPatch,
  UploadRequest,
  UploadTicket,
} from "@synapse/contracts";
import type { Action } from "@synapse/domain";

interface RouteDoc {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  tag: string;
  auth?: Action | true;
  body?: z.ZodType;
  response?: z.ZodType;
  status?: number;
  query?: string[];
}

const arr = <T extends z.ZodType>(s: T) => z.array(s);
const Ok = z.object({ ok: z.boolean() });

const A = "/api/v1/admin";
const ROUTES: RouteDoc[] = [
  { method: "get", path: "/health", summary: "Liveness probe", tag: "system", response: z.object({ status: z.literal("ok") }) },
  { method: "post", path: "/api/v1/auth/login", summary: "Log in (sets httpOnly session cookie)", tag: "auth", body: LoginInput, response: SessionUser },
  { method: "post", path: "/api/v1/auth/logout", summary: "Log out", tag: "auth", response: Ok },
  { method: "post", path: "/api/v1/auth/password", summary: "Change password; revokes other sessions and re-issues the cookie", tag: "auth", auth: true, body: PasswordChangeInput, status: 204 },
  { method: "get", path: "/api/v1/auth/me", summary: "Current session user", tag: "auth", auth: true, response: SessionUser },
  { method: "get", path: "/api/v1/public/developments/{slug}/manifest", summary: "Latest published manifest (ETag, cacheable)", tag: "public", response: DevelopmentManifest },
  { method: "post", path: "/api/v1/public/leads", summary: "Submit a lead (honeypot `website` must be empty; 5/min/IP)", tag: "public", body: LeadInput, response: z.object({ id: z.string().uuid() }), status: 201 },
  { method: "post", path: "/api/v1/public/visits", summary: "Count one view of a unit or tour scene (aggregate daily counter, no visitor data; 120/min/IP)", tag: "public", body: VisitEventInput, status: 204 },
  { method: "get", path: `${A}/developments`, summary: "List developments", tag: "developments", auth: "development:read", response: arr(Development) },
  { method: "post", path: `${A}/developments`, summary: "Create development", tag: "developments", auth: "development:write", body: DevelopmentInput, response: Development, status: 201 },
  { method: "get", path: `${A}/developments/{id}`, summary: "Get development", tag: "developments", auth: "development:read", response: Development },
  { method: "patch", path: `${A}/developments/{id}`, summary: "Update development", tag: "developments", auth: "development:write", body: DevelopmentInput.partial(), response: Development },
  { method: "delete", path: `${A}/developments/{id}`, summary: "Delete development (cascades)", tag: "developments", auth: "development:write", status: 204 },
  { method: "post", path: `${A}/developments/{id}/publish`, summary: "Build + validate manifest and store a new Publication version", tag: "publishing", auth: "development:publish", response: Publication, status: 201 },
  { method: "get", path: `${A}/developments/{id}/publications`, summary: "Publication history", tag: "publishing", auth: "development:read", response: arr(Publication) },
  { method: "get", path: `${A}/developments/{id}/publications/compare`, summary: "Entity-level diff between two published versions (?from=&to=)", tag: "publishing", auth: "development:read", response: PublicationDiff },
  { method: "post", path: `${A}/developments/{id}/publications/{version}/restore`, summary: "Republish an old snapshot as a new version, keeping current commercial status", tag: "publishing", auth: "development:publish", response: Publication, status: 201 },
  { method: "get", path: `${A}/developments/{id}/units`, summary: "List units", tag: "units", auth: "development:read", response: arr(Unit) },
  { method: "post", path: `${A}/developments/{id}/units`, summary: "Create unit", tag: "units", auth: "unit:write", body: UnitInput, response: Unit, status: 201 },
  { method: "get", path: `${A}/units/{id}`, summary: "Get unit", tag: "units", auth: "development:read", response: Unit },
  { method: "patch", path: `${A}/units/{id}`, summary: "Update unit", tag: "units", auth: "unit:write", body: UnitPatch, response: Unit },
  { method: "patch", path: `${A}/units/{id}/availability`, summary: "Change commercial status (validated transition, history row)", tag: "units", auth: "unit:availability", body: AvailabilityInput, response: Unit },
  { method: "delete", path: `${A}/units/{id}`, summary: "Delete unit", tag: "units", auth: "unit:write", status: 204 },
  { method: "get", path: `${A}/developments/{id}/scenes`, summary: "List scenes with hotspots", tag: "tour", auth: "development:read", response: arr(Scene) },
  { method: "post", path: `${A}/developments/{id}/scenes`, summary: "Create scene", tag: "tour", auth: "scene:write", body: SceneInput, response: Scene, status: 201 },
  { method: "get", path: `${A}/scenes/{id}`, summary: "Get scene", tag: "tour", auth: "development:read", response: Scene },
  { method: "patch", path: `${A}/scenes/{id}`, summary: "Update scene", tag: "tour", auth: "scene:write", body: ScenePatch, response: Scene },
  { method: "delete", path: `${A}/scenes/{id}`, summary: "Delete scene", tag: "tour", auth: "scene:write", status: 204 },
  { method: "get", path: `${A}/scenes/{id}/hotspots`, summary: "List hotspots", tag: "tour", auth: "development:read", response: arr(Hotspot) },
  { method: "post", path: `${A}/scenes/{id}/hotspots`, summary: "Create hotspot", tag: "tour", auth: "scene:write", body: HotspotInput, response: Hotspot, status: 201 },
  { method: "patch", path: `${A}/scenes/{id}/hotspots/{hotspotId}`, summary: "Update hotspot", tag: "tour", auth: "scene:write", body: HotspotPatch, response: Hotspot },
  { method: "delete", path: `${A}/scenes/{id}/hotspots/{hotspotId}`, summary: "Delete hotspot", tag: "tour", auth: "scene:write", status: 204 },
  { method: "get", path: `${A}/developments/{id}/floor-plans`, summary: "List floor plans", tag: "content", auth: "development:read", response: arr(FloorPlan) },
  { method: "post", path: `${A}/developments/{id}/floor-plans`, summary: "Create floor plan (imageAssetId or imageUrl)", tag: "content", auth: "development:write", body: FloorPlanInput, response: FloorPlan, status: 201 },
  { method: "patch", path: `${A}/floor-plans/{id}`, summary: "Update floor plan", tag: "content", auth: "development:write", body: FloorPlanPatch, response: FloorPlan },
  { method: "delete", path: `${A}/floor-plans/{id}`, summary: "Delete floor plan", tag: "content", auth: "development:write", status: 204 },
  { method: "get", path: `${A}/developments/{id}/gallery`, summary: "List gallery items", tag: "content", auth: "development:read", response: arr(GalleryItem) },
  { method: "post", path: `${A}/developments/{id}/gallery`, summary: "Create gallery item (imageAssetId or imageUrl)", tag: "content", auth: "development:write", body: GalleryItemInput, response: GalleryItem, status: 201 },
  { method: "patch", path: `${A}/gallery/{id}`, summary: "Update gallery item", tag: "content", auth: "development:write", body: GalleryItemPatch, response: GalleryItem },
  { method: "delete", path: `${A}/gallery/{id}`, summary: "Delete gallery item", tag: "content", auth: "development:write", status: 204 },
  { method: "get", path: `${A}/developments/{id}/points-of-interest`, summary: "List points of interest", tag: "content", auth: "development:read", response: arr(PointOfInterest) },
  { method: "post", path: `${A}/developments/{id}/points-of-interest`, summary: "Create point of interest", tag: "content", auth: "development:write", body: PointOfInterestInput, response: PointOfInterest, status: 201 },
  { method: "patch", path: `${A}/points-of-interest/{id}`, summary: "Update point of interest", tag: "content", auth: "development:write", body: PointOfInterestPatch, response: PointOfInterest },
  { method: "delete", path: `${A}/points-of-interest/{id}`, summary: "Delete point of interest", tag: "content", auth: "development:write", status: 204 },
  { method: "get", path: `${A}/members`, summary: "List organization members", tag: "members", auth: "member:manage", response: arr(Member) },
  { method: "post", path: `${A}/members`, summary: "Create a user and add it to the organization (409 if the email exists)", tag: "members", auth: "member:manage", body: MemberInput, response: Member, status: 201 },
  { method: "patch", path: `${A}/members/{id}`, summary: "Change a member's role (409 LAST_OWNER)", tag: "members", auth: "member:manage", body: MemberPatch, response: Member },
  { method: "delete", path: `${A}/members/{id}`, summary: "Remove a member (409 LAST_OWNER)", tag: "members", auth: "member:manage", status: 204 },
  { method: "get", path: `${A}/developments/{id}/analytics`, summary: "Most viewed units and scenes (top 20 each; query days=7|30|90, default 30)", tag: "analytics", auth: "development:read", response: VisitAnalytics, query: ["days"] },
  { method: "get", path: `${A}/webhooks`, summary: "List CRM webhook endpoints (no secrets)", tag: "webhooks", auth: "integration:manage", response: arr(WebhookEndpoint) },
  { method: "post", path: `${A}/webhooks`, summary: "Add a webhook endpoint; the signing secret is returned only here", tag: "webhooks", auth: "integration:manage", body: WebhookEndpointInput, response: WebhookEndpointCreated, status: 201 },
  { method: "delete", path: `${A}/webhooks/{id}`, summary: "Remove a webhook endpoint and its delivery history", tag: "webhooks", auth: "integration:manage", status: 204 },
  { method: "get", path: `${A}/webhooks/{id}/deliveries`, summary: "Last 50 deliveries of an endpoint", tag: "webhooks", auth: "integration:manage", response: arr(WebhookDelivery) },
  { method: "get", path: `${A}/leads`, summary: "List leads (paginated; filter developmentId, unitId, page, pageSize)", tag: "leads", auth: "lead:read", response: z.object({ items: arr(Lead), total: z.number(), page: z.number(), pageSize: z.number() }), query: ["developmentId", "unitId", "page", "pageSize"] },
  { method: "get", path: `${A}/leads/{id}`, summary: "Get lead", tag: "leads", auth: "lead:read", response: Lead },
  { method: "get", path: `${A}/leads/export.csv`, summary: "Export leads as CSV (formula-injection safe)", tag: "leads", auth: "lead:export" },
  { method: "post", path: `${A}/assets/uploads`, summary: "Request a signed upload ticket (10 min)", tag: "assets", auth: "asset:upload", body: UploadRequest, response: UploadTicket, status: 201 },
  { method: "put", path: "/api/v1/uploads/{assetId}", summary: "Upload raw bytes with ?token= (size + magic bytes validated)", tag: "assets", response: Asset, query: ["token"] },
  { method: "get", path: `${A}/assets`, summary: "List assets", tag: "assets", auth: "development:read", response: arr(Asset) },
  { method: "post", path: `${A}/jobs`, summary: "Queue an IMPORT or RENDER job", tag: "jobs", auth: "job:create", body: JobInput, response: Job, status: 201 },
  { method: "get", path: `${A}/jobs`, summary: "List jobs", tag: "jobs", auth: "development:read", response: arr(Job) },
  { method: "get", path: `${A}/jobs/{id}`, summary: "Get job", tag: "jobs", auth: "development:read", response: Job },
  { method: "post", path: `${A}/jobs/{id}/retry`, summary: "Retry a FAILED job", tag: "jobs", auth: "job:create", response: Job },
  { method: "post", path: `${A}/jobs/{id}/review`, summary: "Approve or reject a REQUIRES_REVIEW job", tag: "jobs", auth: "job:create", body: z.object({ decision: z.enum(["approve", "reject"]), note: z.string().optional() }), response: Job },
  { method: "get", path: `${A}/dashboard`, summary: "Counts by unit status, leads (30d), last publication, jobs by status", tag: "dashboard", auth: "development:read" },
];

const schemaOf = (schema: z.ZodType, io: "input" | "output") => {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { target: "openapi-3.0", io, unrepresentable: "any" }) as Record<string, unknown>;
  return json;
};

export function buildOpenApiDocument(publicApiUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    const query = (r.query ?? []).map((name) => ({ name, in: "query", required: name === "token", schema: { type: "string" } }));
    const status = String(r.status ?? 200);
    const operation: Record<string, unknown> = {
      summary: r.summary,
      tags: [r.tag],
      parameters: [...params, ...query],
      ...(r.auth ? { security: [{ cookieAuth: [] }], description: r.auth === true ? "Requires a session." : `Requires a session with permission \`${r.auth}\`.` } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: schemaOf(r.body, "input") } } } } : {}),
      responses: {
        [status]: r.response
          ? { description: "Success", content: { "application/json": { schema: schemaOf(r.response, "output") } } }
          : { description: "Success" },
        "4XX": { description: "Error", content: { "application/json": { schema: schemaOf(ApiError, "output") } } },
      },
    };
    (paths[r.path] ??= {})[r.method] = operation;
  }
  return {
    openapi: "3.0.3" as const,
    info: { title: "Synapse Real Estate API", version: "0.1.0", description: "Schemas are generated from the shared Zod contracts (@synapse/contracts)." },
    servers: [{ url: publicApiUrl }],
    components: { securitySchemes: { cookieAuth: { type: "apiKey" as const, in: "cookie" as const, name: "synapse_session" } } },
    paths,
  };
}
