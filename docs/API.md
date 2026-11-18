# API REST

Base: `http://localhost:4000`. Prefijo `/api/v1`. OpenAPI 3 generado desde los contratos Zod: Swagger UI en `/docs`, JSON en `/docs/json` (solo fuera de producción).

## Auth model
Login sets httpOnly `synapse_session` cookie (jose HS256, 8 h, SameSite=Lax, Secure in prod). Frontends call with `credentials: "include"`; CORS allows credentials for `CORS_ORIGINS`. Every admin row is scoped by `organizationId` from the session; another org's id returns **404**. Permission by role comes from `@synapse/domain` `can(role, action)`.

## Endpoints
Errors always use the `ApiError` shape `{error: {code, message, details?}}`. Bodies are limited to 1 MB except the upload PUT. Admin routes are under `/api/v1/admin` and need the cookie; the permission column is the `Action` checked.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /health | public | liveness, `{status:"ok"}` |
| GET | /health/ready | public | readiness: `select 1` on the database; 503 `{status:"unavailable"}` when it fails |
| GET | /metrics | `Authorization: Bearer METRICS_TOKEN` | Prometheus text 0.0.4. 404 when `METRICS_TOKEN` is unset, 401 on a wrong token. See [BACKUPS.md](BACKUPS.md) |
| GET | /docs, /docs/json | public, not in production | Swagger UI / OpenAPI 3.0 generated from the Zod contracts |
| GET | /media/* | public | Local storage only (`STORAGE_DRIVER=local`). Static from STORAGE_DIR. `uploads/` is never served. 7 d cache, nosniff. With S3, media URLs use `MEDIA_PUBLIC_URL` |
| POST | /api/v1/auth/login | public | 10/min/IP; 401 identical for wrong email or password |
| POST | /api/v1/auth/logout | public | clears cookie |
| GET | /api/v1/auth/me | session | SessionUser |
| POST | /api/v1/auth/invitations/preview | public | `{token}` -> `{email, role, organizationName, expiresAt}`; 404 `NOT_FOUND` for unknown, used, revoked or expired. 10/min/IP |
| POST | /api/v1/auth/invitations/accept | public | `{token, name, password}` creates the user and membership, marks the invitation used and logs in: **201** SessionUser plus the cookie; 404 if the token is not usable, 409 `USER_EXISTS`. 10/min/IP |
| POST | /api/v1/auth/password-reset/request | public | `{email}` -> always **202**, whether the email exists or not; emails a 1 h link. 503 without SMTP in production. 10/min/IP |
| POST | /api/v1/auth/password-reset/confirm | public | `{token, password}` -> 204; burns every open reset link of the user and revokes their sessions; 400 for an invalid or expired token. 10/min/IP |
| GET | /api/v1/public/developments/:slug/manifest | public | latest publication; ETag + 304, `Cache-Control: public, max-age=30, stale-while-revalidate=300` |
| POST | /api/v1/public/leads | public | 5/min/IP; honeypot `website` -> 202 and nothing stored; `consent: true` required; 201 `{id}`; enqueues `lead.created` for the org's webhooks in the same transaction ([WEBHOOKS.md](WEBHOOKS.md)) |
| POST | /api/v1/public/visits | public | 120/min/IP; `{developmentSlug, kind: UNIT|SCENE, targetId}` adds one view to today's counter; always **204**, also for an unknown slug, an unlisted unit or a target of another development (nothing is counted); 400 for a malformed body. No IP or cookie is stored |
| GET | /api/v1/public/reservations/settings | public | `{enabled, depositAmount}`; `enabled: false` and `depositAmount: null` when `PAYMENT_PROVIDER=none` |
| POST | /api/v1/public/reservations | public | 5/min/IP; `{developmentSlug, unitId, name, email, phone?, consent: true}` -> **201** `{id, checkoutToken, unitCode, depositAmount, currency}`; the token is stored only as sha256; 409 `UNIT_NOT_AVAILABLE` when the unit is not AVAILABLE or belongs to another development; 503 when reservations are off |
| POST | /api/v1/public/reservations/:id/mock-payment | public | 10/min/IP; `{checkoutToken, outcome: approve|decline}`. Approve -> 200 `{status:"PAID", paymentRef}` and the unit becomes RESERVED with a history row; decline -> 402 `PAYMENT_DECLINED`, still pending; 409 `UNIT_NOT_AVAILABLE` if another reservation took the unit (this one becomes FAILED); 404 for a wrong token, unknown id or a reservation no longer pending; 503 when off |
| GET/POST | /admin/developments | development:read / write | |
| GET/PATCH/DELETE | /admin/developments/:id | read / write / write | |
| POST | /admin/developments/:id/publish | development:publish | **201** Publication; 422 `MANIFEST_INVALID`; builds + validates the manifest, excludes UNLISTED units |
| GET | /admin/developments/:id/publications | read | newest first; includes `restoredFromVersion` |
| GET | /admin/developments/:id/publications/compare?from&to | read | PublicationDiff: added/removed/changed entities per section with field changes; 404 for an unknown version, 422 `SNAPSHOT_INCOMPATIBLE` |
| POST | /admin/developments/:id/publications/:version/restore | development:publish | **201** new Publication with `restoredFromVersion`; keeps current unit status and price, drops units that no longer exist or are UNLISTED; audit `development.restore` |
| GET/POST | /admin/developments/:id/units | read / unit:write | |
| GET/PATCH/DELETE | /admin/units/:id | read / unit:write | status changes validated with `canTransition` (409 `INVALID_TRANSITION`) + history row |
| PATCH | /admin/units/:id/availability | unit:availability | SALES allowed; writes `unit_availability_history` |
| GET/POST | /admin/developments/:id/scenes | read / scene:write | |
| GET/PATCH/DELETE | /admin/scenes/:id | read / scene:write | |
| GET/POST | /admin/scenes/:id/hotspots | read / scene:write | NAVIGATION needs a target in the same development |
| PATCH/DELETE | /admin/scenes/:id/hotspots/:hotspotId | scene:write | |
| GET | /admin/developments/:id/floor-plans | read | |
| PATCH | /admin/floor-plans/:id | development:write | name / unitId |
| GET | /admin/developments/:id/gallery | read | |
| GET | /admin/developments/:id/points-of-interest | read | |
| GET | /admin/leads | lead:read | `?developmentId&unitId&page&pageSize` -> `{items,total,page,pageSize}` |
| GET | /admin/reservations | lead:read | `?developmentId&status=PENDING|PAID|FAILED&page&pageSize` -> `{items,total,page,pageSize}`, newest first, with `unitCode`; never includes the checkout token |
| GET | /admin/leads/:id | lead:read | extra endpoint, not in the original contract list |
| GET | /admin/leads/export.csv | lead:export | every cell quoted, `=+-@\t\r` prefixed with `'`; audited; max 10 000 rows |
| POST | /admin/assets/uploads | asset:upload | 201 ticket `{assetId, uploadUrl, expiresAt, requiresCompletion}`; URL valid 10 min; 413 if declared size over the per-kind limit. With S3, `uploadUrl` is a presigned bucket PUT and `requiresCompletion` is true |
| PUT | /api/v1/uploads/:assetId?token= | upload token | local storage only; raw body streamed to disk; 413 over declared size; 422 `UPLOAD_REJECTED` for size mismatch or magic-byte mismatch (asset marked REJECTED) |
| POST | /admin/assets/:id/complete | asset:upload | S3 flow, after the presigned PUT: same size and magic-byte checks, 200 asset; 409 `UPLOAD_MISSING` before the file arrives, 409 `UPLOAD_CLOSED` if no longer pending, 422 `UPLOAD_REJECTED` |
| GET | /admin/assets | read | |
| POST | /admin/jobs | job:create | `{kind: IMPORT|RENDER, assetId, developmentId?}`; asset must be UPLOADED |
| GET | /admin/jobs, /admin/jobs/:id | read | |
| POST | /admin/jobs/:id/retry | job:create | only FAILED with attempts left (409 `NOT_RETRYABLE`) |
| POST | /admin/jobs/:id/review | job:create | `{decision: approve|reject, note?}`; approving a GLB persists the matched mesh -> unit mappings and publishes the file under `published/` |
| GET | /admin/dashboard | read | counts by status, leads 30 d, last publication, jobs by status |
| GET | /admin/developments/:id/analytics | development:read | `?days=7|30|90` (default 30, else 400) -> `{days, units[{id, code, name, views}], scenes[{id, name, unitCode, views}]}`, top 20 of each, most viewed first, UTC days; another org's id is 404 |
| GET/POST | /admin/invitations | member:manage | pending invitations; POST `{email, role}` emails a 7-day link, 409 `USER_EXISTS` / `INVITATION_PENDING`, 503 without SMTP in production. The token is never returned |
| DELETE | /admin/invitations/:id | member:manage | revokes a pending invitation; another org's id is 404 |
| GET | /admin/webhooks | integration:manage | newest first, max 50; never includes the secret |
| POST | /admin/webhooks | integration:manage | `{url, description?}` -> **201** with `secret` (`whsec_…`), shown only here; 400 for a non-http(s) URL, and in production for http or a host that resolves to a private address; audited |
| DELETE | /admin/webhooks/:id | integration:manage | 204; deletes its deliveries too; another org's id is 404; audited |
| GET | /admin/webhooks/:id/deliveries | integration:manage | last 50: event, status `PENDING/DELIVERED/FAILED`, attempts, response status, last error, next attempt |

Scenes include `cubeMap: {baseUrl, tileSize, faceSizes} | null`. Tiles live at
`<baseUrl>/<z>/<face>/<row>/<col>.jpg` (z = 1 is the smallest level) with `<baseUrl>/preview.jpg`. It is
set when the scene uses a processed panorama asset.

Every mutating admin action writes an `audit_events` row. Lead IPs are stored only as a keyed hash (`ipHash`).

## Ejemplos

```bash
curl http://localhost:4000/api/v1/public/developments/lomas-del-faro/manifest
curl -X POST http://localhost:4000/api/v1/public/leads -H "content-type: application/json" \
  -d '{"developmentSlug":"lomas-del-faro","name":"Ana","email":"ana@example.com","message":"Info Villa 6","consent":true}'
```

Los campos exactos de cada cuerpo están en `packages/contracts/src/index.ts` y en `/docs`.
