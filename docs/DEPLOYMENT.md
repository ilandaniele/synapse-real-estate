# Despliegue

## Estado
La entrega de este MVP es **local**. No se creó ningún recurso remoto ni se habilitó nada de pago. Un
despliegue público requiere decidir proveedor y aprobar su coste (ver “Opciones” abajo).

## Local (sin Docker)
```bash
pnpm install
cp .env.example .env          # valores locales; SESSION_SECRET de desarrollo
pnpm assets:generate          # ~16 s, genera storage/demo
pnpm db:seed                  # PGlite en .data/pglite, publica la versión 1
pnpm --filter @synapse/api start        # :4000
pnpm --filter @synapse/showroom dev     # :3000
pnpm --filter @synapse/admin dev        # :3001
```
`pnpm dev` arranca API + showroom + admin en paralelo. Con PGlite el worker de importación corre dentro
del API; el worker independiente (`@synapse/asset-worker`) solo funciona con Postgres real.

## Local con Postgres (docker-compose)
```bash
docker compose up -d postgres
# .env: DATABASE_URL=postgres://synapse:synapse@localhost:5432/synapse
pnpm db:seed && pnpm dev
```
El modo Postgres real no se ejercitó en esta sesión (ver PROGRESS.md). MinIO está en el compose para el
futuro adaptador S3; el storage actual es disco local (`STORAGE_DIR`).

## Producción — requisitos
- `NODE_ENV=production`, `SESSION_SECRET` aleatorio ≥ 32 caracteres (el API se niega a arrancar si no).
- `PUBLIC_API_URL` con la URL pública del API (las URLs de media se fijan al publicar: republicar si cambia).
- `CORS_ORIGINS` con los orígenes exactos del showroom y admin; `TRUST_PROXY=true` detrás de un proxy para
  que el rate limit use la IP real.
- Postgres gestionado con backups; `/media` detrás de CDN; HTTPS obligatorio (cookie `Secure`).
- Showroom y admin: `next build && next start`, con `NEXT_PUBLIC_API_URL` en tiempo de build.

## Opciones de hosting (no ejecutadas — requieren aprobación)
| Opción | Encaja | Coste aproximado |
|---|---|---|
| VPS único (Docker: API + 2 Next + Postgres + Caddy) | Simple, todo el stack tal cual | Desde ~5–10 USD/mes |
| Render / Railway / Fly (servicios separados + Postgres gestionado) | Menos operación | ~20–40 USD/mes |
| Cloudflare (Pages para frontends + R2 para media) | Requiere reescribir el API para Workers y adaptar storage a R2; Postgres externo | Free tier posible, más trabajo |

El API usa Node (Fastify, sharp, sistema de archivos) y no corre en Workers sin cambios; por eso no se
desplegó en Cloudflare por defecto.
