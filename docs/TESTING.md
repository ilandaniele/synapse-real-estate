# Testing

Every number in this document comes from a real run on the development machine (Windows 11, Node 24,
pnpm 9.15.9) on 2026-11-15. Nothing here is projected.

## Suites

| Suite | Command | Tool | What it covers |
|---|---|---|---|
| Typecheck | `pnpm typecheck` | `tsc --noEmit`, strict | All packages and apps |
| Unit + integration | `pnpm test` | Vitest 5.1 | Domain rules, contracts, engines' pure logic, GLB generator, CAD importer, DB migrations, every API route on in-memory PGlite |
| Build | `pnpm build` | Next 16.4.6 (turbopack) | Production build of showroom and admin |
| E2E | `pnpm test:e2e` | Playwright 1.65.1 (Chromium headless shell) | Key user flows on built apps, keyboard, touch, visual regression |

### Unit and integration (Vitest)

| Package | File(s) | Tests |
|---|---|---|
| `packages/domain` | `src/domain.test.ts` | 19 |
| `packages/assets` | `src/glb.test.ts` | 3 |
| `packages/db` | `test/db.test.ts` | 2 |
| `packages/3d-engine` | `src/helpers.test.ts` | 14 |
| `packages/tour-engine` | `src/geometry.test.ts`, `src/tour-navigator.test.ts`, `src/panorama-source.test.ts` | 18 |
| `tools/cad-importer` | `test/cad-importer.test.ts`, `test/ifc.test.ts` | 11 |
| `workers/render-processing` | unit tests | 5 |
| `packages/storage` | local and S3 drivers | 15 (2 need `S3_TEST_ENDPOINT`) |
| `packages/cubemap` | `src/cubemap.test.ts` | 5 |
| `apps/api` | `test/auth-rbac`, `tenancy`, `leads`, `publish`, `uploads-jobs`, `security`, `deploy-config`, `content`, `members`, `storage-s3`, `observability`, `invitations`, `mailpit`, `publication-history`, `publication-diff.unit`, `webhooks` | 135 (3 need `S3_TEST_ENDPOINT`, 1 needs `MAILPIT_SMTP_URL`) |
| `apps/showroom` | `src/lib/kiosk.test.ts`, `src/i18n/resolve-locale.test.ts` | 8 |
| **Total** | | **229 passed, 0 failed, 6 skipped without `S3_TEST_ENDPOINT` and `MAILPIT_SMTP_URL`** (run 2026-11-18) |

The API tests start the real Fastify app with an in-memory PGlite database and cover 401, 403, 404, 409,
413, 415 and 429 responses, cross-organization access (IDOR), the role matrix, the lead honeypot and rate
limit, magic-byte checks on uploads, DWG rejection, IFC conversion and approval, and versioned publishing. `security.test.ts` covers role
changes and removed members on live sessions, the Origin check on writes and the absence of `/docs` in
production. `deploy-config.test.ts` covers relative media URLs and the production guard of the demo seed and the `ADMIN_PUBLIC_URL` rules. `invitations.test.ts` covers invitations
and password resets: no token in responses or in clear in the database, single use, expiry, revocation,
cross-organization 404, 202 for unknown emails, session revocation, 503 without SMTP in production and the
rate limit. `mailpit.test.ts` sends a real email over SMTP and reads it back from Mailpit ([EMAIL.md](EMAIL.md)).

`packages/ui`, `packages/contracts`, `workers/*` and `apps/admin` have no unit tests of their own. `apps/showroom`
has only the kiosk-mode and locale-resolution tests. Contracts are exercised through the API tests; the apps are covered by E2E.

The API files each start an in-memory PGlite database. On a machine already at full CPU their setup hooks can
exceed the 10 s timeout. In that case run them serially: `pnpm --filter @synapse/api exec vitest run --no-file-parallelism`.

With `PG_TEST_URL` the API tests run on real Postgres instead. Each test context creates its own database
`synapse_test_<uuid>` and drops it on close:

