# Handoff: apps/admin (backoffice)

Next.js 16 App Router, React 19, TS strict, Tailwind 4, TanStack Query. UI in Spanish (`<html lang="es">`).
All data is fetched client-side from `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`) with `credentials: "include"`
through `src/lib/api.ts` (parses the `ApiError` envelope into `ApiRequestError`). Port 3001.

Run: `pnpm --filter @synapse/admin dev` (or `build` then `next start -p 3001`). Typecheck: `pnpm --filter @synapse/admin typecheck`.

## Screens

| Route | File | Notes |
|---|---|---|
| `/login` | `src/app/login/page.tsx` | email + password, `login-error` on 401 |
| (guard) | `src/app/(app)/layout.tsx` | `/auth/me`, redirect to `/login` on 401; header with email, role, org, logout; leads nav hidden without `lead:read` |
| `/` | `(app)/page.tsx` | dashboard: units by status, leads, last publication, jobs by status |
| `/developments` | `(app)/developments/page.tsx` | list + create modal |
| `/developments/[id]` | `(app)/developments/[id]/page.tsx` | ARIA tabs (arrow keys): Datos, Unidades, Escenas, Plano, Publicar (`src/components/dev/*`) |
| `/scenes/[id]` | `(app)/scenes/[id]/page.tsx` | `HotspotEditor` |
| `/leads` | `(app)/leads/page.tsx` | paginated, filters by development/unit, drawer, CSV export (fetch + blob) |
| `/assets` | `(app)/assets/page.tsx` | upload (client validation, ticket POST, XHR PUT with progress), list, "Procesar" creates an IMPORT job; DWG/IFC/FBX/OBJ notice |
| `/jobs` | `(app)/jobs/page.tsx` | status badges, 3 s refetch while PENDING/PROCESSING, detail with logs/result/suggested mesh->unit mapping, Retry, Approve/Reject with note |

RBAC: `useCan(action)` wraps `can(role, action)` from `@synapse/domain`. VIEWER sees everything read-only (forms/buttons hidden or disabled; hotspot editor forced into preview).
Unit status changes only offer targets allowed by `canTransition`, via the availability endpoint with a reason (status is omitted from unit PATCH).

## data-testid

Login: `login-email`, `login-password`, `login-submit`, `login-error`.
Shell: `nav-dashboard|developments|leads|assets|jobs`, `user-email`, `user-role`, `user-org`, `logout`.
Dashboard: `dashboard`, `dash-units-<STATUS>`, `dash-leads`, `dash-publication`, `dash-jobs-<STATUS>`.
Developments: `developments-table`, `dev-row-<slug>`, `dev-create-open`, `dev-create-modal`, `development-form`, `dev-field-*`, `dev-save`.
Tabs: `tab-datos|unidades|escenas|plano|publicar`.
Units: `unit-create-open`, `unit-form`, `unit-field-<name>`, `unit-save`, `unit-row-<code>`, `unit-edit-<code>`, `unit-status-select`, `unit-status-reason`, `unit-status-save`, `unit-status-ok`, `unit-delete`, `unit-delete-confirm`.
Scenes tab: `scene-row-<slug>`, `scene-editor-<slug>`, `scene-edit-<slug>`, `scene-field-*`, `scene-save`.
Floor plan: `plan-editor`, `plan-scene-<slug>`, `plan-clear-<slug>`.
Publish: `publish-button`, `publish-result` (text contains "versión N"), `publish-error`, `publication-row-<version>`.
Hotspot editor: `hotspot-editor` (`data-mode` = `edit|preview`), `hotspot-item-<i>`, `hotspot-type-select`, `hotspot-label-input`, `hotspot-target-select`, `hotspot-description-input`, `hotspot-save`, `hotspot-cancel`, `hotspot-delete`, `hotspot-delete-confirm`, `hotspot-position`, `preview-toggle`, `initial-view-save`, `initial-view-saved`, `scene-title`, `scene-back`. Engine adds `panorama-viewer` and `hotspot-<slugify(label)>`.
Leads: `leads-table`, `lead-row-<i>`, `lead-open-<i>`, `lead-drawer`, `leads-export`, `leads-export-error`, `leads-filter-development`, `leads-filter-unit`, `leads-prev`, `leads-next`.
Assets: `asset-notice`, `asset-file-input`, `asset-upload-submit`, `asset-progress`, `asset-validation-error`, `asset-upload-error`, `asset-upload-ok`, `asset-row-<i>`, `asset-process-<i>`, `asset-process-dev`, `asset-process-ok`.
Jobs: `jobs-table`, `job-row-<i>`, `job-open-<i>`, `job-detail`, `job-status`, `job-logs`, `job-suggestions`, `job-result`, `job-review-note`, `job-approve`, `job-reject`, `job-retry`, `jobs-polling`.

