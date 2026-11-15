# Engines handoff: @synapse/tour-engine, @synapse/3d-engine, @synapse/ui

All three are consumed as TS source (`main: src/index.ts`). Every component file starts with `"use client"`; no
`window` access at module top level. CSS is injected by the components themselves (React 19 `<style href precedence>`),
so consumers import **no stylesheet**. No remote fetches (no Draco CDN, no HDRI, no fonts).

## @synapse/tour-engine
Exports: `PanoramaViewer`, `FloorPlanMap`, `SceneStrip`, `useTour`, `slugify`, types `PanoView`, `PanoramaViewerProps`,
`PanoramaViewerHandle`, `FloorPlanMapProps`, `SceneStripProps`, `UseTour`.

### `<PanoramaViewer>`
Props: `scene: Scene`, `hotspots?: Hotspot[]` (default `scene.hotspots`), `onNavigate(targetSceneId)`,
`onViewChange?({yaw,pitch,fov})`, `editable?`, `onPanoClick?({yaw,pitch})` (click, not drag), `onHotspotMove?(id,{yaw,pitch})`,
`selectedHotspotId?`, `onHotspotSelect?(id)`, `className?`, `initialView?: PanoView` (read when a scene is mounted),
`ref?: Ref<PanoramaViewerHandle>` with `lookAt(view: Partial<PanoView>, durationMs = 0)` and `getView(): PanoView | null`.
- Sizing: without `className` it is `width/height: 100%` of the parent; with `className` you size it (e.g. `h-[70vh]`).
- Editable: hotspot click selects (no navigation, INFO popover disabled), hotspots drag with pointer events.
- Fallbacks: loading overlay, error overlay with retry, no WebGL -> static preview image + NAVIGATION hotspots as buttons.
- Root: `data-testid="panorama-viewer"`, `data-scene-id`, `data-scene-slug`, `data-status` (`loading|ready|error|nowebgl`);
  focusable (arrow keys pan, `+`/`-` zoom). Also `panorama-loading`, `panorama-error`, `panorama-retry`, `panorama-fallback`.
- Hotspot button: `data-testid="hotspot-<slugify(label)>"` (e.g. `hotspot-cocina`), `data-hotspot-id`, `data-hotspot-type`,
  `aria-label` = `Ir a <label>` (NAVIGATION) or `Información: <label>` (INFO). Hotspots are plain DOM built imperatively
  (NOT React portals: `react-dom` is not a dependency of this package).
### `<FloorPlanMap plan scenes currentSceneId onSelect variant? editable? onPointMove? className? />`
`variant` `"modal"` (max 900px, default) / `"mini"` (260px). Testids: `floorplan`, `floorplan-point-<scene.slug>`
(aria-label `Ir a <name>`), `floorplan-chip-<scene.slug>`, `floorplan-error`, `floorplan-empty`. Editable: drag markers,
or click empty map to place scene `currentSceneId`; emits `onPointMove(sceneId, {x,y})` (clamped 0..1).
### `<SceneStrip scenes currentSceneId onSelect className? />`
Testids `scene-strip`, `scene-thumb-<scene.slug>`.
### `useTour(scenes, initialSlug?)`
`{ current: Scene | null, goTo(sceneId), back(), canGoBack, bySlug: ReadonlyMap<slug, Scene> }`.

## @synapse/3d-engine
Exports: `Masterplan`, types `MasterplanProps`, `CameraPreset` (`"overview" | "top" | "low"`).
Props: `modelUrl`, `units`, `selectedUnitId`, `hoveredUnitId`, `onSelect(id|null)`, `onHover(id|null)`,
`filterMatch?(id)`, `className?`, `showLabels? = true`, `cameraPreset? = "overview"`.
- Wrapper: `data-testid="masterplan-canvas"`, `data-selected-unit`, `data-hovered-unit` (empty string = none).
- Labels: `masterplan-label-<unit.code>` (code verbatim, e.g. `masterplan-label-V6`).
- Hidden accessible list `ul[aria-label="Unidades del masterplan"]`: buttons `masterplan-unit-<unit.code>`. They are 1x1px,
  opacity 0, hit-testable, so Playwright `click()` works. Visible chips when WebGL is missing (`masterplan-nowebgl`).
- Other testids: `masterplan-loading`, `masterplan-error`, `masterplan-retry`.
- Picking ignores the `Trees` node, terrain/road count as "empty" (-> `onSelect(null)`); drag > 5px is not a click.
- `units` / `filterMatch` can change identity every render (heavy work is keyed on content).

## @synapse/ui
`StatusBadge({status})`, `Price({amount,currency,locale?})`, `Spinner`, `ErrorState({message,onRetry?})`,
`EmptyState({title,description?,action?})`. I added `@synapse/domain: workspace:*` to its package.json.

## Next.js integration
- `transpilePackages: ["@synapse/tour-engine", "@synapse/3d-engine", "@synapse/ui", "@synapse/domain", "@synapse/contracts"]`.
- Both engines are "use client" and SSR-safe, but `Masterplan` (three/R3F/drei, large) is best loaded with
  `next/dynamic(() => import("@synapse/3d-engine").then(m => m.Masterplan), { ssr: false })`. `PanoramaViewer` needs no
  dynamic wrapper (marzipano is `import()`ed in an effect), though `ssr:false` is harmless.
- Panorama equirect assumed 4096 wide (preview 1024); GLB must not be Draco-compressed (no decoder fetched).
- Playwright headless needs WebGL (swiftshader works); otherwise the fallbacks above are what renders.
