# Base de datos

Esquema Drizzle en `packages/db/src/schema.ts`; migraciones SQL en `packages/db/migrations/` (se aplican
automáticamente al arrancar el API y al ejecutar el seed).

## Motores
| `DATABASE_URL` | Motor | Uso |
|---|---|---|
| vacío | PGlite embebido en `.data/pglite` | Desarrollo local sin Docker |
| `memory://` | PGlite en memoria | Tests de integración |
| `postgres://…` | PostgreSQL 17 (driver `postgres`) | Producción / docker-compose (no ejercitado aún en este entorno) |

PGlite es monoproceso: no ejecutar `pnpm db:seed` con el API arrancado. En modo PGlite el API embebe el
worker de importación; los workers independientes requieren Postgres real.

## Multitenancy
Todas las tablas de negocio tienen `organization_id` con índice. El API toma la organización de la sesión y
filtra cada consulta por ella; un recurso de otra organización responde 404 (no 403, para no revelar su
existencia). Cubierto por tests de integración (`apps/api/test`).

## Tablas
| Tabla | Propósito |
|---|---|
| `organizations`, `users`, `organization_memberships` | Tenants, usuarios (hash bcrypt) y rol por organización (OWNER/EDITOR/SALES/VIEWER) |
| `developments` | Promoción: slug, textos, ciudad, lat/lng, moneda, hero, modelo |
| `buildings`, `unit_types` | Agrupaciones opcionales |
| `units` | Unidad: código, slug, estado (`unit_status`), precio `numeric(14,2)` + moneda ISO, superficies, dormitorios, baños, plantas, sector, orientación, `label_position` |
| `unit_availability_history` | Cada cambio de estado con usuario, motivo y timestamp |
| `floor_plans` | Plano SVG por desarrollo/unidad |
| `assets`, `panorama_assets`, `model_assets` | Archivos subidos (estado `PENDING_UPLOAD/UPLOADED/REJECTED`, tamaño, sha256, tipo detectado) y derivados |
| `unit_mesh_mappings` | Nombre de malla del GLB → unidad (aprobado en revisión) |
| `scenes`, `scene_hotspots` | Escenas 360 (vista inicial, punto en plano) y hotspots (`NAVIGATION`/`INFO`, yaw/pitch en radianes, escena destino) |
| `gallery_items`, `points_of_interest` | Galería y POIs del mapa |
| `leads` | Contactos: nombre, email, teléfono, mensaje, unidad, consentimiento, `ip_hash` (HMAC, nunca la IP en claro) |
| `import_jobs`, `render_jobs` | Cola de trabajos: estado, intentos, `run_after`, `locked_at`, logs, resultado |
| `audit_events` | Toda acción administrativa mutante |
| `publications` | Snapshot JSON versionado del manifiesto público (`unique(development_id, version)`); `restored_from_version` indica la versión restaurada |

## Índices clave
- `*_org_idx` en todas las tablas de negocio.
- `import_jobs_queue_idx` / `render_jobs_queue_idx` en `(status, run_after)` para el `FOR UPDATE SKIP LOCKED`.
- `leads_created_idx` en `(organization_id, created_at)` para listados y dashboard.

## Publicación
El showroom nunca lee tablas en vivo: lee la última fila de `publications`. Publicar construye el
manifiesto, lo valida con Zod (`DevelopmentManifest`), excluye unidades `UNLISTED` y fija URLs absolutas de
media. Así una edición a medias en admin no aparece en público hasta publicar.

## Seed
`pnpm db:seed` (idempotente): borra y recrea las dos organizaciones demo, usuarios, “Lomas del Faro” con 8
villas, tour de Villa 6 (6 escenas), plano, galería, 7 POIs y publica la versión 1. Requiere haber
ejecutado antes `pnpm assets:generate`.
