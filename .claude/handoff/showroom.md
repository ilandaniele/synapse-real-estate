# Handoff: apps/showroom

Public showroom (Next 16.4.6, React 19, TS strict, Tailwind 4). Spanish UI. Port 3000.
Data: client-side fetch of `GET {API}/api/v1/public/developments/lomas-del-faro/manifest`, validated with Zod `DevelopmentManifest`, via TanStack Query (staleTime 15 s, refetch every 30 s and on window focus).

## Commands

- `pnpm --filter @synapse/showroom dev` / `build` / `start` (port 3000) / `typecheck`
- `predev` and `prebuild` run `scripts/copy-maplibre-worker.mjs` (copies the maplibre worker and its LICENSE into `public/vendor/`, which is gitignored).
- Env: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

## Routes

| Route | Content |
|---|---|
| `/` | Hero, CTAs, stats, quick links |
| `/masterplan` | 3D masterplan (engine `Masterplan`), filters, unit list, unit card, legend |
| `/areas` | Common areas / amenities |
| `/unidades` | Filterable grid of units |
| `/unidades/[slug]` | Unit sheet (price, area, bedrooms, tour link, gallery, lead form with `unitId`) |
| `/tour/[slug]` | 360 tour: PanoramaViewer, SceneStrip, room buttons, floor plan modal, fullscreen. `?scene=<slug>` deep link |
| `/galeria` | Gallery grid and lightbox |
| `/ubicacion` | maplibre map, POI list and category filter |
| `/contacto` | Lead form |

Dynamic routes are server pages that `await params` and render a client `UnitSheetRoute` / `TourRoute`. Page-level SSR only renders loading states because the manifest is client-fetched.

## Main files (apps/showroom/src)

- `lib/`: `config.ts`, `manifest.ts` (fetch, `sortUnits`, `scenesForUnit`, `unitHasTour`), `query.tsx` (`Providers`, `useManifest`), `store.ts`, `filters.ts`, `format.ts`
- `components/`: `ManifestGate`, `SiteHeader`, `UnitFilters`, `UnitCard`, `MasterplanView`, `UnitSheet`, `LeadForm`, `Modal`, `TourView`, `LocationView`
- `app/`: `layout.tsx`, `globals.css`, `icon.svg`, one folder per route

## Store (zustand, sessionStorage key `synapse-showroom`, version 1)

- State: `selectedUnitCode: string | null`, `filters { query, status, minBedrooms, maxPrice }`
- Actions: `selectUnit`, `setFilter`, `resetFilters`. Export `EMPTY_FILTERS`.
- Selection survives navigation (masterplan -> tour -> back keeps the card).

## Test ids

- Layout: `nav-inicio|masterplan|areas|unidades|galeria|ubicacion|contacto`, `nav-toggle` (mobile), `page-loading`
- Home: `hero-image`, `home-cta-masterplan`, `home-cta-tour`, `stat-units`, `stat-available`
- Filters: `search-input`, `filter-status` (select, value = status or ""), `filter-bedrooms` (select), `filter-price` (number input, NOT a select)
- Units: `unit-count`, `unit-row-<CODE>` (masterplan list buttons), `unit-link-<CODE>` and `unit-row-<CODE>` on `/unidades`, `unit-card` (`data-unit-code`), `unit-card-sheet-link`, `unit-card-tour-link`, `unit-card-close`
- Masterplan: `status-legend`, `masterplan-panel-toggle` (mobile); engine ids `masterplan-canvas`, `masterplan-unit-<CODE>`, `masterplan-nowebgl`, `masterplan-error`, `masterplan-loading`
- Sheet: `unit-sheet` (`data-unit-code`), `unit-sheet-name`, `sheet-tour-link`, `sheet-gallery`, `price`
- Lead form: `lead-form`, `lead-name`, `lead-email`, `lead-phone`, `lead-unit`, `lead-message`, `lead-consent`, `lead-website` (honeypot), `lead-submit`, `lead-success`, `lead-error`. Field errors use `role=alert`.
- Tour: `tour-root` (`data-fullscreen`), `tour-back`, `tour-floorplan-button`, `floorplan-modal`, `floorplan-point-<slug>`, `tour-fullscreen`, `tour-scene-name`, `tour-rooms`, `tour-room-<slug>`; engine ids `panorama-viewer` (`data-status`, `data-scene-slug`), `hotspot-<slug-of-label>`
- Modal: `modal-close`. Gallery: `gallery-item-<i>`, `lightbox`
- Map: `map-container` (`data-status` loading|ready|error), `map-error`, `map-attribution`, `poi-<i>` (index in the FULL POI array), `poi-marker-<i>`, `map-development-marker`, `poi-filter-ALL|<CATEGORY>`, `poi-list`