```bash
docker run -d --name synapse-pg-test -e POSTGRES_USER=synapse -e POSTGRES_PASSWORD=synapse -e POSTGRES_DB=synapse -p 5433:5432 postgres:17-alpine
docker compose up -d mailpit
cd apps/api && PG_TEST_URL=postgres://synapse:synapse@localhost:5433/synapse S3_TEST_ENDPOINT=http://localhost:9000 MAILPIT_SMTP_URL=smtp://localhost:1025 npx vitest run --no-file-parallelism
```

Run 2026-11-17: 110 passed and 4 skipped on PGlite; 114 passed on Postgres 17 with RustFS and Mailpit, with no
test database left behind.

### E2E (Playwright)

Configuration: `tests/playwright.config.ts`. Playwright starts three servers:

- API on :4000, re-seeded on every run into an isolated database `pglite://.data/pglite-e2e`;
- showroom on :3000 and admin on :3001 with `next start`.

If another app already listens on 3000, set `E2E_SHOWROOM_PORT` (for example `E2E_SHOWROOM_PORT=3002`).
The API started for the run then allows that origin in CORS.

Before running:

1. Run `pnpm assets:generate` once.
2. Run `pnpm build`.
3. Free port 4000: stop any dev API.

WebGL runs on SwiftShader (software rendering).

Projects:

| Project | Viewport | Runs |
|---|---|---|
| `desktop` | 1440×900 | Everything except `@touch` |
| `kiosk-1920` | 1920×1080 | `@kiosk` and `@visual` |
| `mobile` | Pixel 7 (touch, mobile UA) | `@touch` and `@visual` |

Specs (`tests/e2e`):