## How the hotspot editor uses the tour-engine

`src/components/HotspotEditor.tsx` renders `PanoramaViewer` from `@synapse/tour-engine` with `scene`, `hotspots`, `editable`, `onPanoClick`, `onHotspotMove`, `selectedHotspotId`, `onHotspotSelect`, `onNavigate`, `initialView` and the ref (`getView`).
- Click on the panorama (edit mode) creates a local draft (pseudo hotspot id `draft`, type INFO, label "Nuevo hotspot", shown as an extra `hotspot-item-<n>`). The side form defaults to NAVIGATION and "Guardar" POSTs it.
- Drag: the engine fires `onHotspotMove` continuously and has no drag-end callback, so the app updates the React Query cache optimistically and sends a PATCH debounced 400 ms (pending saves are flushed on unmount). The draft only updates local state.
- Edit/delete in the side panel (PATCH/DELETE, delete needs a confirm click). "Vista previa" switches `editable` off and re-enables `onNavigate` (navigates between scenes inside the editor without changing the URL). "Guardar vista inicial" PATCHes the scene `initialView` from `getView()` (degrees shown, radians stored).

## Workarounds for engine gaps (packages/* untouched)

1. **Engine crash on hotspot removal / viewer unmount — FIXED in tour-engine.** `hotspot-dom.ts` `destroy()` no longer removes its root and `hotspot-layer.ts` calls `container.destroyHotspot` before `handle.destroy()`. The admin `dom-patch.ts` workaround was removed. The stale `suppressClick` after a drag is also fixed (reset on pointerdown).

## Known limitations

- zod validation messages from `@synapse/contracts` are in English.
- Preview-mode navigation does not update the URL.
- No API endpoint for floor plan upload, so the Plano tab only positions points on the existing plan.
- `test` script mentions vitest but vitest is not a dependency; no unit tests in this app.
- DWG/IFC/FBX/OBJ are accepted by the client uploader (server decides, REJECTED shown) and never converted.

## Verification actually run

- `pnpm --filter @synapse/admin typecheck`: passes.
- `pnpm --filter @synapse/admin build`: passes.
- `next start -p 3001`: curl 200 for `/login`, `/`, `/developments`, `/leads`, `/assets`, `/jobs`; server stopped afterwards (nothing listening on 3001).
- Playwright smoke (ad hoc scripts, system chromium 1248 with SwiftShader, not in repo) against API :4000 passed: guard redirect, login error, dashboard, unit create / status change with reason / delete, floor plan renders, scenes table, publications list, hotspot create / edit / drag persisted / preview navigation / delete, initial view save, leads table + drawer + CSV download, client rejection of an unsupported extension, assets and jobs empty states, logout, VIEWER read-only (no create button, no leads nav, editor in preview, publish disabled).
- Test data created by the smoke runs was deleted; API check afterwards: 8 units, no SMOKE hotspots, 1 publication (v1), cocina initialView restored (yaw 0.2, pitch -0.05, fov 1.5).

## Unverified

- Real file upload (ticket + XHR PUT with progress, 413/422/REJECTED messages), "Procesar" job creation, job polling, Retry, Review approve/reject and mesh mapping display (no assets/jobs existed; not exercised end to end).
- Creating a development, editing Datos, scene create/edit dialog, floor plan drag, publish button click (would create a publication), lead filters/pagination beyond the first page.
- Touch/pinch on the editor, 1920 px layout, keyboard-only flows beyond tab arrow keys.
- `tests/e2e` admin specs were written by another agent; they were not run by me.
