# Blueprint compartido (contrato entre builders)

Monorepo pnpm en `C:\Users\Ilan\Desktop\Proyectos\synapse-real-estate`. Node 24, pnpm 9, TS 5.9.3 estricto
(`tsconfig.base.json`: strict, noUncheckedIndexedAccess, Bundler resolution). Paquetes internos se consumen
como fuente TS (`main: src/index.ts`); Next los transpila con `transpilePackages`.

**Todas las dependencias ya están instaladas.** No ejecutar `pnpm add`/`pnpm install` en paralelo con otros
agentes. Si falta una dependencia imprescindible, anotarla en el handoff final en vez de instalarla.

## Paquetes existentes
- `@synapse/domain` (`packages/domain/src`): estados de unidad + colores (`STATUS_META`), dinero decimal
  (`formatPrice`, `toMinorUnits`), coordenadas panorama (`PanoPosition` yaw/pitch en radianes,
  `NormalizedPoint` 0..1), tour (`TourHistory`, `validateTourLinks`), mesh mapping (`buildMeshIndex`,
  `resolveUnitId`), archivos (`detectFileKind`, `validateUpload`, `MAX_UPLOAD_BYTES`), RBAC (`can(role, action)`),
  jobs (`canMoveJob`, `canRetry`, `MAX_JOB_ATTEMPTS`), filtros (`filterUnits`).
- `@synapse/contracts` (`packages/contracts/src/index.ts`): esquemas Zod 4 de todo el API (Development, Unit,
  Scene, Hotspot, FloorPlan, GalleryItem, PointOfInterest, DevelopmentManifest, LeadInput, Lead, LoginInput,
  SessionUser, UnitInput/UnitPatch, AvailabilityInput, DevelopmentInput, SceneInput/ScenePatch,
  HotspotInput/HotspotPatch, UploadRequest/UploadTicket, Asset, JobInput, Job, Publication, ApiError).

## Puertos y URLs
- API Fastify: `http://localhost:4000`, prefijo `/api/v1`, OpenAPI UI en `/docs`, media estática en `/media/*`
  servida desde `STORAGE_DIR` (default `./storage` relativo a la raíz del repo).
- Showroom Next: `http://localhost:3000`. Admin Next: `http://localhost:3001`.
- Front lee `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).
- URLs de media devueltas por el API son **absolutas** (`${PUBLIC_API_URL}/media/...`).

## Datos demo (ficticios, sin marcas de terceros)
- Organización: "Synapse Demo Realty" (slug `synapse-demo`). Segunda org "Otra Inmobiliaria" para tests multitenant.
- Desarrollo: "Lomas del Faro" slug `lomas-del-faro`, ciudad ficticia en costa mediterránea, moneda EUR,
  lat 36.5101, lng -4.8826 (zona costera genérica).
- 8 villas: códigos `V1`..`V8`, nombres `Villa 1`..`Villa 8`, slugs `villa-1`..`villa-8`.
  Villa 6: AVAILABLE, precio `"895000"`, 4 dormitorios, 3 baños, 240 m² interior, 820 m² parcela, 60 m² terraza.
  Mezcla de estados: V1 SOLD, V2 RESERVED, V3 AVAILABLE, V4 SOLD, V5 AVAILABLE, V6 AVAILABLE, V7 RESERVED, V8 UNLISTED.
- Nodos GLB: `Villa_01`..`Villa_08` (grupo raíz por villa), hijos `Villa_0N_Body`, `Villa_0N_Roof`,
  `Villa_0N_Pool`, `Villa_0N_Plot`. Además `Terrain`, `Road`, `Trees`. Unit.meshNames = `["Villa_0N"]`.
- Tour (Villa 6): escenas slug `exterior`, `living`, `comedor`, `cocina`, `dormitorio`, `bano`.

## Assets generados (`pnpm assets:generate` -> `storage/demo/`, gitignored)
```
storage/demo/manifest.json          # índice: archivos, nodos GLB, labelPosition por villa, floorPlanPoint por escena, hotspots sugeridos
storage/demo/models/masterplan.glb
storage/demo/panoramas/<slug>.jpg           # equirect 4096x2048
storage/demo/panoramas/<slug>-preview.jpg   # 1024x512
storage/demo/thumbs/<slug>.jpg              # 320x180
storage/demo/floorplans/villa-6.svg         # viewBox 0 0 1000 700
storage/demo/gallery/<name>.jpg             # 1600x1000 renders propios
storage/demo/hero.jpg
```
El seed del API lee `storage/demo/manifest.json`; si no existe, falla con mensaje "run pnpm assets:generate".

## Componentes compartidos (wave 1 -> wave 2)
- `@synapse/tour-engine`: `<PanoramaViewer scene hotspots onNavigate onPanoClick? editable? onHotspotMove?
  onViewChange? className />` (Marzipano, import dinámico solo cliente), `<FloorPlanMap plan scenes
  currentSceneId onSelect />` (SVG, coordenadas normalizadas), `useTour(scenes, initialSlug)`.
- `@synapse/3d-engine`: `<Masterplan modelUrl units selectedUnitId hoveredUnitId onSelect onHover
  filterMatch?(unitId)=>boolean className />` (R3F + drei, raycasting, highlight, labels de estado,
  orbit/zoom/pinch, fallback de error/carga).

## Reglas
- Sin secretos en código. `.env.example` documenta variables. Sin marcas de terceros ("OBRA NUEVA", etc.).
- Estados `loading/error/empty` en toda UI con datos remotos.
- Commits los hace el orquestador, no los builders.