| Spec | Flow |
|---|---|
| `flow-a-visit` | Villa 6 360 tour: hotspot, room menu, floor plan modal, thumbnails; fast room switches during a transition do not break the viewer; keyboard focus and accessible hotspots |
| `flow-b-masterplan-lead` | Masterplan, select Villa 6, sheet, tour, another room, back with selection kept, lead submitted; filters synced with the list; lead validation, honeypot and consent |
| `flow-c-admin-publish` | Admin creates villa V9, publishes version 2 and the public site shows it; the diff of v2 lists V9 as added; restoring v1 shows V9 as removed, creates v3 «restaurada de v1» and the public site drops V9; VIEWER sees no write actions; bad login shows an error |
| `flow-d-hotspot-editor` | Create a hotspot by clicking the panorama, set its target, preview, publish, and navigate with it on the public tour |
| `flow-e-admin-content` | Gallery item with an uploaded image, point of interest with a coordinate error then fixed, floor-plan list; owner creates a VIEWER member who cannot see «Miembros», gets a wrong-current-password error, changes the password and logs in with it |
| `flow-f-invitations` | Needs `E2E_SMTP_URL` (Mailpit). Owner invites a SALES member, the link is read from Mailpit, the invitee accepts and appears in «Miembros»; then «¿Olvidaste tu contraseña?», reset link from Mailpit, the old password fails and the new one works |
| `flow-g-webhooks` | Owner creates a webhook to a local receiver from «Integraciones», the secret is shown once; a public lead arrives signed (HMAC checked in the test); the delivery log shows «Entregado»; the webhook is deleted |
| `csp` | Masterplan, tour and location pages log no Content Security Policy violations (catches the production CSP blocking the GLB decoder's WebAssembly) |
| `kiosk` | Kiosk mode with Playwright's simulated clock: after 90 s idle the warning appears and 15 s later the showroom returns home with the search cleared; «Seguir navegando» cancels it; the mode persists across pages and `?kiosk=0` turns it off; no reset outside kiosk mode; the manifest opens fullscreen in kiosk mode |
| `i18n` | Switch to English: `lang`, menu, heading, unit count, status filter and page title change, the choice survives a reload, and switching back restores Spanish; with no cookie an `en-US` browser gets English |
| `a11y-touch-visual` | Tab through the main menu with visible focus; select a villa with the keyboard; mobile menu, tap a villa, swipe the panorama and tap a hotspot; 15 visual baselines (5 pages × 3 projects, 3D canvas masked) |

**Last full run (2026-11-18, after lead webhooks): 44 passed, 0 failed, 0 skipped, 2.0 min**, with
`E2E_SHOWROOM_PORT=3002` and `E2E_SMTP_URL=smtp://localhost:1025`. The run before it had 42 passed and 2 failed:
`flow-f` and the new `flow-g` got «Too many requests» on login, because seven admin flows log in from the same IP.
The E2E API now starts with `LOGIN_RATE_LIMIT=60`; the default stays 10 and the limit itself is covered by the API
security tests.

Previous full run (2026-11-18, after publication rollback): 41 passed, 2 failed, 0 skipped, 2.8 min, with
`E2E_SHOWROOM_PORT=3002` and `E2E_SMTP_URL=smtp://localhost:1025`. `flow-c` failed because the browser had kept the
manifest for its 30 s `max-age` and still showed V9 after the restore; the test now checks the public site from a
new browser context, as a new visitor. `flow-f` hit the login rate limit again. Both run again together after the
fix: 3 passed.

Earlier run (2026-11-18): 42 passed, 1 failed, 0 skipped, 2.3 min, with `E2E_SMTP_URL=smtp://localhost:1025`.
The failure was `flow-f-invitations`: the earlier admin flows had used up the per-IP login rate limit and the
last login got «Too many requests». Run on its own 75 s later it passed (1 passed). The config pins the browser
locale to `es-ES`, because Playwright's default `en-US` would now switch the showroom to English.

Previous full run (2026-11-17): 40 passed, 0 failed, 0 skipped, 2.6 min, with `E2E_SHOWROOM_PORT=3002` because another
container held port 3000. It includes `kiosk.spec.ts`, `csp.spec.ts` and `flow-e-admin-content.spec.ts`, with the CSP
and security headers active. `flow-f-invitations` was added later and run on its own with `flow-e` on desktop
(2026-11-17, `E2E_SMTP_URL=smtp://localhost:1025`): 3 passed. Without `E2E_SMTP_URL` it is skipped.

On 2026-11-15 the full suite could not be rerun: another project's container held port 3000. `csp.spec.ts`
was run alone against the production Docker stack (`baseURL: http://showroom.localhost`, through Caddy).
It failed before the fix and passed after it. See the local stack test in [DEPLOYMENT.md](DEPLOYMENT.md).

Visual baselines live in `tests/e2e/a11y-touch-visual.spec.ts-snapshots/`. They are platform-specific
(`-win32`). Update them only on purpose, with `npx playwright test --update-snapshots`.

## Not automated

- Two-finger pinch zoom. Playwright has no multi-touch API; one-finger swipe (through CDP) and tap are covered.
- Real GPU rendering. E2E uses SwiftShader.
- Redis backend. Postgres is covered by the API suite with `PG_TEST_URL` and the backup test in
  [BACKUPS.md](BACKUPS.md); E2E runs on PGlite. The S3 driver is tested against local RustFS only when
  `S3_TEST_ENDPOINT` is set (see [STORAGE.md](STORAGE.md)); real R2/AWS is not tested.
- Load testing. The app runs locally only; there is no deployed target.
- Screen-reader output. Accessibility checks are keyboard and ARIA attributes only.

## Notes for writing new E2E tests

- Hotspot test ids are `hotspot-<slugify(label)>`.
- On mobile, the masterplan unit list is inside the drawer opened by the "Unidades y filtros" button.
- In the narrow mobile field of view most hotspots start off-screen. Use `swipe()` from `e2e/helpers.ts`
  to pan. It rests the finger before lifting so that Chrome starts no fling, because a fling swallows the
  click of the next tap.