## Behaviour notes

- Loading / error with retry / empty states use `@synapse/ui`.
- `lang="es"`, skip link, focus-visible outline, reduced motion, touch targets of at least 44 px.
- Lead POST: `/api/v1/public/leads` with honeypot `website` and `consent: true`. Handles 429 and network errors.
- Map: OpenFreeMap liberty style, static attribution always shown. If the style fails or 20 s pass, show `map-error` with retry; POI list still works.
- `tour-back` always pushes `/masterplan` (`router.back()` broke deep links and room switches).

## Engine bugs found (all fixed in the engines; workarounds removed)

1. `tour-engine` double hotspot removal (NotFoundError on unmount). Fixed in the engine; `lib/safe-dom.ts` deleted.
2. `tour-engine` "Stage not in sync with viewer" on fast scene switches. Fixed: only the latest `switchTo` sweeps old scenes. `key={current.id}` removed, so cross-fade is back. Covered by E2E "cambios rápidos de estancia".
3. `3d-engine` UnitList hidden buttons overlapped. Fixed: each hidden button has its own 8 px box. CSS `!important` overrides removed.
4. maplibre-gl 6.18 worker: still vendored to `public/vendor/` by the pre-script plus `setWorkerUrl` (bundler limitation, not a bug of ours).

## Verified (this session)

- `pnpm --filter @synapse/showroom typecheck`: pass.
- `pnpm --filter @synapse/showroom build`: pass (10 routes).
- `next start -p 3000` then curl: 200 for `/`, `/masterplan`, `/unidades`, `/unidades/villa-6`, `/tour/villa-6`, `/galeria`, `/ubicacion`, `/contacto`, `/areas`. Server stopped; port 3000 free.
- Ad-hoc Playwright (chromium-1248 with swiftshader WebGL) against `next start`: masterplan renders in 3D; hidden 3D button selects V6 (card 895.000 EUR, 240 m2, 820 m2, 4 dorm, 3 baños); filters (status AVAILABLE gives 3, price 700000 gives 0, search "villa 6" gives 1); sheet -> tour reaches ready; room switch updates `?scene=`; floor plan modal point navigates and closes; navigation hotspot exterior -> living; modal focus trap and Esc; fullscreen toggle; deep link `?scene=comedor`; masterplan -> tour -> back keeps selection; gallery lightbox arrows and Esc; map ready with 7 markers; BEACH filter gives 2; tiles blocked shows `map-error` and list still works; contact form empty gives 4 alerts, valid gives `lead-success`; 375 px no horizontal overflow on `/unidades`, hamburger nav works.
- Screenshots checked by eye: home, masterplan, selected card, floor plan modal, map at 1440 px, mobile masterplan and tour.

## Not verified / limitations

- Playwright specs now live in `tests/e2e` (flows A–D, keyboard, touch, visual at 1440/1920/Pixel 7); see `docs/TESTING.md`.
- Pinch zoom is not automated; one-finger swipe and tap are.
- Real GPU rendering not tested (swiftshader only). No performance numbers measured.
- `/unidades` and `/areas` not visually inspected after final edits (only HTTP 200 and the overflow check).
- No tour cross-fade (see bug 2).
- Manifest polling 30 s; status changes in admin appear within that window.
- `public/vendor/` is generated by the pre-script; a build without `prebuild` breaks the map.
- Demo DB now holds one smoke-test lead (smoke-showroom@example.com, name "Smoke Test Showroom"). Delete it from admin if a clean leads list is needed.
- OpenFreeMap tiles need internet; offline shows the map error state.
