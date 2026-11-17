# Synapse Real Estate — showroom inmobiliario 3D / 360

Plataforma para promocionar y vender propiedades desde web y pantallas táctiles: masterplan 3D con villas
seleccionables, fichas de unidad con estado comercial, tour 360 por estancias con plano “Ir a un punto”,
galería, mapa de ubicación, formulario de contacto y un backoffice para gestionar todo y publicar.

Construida a partir del análisis de tres videos de referencia (ver
[docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md)). Es una implementación propia: no reutiliza
código, marcas ni materiales de terceros. El desarrollo “Lomas del Faro”, sus precios y sus imágenes son
**ficticios** y generados por código.

## Requisitos
- Node.js ≥ 22 (probado con 24) y pnpm 9 (`corepack enable`).
- Nada más para el modo local: la base de datos es PGlite embebido. Docker solo si se quiere Postgres real.

## Arranque rápido
```bash
pnpm install
pnpm assets:generate     # panoramas, GLB del masterplan, plano y galería en storage/demo (~16 s)
pnpm db:seed             # crea .data/pglite con datos demo y publica la versión 1
pnpm dev                 # API :4000, showroom :3000, admin :3001
```
- Showroom: http://localhost:3000
- Admin: http://localhost:3001 — usuarios `owner@synapse.local`, `editor@`, `sales@`, `viewer@` (y
  `other-owner@otra.local` de otra organización). Contraseña: la de `SEED_PASSWORD` o, por defecto,
  `demo-password-123` (solo para uso local; nunca en un entorno publicado).
- API + OpenAPI: http://localhost:4000/docs

Copiar `.env.example` a `.env` para cambiar puertos, base de datos o secretos.

## Qué incluye
| Superficie | Funciones |
|---|---|
| Showroom (`apps/showroom`) | Inicio, Masterplan 3D (orbit/zoom/pinch, picking por raycasting, colores por estado, filtros y búsqueda sincronizados), Unidades y ficha, Tour 360 de Villa 6 (hotspots, menú de estancias, miniaturas, plano modal, pantalla completa), Galería, Ubicación (MapLibre + OpenFreeMap, POIs), Áreas, Contacto (lead con validación, honeypot, consentimiento, rate limit) |
| Admin (`apps/admin`) | Login, RBAC OWNER/EDITOR/SALES/VIEWER, aislamiento por organización, CRUD de desarrollos y unidades, cambio de estado con historial, escenas, editor visual de hotspots, posicionamiento en plano, publicación versionada, leads + CSV, subida de assets y revisión de jobs |
| API (`apps/api`) | Fastify REST `/api/v1`, OpenAPI, cookies httpOnly, auditoría, uploads firmados con verificación de magic bytes |
| Pipeline (`workers/*`, `tools/cad-importer`) | Importación asíncrona de GLB/panoramas/DXF con revisión manual; DWG/IFC/FBX/OBJ se rechazan con mensaje explícito; render sin backend configurado falla de forma explícita |

## Comandos
```bash
pnpm typecheck        # TypeScript estricto en todos los paquetes
pnpm test             # Vitest: unit + integración del API (PGlite en memoria)
pnpm build            # build de producción de showroom y admin
pnpm test:e2e         # Playwright (requiere `pnpm build` y el puerto 4000 libre; usa su propia base de datos)
pnpm workers          # workers independientes (solo con Postgres real)
```

## Documentación
| Documento | Contenido |
|---|---|
| [docs/ESTADO.md](docs/ESTADO.md) / [docs/PROGRESS.md](docs/PROGRESS.md) | Estado, pruebas ejecutadas, rendimiento medido, pendientes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Módulos y flujo de datos |
| [docs/REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md) | Observado en los videos vs hipótesis |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Versiones y licencias |
| [docs/DATABASE.md](docs/DATABASE.md) · [docs/API.md](docs/API.md) | Esquema y endpoints |
| [docs/CAD_PIPELINE.md](docs/CAD_PIPELINE.md) · [docs/RENDER_PIPELINE.md](docs/RENDER_PIPELINE.md) | Ingesta y render: qué hace y qué no |
| [docs/TESTING.md](docs/TESTING.md) | Estrategia y cómo correr cada suite |
| [docs/SECURITY.md](docs/SECURITY.md) | Controles, hallazgos de la revisión y riesgos aceptados |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local, Postgres y opciones de hosting |
| [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/ROADMAP.md](docs/ROADMAP.md) | ADRs y próximos pasos |

Los documentos de análisis originales (`docs/EVIDENCIA_DE_LOS_TRES_VIDEOS.md`,
`docs/ARQUITECTURA_INMOBILIARIA.md`, `docs/BACKLOG_PRODUCTO_REAL.md`, `docs/LIBRERIAS_Y_VERIFICACION.md`,
`docs/FUENTES_Y_LICENCIAS.md`) se conservan como contexto. Los montajes de fotogramas de `referencias/` son
material de terceros: quedan solo en copias locales (ignorados por git) y no se publican en el repositorio.

## Atribuciones
Mapa: estilo y teselas de [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, datos © colaboradores de
OpenStreetMap (ODbL). Todos los panoramas, imágenes, el modelo GLB y el plano se generan en
`packages/assets` y no derivan de material de terceros.
