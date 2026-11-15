# Arquitectura

Monorepo pnpm con tres superficies separadas (showroom público, backoffice, pipeline de ingesta/render)
que comparten contratos tipados.

```
apps/
  showroom/   Next.js 16 — web pública y pantallas táctiles (puerto 3000)
  admin/      Next.js 16 — backoffice con login y RBAC (puerto 3001)
  api/        Fastify 5 — REST /api/v1, OpenAPI en /docs, media estática en /media (puerto 4000)
packages/
  domain/     Reglas puras: estados comerciales, dinero, coordenadas, tour, permisos, archivos, jobs, filtros
  contracts/  Esquemas Zod compartidos (API ↔ frontends), generan el OpenAPI
  db/         Esquema Drizzle, cliente Postgres/PGlite, cola de jobs
  3d-engine/  <Masterplan/>: three + R3F + drei, carga GLB, raycasting por nombre de malla
  tour-engine/<PanoramaViewer/>, <FloorPlanMap/>, <SceneStrip/>, useTour: Marzipano + SVG
  ui/         Componentes básicos (StatusBadge, Price, Spinner, ErrorState, EmptyState)
  assets/     Generador de assets demo con licencia limpia (panoramas, GLB, plano, galería)
workers/
  asset-processing/   Jobs IMPORT (GLB, panoramas, DXF; rechazo explícito de DWG/IFC/FBX/OBJ)
  render-processing/  Jobs RENDER (sin backend configurado → FAILED explícito)
tools/
  cad-importer/       Funciones puras de inspección de formatos CAD/3D
tests/                Playwright E2E + regresión visual
```

## Flujo de datos
1. Admin edita datos (desarrollo, unidades, escenas, hotspots) vía `/api/v1/admin/*` con cookie de sesión.
2. Admin publica → el API construye y valida un `DevelopmentManifest` y lo guarda versionado.
3. El showroom pide `GET /api/v1/public/developments/:slug/manifest` (ETag, cache 30 s +
   stale-while-revalidate) y renderiza todo desde ese JSON. Los binarios (GLB, panoramas) salen de `/media`
   con cache de 7 días; en producción irían detrás de un CDN.
4. Leads: `POST /api/v1/public/leads` con validación Zod, honeypot, consentimiento y rate limit por IP.
5. Uploads: ticket firmado (10 min) → `PUT` directo → verificación de tamaño y magic bytes → job IMPORT →
   revisión humana en admin → (si aplica) mapeo de mallas → publicación.

## Decisiones principales
Ver [DECISIONS.md](DECISIONS.md) (ADR-001…012): monorepo con paquetes como fuente TS, Fastify, Drizzle +
PGlite, cola en Postgres en lugar de Redis, Marzipano para 360, R3F para masterplan, OpenFreeMap para
teselas, publicación por snapshot, assets demo generados por código.

## Selección en el masterplan
El GLB nombra cada villa `Villa_NN` con submallas (`_Body`, `_Roof`, `_Pool`, `_Plot`). `buildMeshIndex`
(`@synapse/domain`) resuelve cualquier submalla a su unidad mediante `meshNames` del manifiesto; el
raycasting de R3F entrega la malla tocada y se resuelve el código de unidad. El estado se colorea con
`STATUS_META`.

## Tour 360
Marzipano con proyección equirectangular. Convención: yaw/pitch en radianes, pitch positivo hacia arriba.
Los hotspots son nodos DOM posicionados por Marzipano; el plano es un SVG con puntos normalizados (0–1)
por escena. Navegación validada por `validateTourLinks` (sin destinos rotos) al publicar.

## Seguridad (resumen)
Cookie httpOnly SameSite=Lax (Secure en producción), JWT HS256 de 8 h, bcrypt, RBAC por acción
(`can(role, action)`), aislamiento por organización en cada consulta, rate limit en login y leads, límite de
cuerpo 1 MB, uploads con límite por tipo y verificación de magic bytes, `/media/uploads` nunca servido, CSV
con neutralización de fórmulas, auditoría de acciones. Detalle en [TESTING.md](TESTING.md) y el informe de
seguridad en [PROGRESS.md](PROGRESS.md).
