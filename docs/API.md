# API REST

Base: `http://localhost:4000`. Prefijo `/api/v1`. OpenAPI 3 generado desde los contratos Zod: Swagger UI en `/docs`, JSON en `/docs/json` (solo fuera de producción).

## Auth model
Login sets httpOnly `synapse_session` cookie (jose HS256, 8 h, SameSite=Lax, Secure in prod). Frontends call with `credentials: "include"`; CORS allows credentials for `CORS_ORIGINS`. Every admin row is scoped by `organizationId` from the session; another org's id returns **404**. Permission by role comes from `@synapse/domain` `can(role, action)`.

## Endpoints
Errors always use the `ApiError` shape `{error: {code, message, details?}}`. Bodies are limited to 1 MB except the upload PUT. Admin routes are under `/api/v1/admin` and need the cookie; the permission column is the `Action` checked.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /health | public | `{status:"ok"}` |
| GET | /docs, /docs/json | public, not in production | Swagger UI / OpenAPI 3.0 generated from the Zod contracts |
| GET | /media/* | public | Static from STORAGE_DIR. `uploads/` is never served. 7 d cache, nosniff |
| POST | /api/v1/auth/login | public | 10/min/IP; 401 identical for wrong email or password |
| POST | /api/v1/auth/logout | public | clears cookie |
| GET | /api/v1/auth/me | session | SessionUser |
| GET | /api/v1/public/developments/:slug/manifest | public | latest publication; ETag + 304, `Cache-Control: public, max-age=30, stale-while-revalidate=300` |
| POST | /api/v1/public/leads | public | 5/min/IP; honeypot `website` -> 202 and nothing stored; `consent: true` required; 201 `{id}` |
| GET/POST | /admin/developments | development:read / write | |
| GET/PATCH/DELETE | /admin/developments/:id | read / write / write | |
| POST | /admin/developments/:id/publish | development:publish | **201** Publication; 422 `MANIFEST_INVALID`; builds + validates the manifest, excludes UNLISTED units |
| GET | /admin/developments/:id/publications | read | |
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
| GET | /admin/leads/:id | lead:read | extra endpoint, not in the original contract list |
| GET | /admin/leads/export.csv | lead:export | every cell quoted, `=+-@\t\r` prefixed with `'`; audited; max 10 000 rows |
| POST | /admin/assets/uploads | asset:upload | 201 ticket `{assetId, uploadUrl, expiresAt}`; token valid 10 min; 413 if declared size over the per-kind limit |
| PUT | /api/v1/uploads/:assetId?token= | upload token | raw body streamed to disk; 413 over declared size; 422 `UPLOAD_REJECTED` for size mismatch or magic-byte mismatch (asset marked REJECTED) |
| GET | /admin/assets | read | |
| POST | /admin/jobs | job:create | `{kind: IMPORT|RENDER, assetId, developmentId?}`; asset must be UPLOADED |
| GET | /admin/jobs, /admin/jobs/:id | read | |
| POST | /admin/jobs/:id/retry | job:create | only FAILED with attempts left (409 `NOT_RETRYABLE`) |
| POST | /admin/jobs/:id/review | job:create | `{decision: approve|reject, note?}`; approving a GLB persists the matched mesh -> unit mappings and publishes the file under `published/` |
| GET | /admin/dashboard | read | counts by status, leads 30 d, last publication, jobs by status |

Every mutating admin action writes an `audit_events` row. Lead IPs are stored only as a keyed hash (`ipHash`).

## Ejemplos

```bash
curl http://localhost:4000/api/v1/public/developments/lomas-del-faro/manifest
curl -X POST http://localhost:4000/api/v1/public/leads -H "content-type: application/json" \
  -d '{"developmentSlug":"lomas-del-faro","name":"Ana","email":"ana@example.com","message":"Info Villa 6","consent":true}'
```

Los campos exactos de cada cuerpo están en `packages/contracts/src/index.ts` y en `/docs`.
