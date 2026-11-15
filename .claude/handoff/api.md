# Backend handoff: @synapse/db, @synapse/api, workers, @synapse/cad-importer

## How to run
```
pnpm assets:generate          # once; creates storage/demo/ (seed refuses to run without storage/demo/manifest.json)
pnpm db:seed                  # idempotent: wipes the two demo orgs and users, re-inserts, publishes v1
pnpm --filter @synapse/api start     # http://localhost:4000, docs at /docs, OpenAPI JSON at /docs/json
pnpm --filter @synapse/api test      # vitest, in-memory PGlite
```
- `DATABASE_URL` empty -> embedded PGlite in `<repo>/.data/pglite`. `memory://` -> throwaway in-memory. `postgres://...` -> real Postgres (not exercised here).
- PGlite is single-process: **stop the API before running `pnpm db:seed`** (and vice versa). In PGlite mode the API embeds the asset worker; the standalone workers only run against real Postgres.
- Migrations run automatically on API start and on seed. New migration: `pnpm --filter @synapse/db db:generate`.
- API env vars: see `.env.example` (`API_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `STORAGE_DIR`, `PUBLIC_API_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `NODE_ENV`, `SEED_PASSWORD`, `BLENDER_PATH`). In production `SESSION_SECRET` must be >= 32 chars and must not start with `change-me`.

## Seed credentials
Printed at the end of `pnpm db:seed`; defined in `apps/api/src/seed/run.ts`. Password for all: env `SEED_PASSWORD`, default `demo-password-123` (local demo only).

| Email | Role | Org |
|---|---|---|
| owner@synapse.local | OWNER | Synapse Demo Realty |
| editor@synapse.local | EDITOR | Synapse Demo Realty |
| sales@synapse.local | SALES | Synapse Demo Realty |
| viewer@synapse.local | VIEWER | Synapse Demo Realty |
| other-owner@otra.local | OWNER | Otra Inmobiliaria (dev `vista-alta`, 2 villas) |

Demo dev: `lomas-del-faro`, 8 villas V1..V8 (V8 UNLISTED, so the public manifest has 7), Villa 6 tour with 6 scenes + hotspots, floor plan, 5 gallery items, 7 POIs, publication v1.
The seed reads `storage/demo/manifest.json` (`panoramas[]` with `initialView`, `floorPlanPoint`, `hotspots`; `model.units[]` with `labelPosition`; `gallery[]`) and falls back to built-in defaults for missing optional fields.

## Auth model
Login sets httpOnly `synapse_session` cookie (jose HS256, 8 h, SameSite=Lax, Secure in prod). Frontends call with `credentials: "include"`; CORS allows credentials for `CORS_ORIGINS`. Every admin row is scoped by `organizationId` from the session; another org's id returns **404**. Permission by role comes from `@synapse/domain` `can(role, action)`.

## Endpoints
Errors always use the `ApiError` shape `{error: {code, message, details?}}`. Bodies are limited to 1 MB except the upload PUT. Admin routes are under `/api/v1/admin` and need the cookie; the permission column is the `Action` checked.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /health | public | `{status:"ok"}` |
| GET | /docs, /docs/json | public | Swagger UI / OpenAPI 3.0 generated from the Zod contracts |
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

## Pipeline
- IMPORT worker (`workers/asset-processing`): GLB -> validated, `Villa_NN` nodes -> suggested mesh mappings, job `REQUIRES_REVIEW`. JPEG/PNG 2:1 -> full/preview/thumb JPEGs in `processed/`, `COMPLETED`. DXF -> `REQUIRES_REVIEW`, reference only (geometry is not converted). DWG/IFC/FBX/etc -> `FAILED` with an explicit message. Unexpected errors retry with backoff up to 3 attempts.
- RENDER worker (`workers/render-processing`): always `FAILED` ("No render backend configured ...") even with `BLENDER_PATH` (script not implemented; no fake renders).
- `claimJob(db, kind)` uses `FOR UPDATE SKIP LOCKED` and reclaims jobs locked for more than 10 min.

## Tests
`pnpm --filter @synapse/api test` (53 tests, 5 files): auth, RBAC, tenancy, leads/CSV, publishing/ETag, uploads, import jobs, render, media serving, OpenAPI. `@synapse/db` 2 tests, `@synapse/cad-importer` 7 tests.

## Known gaps
- Real Postgres untested: migrations and `claimJob` are verified on PGlite only.
- `createDb()` is async and returns `{db, driver, close()}`.
- Manifest media URLs are absolute and baked in at publish time from `PUBLIC_API_URL`; changing the public URL requires re-publishing (re-seeding).
- Demo media cache is 7 days (`/media/*`); change filenames when assets change.
- Standalone workers refuse to run on PGlite; the API embeds the asset worker instead. `apps/api` imports the worker via a relative path (no package dependency).
- `apps/api/tsconfig.json` includes only `src`, so `test/` is not typechecked (vitest transpiles it).
- Dev-only: a random `SESSION_SECRET` is generated when missing, so sessions reset on restart.
- No password change / user management endpoints; no refresh of the session cookie (8 h hard expiry).
- Upload storage is local disk (STORAGE_DIR); S3/presigned URLs, antivirus and CDN purge are not implemented.
- No `DELETE` for floor plans / gallery / POIs and no create/update for gallery and POIs (list only); floor plan patch only edits name/unit.
