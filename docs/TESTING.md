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
| `packages/domain` | `src/domain.test.ts` | 17 |
| `packages/assets` | `src/glb.test.ts` | 3 |
| `packages/db` | `test/db.test.ts` | 2 |
| `packages/3d-engine` | `src/helpers.test.ts` | 14 |
| `packages/tour-engine` | `src/geometry.test.ts`, `src/tour-navigator.test.ts` | 16 |
| `tools/cad-importer` | `test/cad-importer.test.ts` | 7 |
| `workers/render-processing` | unit tests | 5 |
| `apps/api` | `test/auth-rbac`, `tenancy`, `leads`, `publish`, `uploads-jobs`, `security`, `deploy-config`, `content`, `members` | 85 |
| `apps/showroom` | `src/lib/kiosk.test.ts` | 3 |
| **Total** | | **152 passed, 0 failed** (run 2026-11-17) |

The API tests start the real Fastify app with an in-memory PGlite database and cover 401, 403, 404, 409,
413, 415 and 429 responses, cross-organization access (IDOR), the role matrix, the lead honeypot and rate
limit, magic-byte checks on uploads, DWG rejection and versioned publishing. `security.test.ts` covers role
changes and removed members on live sessions, the Origin check on writes and the absence of `/docs` in
production. `deploy-config.test.ts` covers relative media URLs and the production guard of the demo seed.

`packages/ui`, `packages/contracts`, `workers/*` and `apps/admin` have no unit tests of their own. `apps/showroom`
has only the kiosk-mode test. Contracts are exercised through the API tests; the apps are covered by E2E.

The API files each start an in-memory PGlite database. On a machine already at full CPU their setup hooks can
exceed the 10 s timeout. In that case run them serially: `pnpm --filter @synapse/api exec vitest run --no-file-parallelism`.

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
| `flow-c-admin-publish` | Admin creates villa V9, publishes version 2 and the public site shows it; VIEWER sees no write actions; bad login shows an error |
| `flow-d-hotspot-editor` | Create a hotspot by clicking the panorama, set its target, preview, publish, and navigate with it on the public tour |
| `flow-e-admin-content` | Gallery item with an uploaded image, point of interest with a coordinate error then fixed, floor-plan list; owner creates a VIEWER member who cannot see «Miembros», gets a wrong-current-password error, changes the password and logs in with it |
| `csp` | Masterplan, tour and location pages log no Content Security Policy violations (catches the production CSP blocking the GLB decoder's WebAssembly) |
| `kiosk` | Kiosk mode with Playwright's simulated clock: after 90 s idle the warning appears and 15 s later the showroom returns home with the search cleared; «Seguir navegando» cancels it; the mode persists across pages and `?kiosk=0` turns it off; no reset outside kiosk mode; the manifest opens fullscreen in kiosk mode |
| `a11y-touch-visual` | Tab through the main menu with visible focus; select a villa with the keyboard; mobile menu, tap a villa, swipe the panorama and tap a hotspot; 15 visual baselines (5 pages × 3 projects, 3D canvas masked) |

**Last full run (2026-11-17): 40 passed, 0 failed, 0 skipped, 2.6 min**, with `E2E_SHOWROOM_PORT=3002` because another
container held port 3000. It includes `kiosk.spec.ts`, `csp.spec.ts` and `flow-e-admin-content.spec.ts`, with the CSP
and security headers active.

On 2026-11-15 the full suite could not be rerun: another project's container held port 3000. `csp.spec.ts`
was run alone against the production Docker stack (`baseURL: http://showroom.localhost`, through Caddy).
It failed before the fix and passed after it. See the local stack test in [DEPLOYMENT.md](DEPLOYMENT.md).

Visual baselines live in `tests/e2e/a11y-touch-visual.spec.ts-snapshots/`. They are platform-specific
(`-win32`). Update them only on purpose, with `npx playwright test --update-snapshots`.

## Not automated

- Two-finger pinch zoom. Playwright has no multi-touch API; one-finger swipe (through CDP) and tap are covered.
- Real GPU rendering. E2E uses SwiftShader.
- Postgres, Redis and S3 backends. All runs use PGlite and local storage.
- Load testing. The app runs locally only; there is no deployed target.
- Screen-reader output. Accessibility checks are keyboard and ARIA attributes only.

## Notes for writing new E2E tests

- Hotspot test ids are `hotspot-<slugify(label)>`.
- On mobile, the masterplan unit list is inside the drawer opened by the "Unidades y filtros" button.
- In the narrow mobile field of view most hotspots start off-screen. Use `swipe()` from `e2e/helpers.ts`
  to pan. It rests the finger before lifting so that Chrome starts no fling, because a fling swallows the
  click of the next tap.
