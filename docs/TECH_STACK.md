# Stack técnico

Versiones fijadas en noviembre de 2026 tras consultar el registro npm (`pnpm view <pkg> version`).
Las licencias se revisaron contra [FUENTES_Y_LICENCIAS.md](FUENTES_Y_LICENCIAS.md).

| Capa | Paquete | Versión | Licencia | Uso |
|---|---|---|---|---|
| Runtime | Node.js | 24.x (≥ 22) | MIT | Todo |
| Gestor | pnpm | 9.15.9 | MIT | Monorepo |
| Lenguaje | typescript | 5.9.3 | Apache-2.0 | Ver ADR-002 |
| Front | next | 16.4.6 | MIT | Showroom y admin (App Router) |
| Front | react / react-dom | 19.3.1 | MIT | UI |
| Estilos | tailwindcss + @tailwindcss/postcss | 4.3.5 | MIT | Estilos utilitarios |
| Estado | zustand | 5.1.0 | MIT | Selección/filtros del showroom |
| Datos | @tanstack/react-query | 5.107.1 | MIT | Fetch y cache cliente |
| Validación | zod | 4.6.7 | MIT | Contratos y OpenAPI (`z.toJSONSchema`) |
| 3D | three | 0.187.0 | MIT | Render WebGL |
| 3D | @react-three/fiber | 9.8.2 | MIT | React renderer para three |
| 3D | @react-three/drei | 10.7.9 | MIT | OrbitControls, useGLTF, Html, Outlines |
| 360 | marzipano | 0.10.2 | Apache-2.0 | Tour panorámico |
| Mapa | maplibre-gl | 6.18.0 | BSD-3-Clause | Ubicación y POIs |
| Teselas | OpenFreeMap | servicio | Datos ODbL (OSM) | Estilo vectorial gratuito, atribución visible |
| Iconos | lucide-react | 1.73.0 | ISC | Iconografía |
| API | fastify | 5.12.8 | MIT | REST `/api/v1` |
| API | @fastify/cors, cookie, rate-limit, swagger, swagger-ui, static | ver package.json | MIT | Plugins |
| Auth | jose 6.2.17, bcryptjs 3.0.3 | | MIT | JWT de sesión y hash de contraseñas |
| DB | drizzle-orm 0.45.4 / drizzle-kit 0.31.11 | | Apache-2.0 | ORM y migraciones |
| DB | @electric-sql/pglite | 0.5.16 | Apache-2.0 / PostgreSQL | Postgres embebido local y tests |
| DB | postgres | 4.1.1 | Unlicense | Driver para Postgres real |
| Assets | sharp | 0.35.5 | Apache-2.0 | Codificación JPEG, previews, teselas cubemap |
| Assets | @gltf-transform/core + functions | 4.5.1 | MIT | Generar e inspeccionar GLB |
| Tests | vitest | 5.1.0 | MIT | Unit e integración |
| Tests | @playwright/test | 1.65.1 | Apache-2.0 | E2E y regresión visual |
| Infra | PostgreSQL 17, RustFS 1.0.6 (S3 local) | Docker | PostgreSQL / Apache-2.0 | docker-compose |
| Storage | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | ^3 | Apache-2.0 | `packages/storage` |

## Herramientas externas opcionales
- **FFmpeg 8.1** — usado solo para extraer fotogramas de los videos de referencia durante el análisis.
- **Blender 4.5 LTS** — opcional, proceso externo (GPL) para renderizar panoramas de GLB con Cycles en GPU; se activa con `BLENDER_PATH` (ver RENDER_PIPELINE.md).

## Descartados
- **BullMQ + Redis**: reemplazado por cola en Postgres (ADR-006).
- **Teselas satelitales comerciales**: requieren clave/licencia de pago (ADR-010).
- **Photo Sphere Viewer**: alternativa válida a Marzipano; no se eligió por peso.
