# Despliegue

## Estado
El stack de producción para **una VM gratuita** (Oracle Cloud Always Free, ARM) está listo en el repo:
`Dockerfile`, `docker-compose.prod.yml`, `deploy/Caddyfile` y `.env.production.example`. Todavía no se
creó ningún recurso remoto. El stack completo se construyó y probó en local (x86_64, Docker Desktop) el
2026-11-15; ver «Prueba local del stack». Falta construirlo en ARM, que será en la VM.

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

## VM única (Oracle Cloud Always Free)

### Arquitectura
Un solo `docker compose` con cuatro servicios:

| Servicio | Qué hace | Puerto |
|---|---|---|
| `caddy` | HTTPS automático (Let's Encrypt) y enrutado | 80, 443 públicos |
| `api` | Fastify + PGlite (volumen `data`) + archivos (volumen `storage`) + worker de importación embebido | 4000 interno |
| `showroom` | `next start` | 3000 interno |
| `admin` | `next start` | 3001 interno |

Caddy sirve cada host con su app y manda `/api/*` y `/media/*` al API **en el mismo origen**. Por eso:

- los frontends se construyen con `NEXT_PUBLIC_API_URL` vacío (llamadas relativas);
- el API corre con `PUBLIC_API_URL` vacío (URLs de media y de subida relativas);
- la cookie de sesión y la CSP quedan same-origin; no hace falta un dominio propio.

Los hosts gratuitos salen de [sslip.io](https://sslip.io), que resuelve `showroom.203-0-113-10.sslip.io` a
`203.0.113.10`. DuckDNS es una alternativa si se prefiere un nombre fijo.

### Lo que hace el usuario (requiere su cuenta)
1. Crear la cuenta de Oracle Cloud (pide tarjeta para verificar identidad; Always Free no cobra mientras
   no se haga *upgrade* a Pay As You Go).
2. Crear una instancia `VM.Standard.A1.Flex` (Ampere ARM, hasta 4 OCPU y 24 GB en Always Free) con Ubuntu
   24.04 y su clave SSH pública.
3. En la *security list* de la VCN abrir TCP 80 y 443 (y UDP 443 para HTTP/3).
4. Pasar la IP pública y el acceso SSH.

### Instalación en la VM
```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
# Ubuntu en Oracle trae reglas iptables que bloquean 80/443 aunque la security list esté abierta:
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Copiar el repo (sin `node_modules`, `.data`, `storage` ni videos; `.dockerignore` ya los excluye de la
imagen) y crear la configuración:

```bash
cp .env.production.example .env.production
# Editar: SHOWROOM_HOST, ADMIN_HOST y CORS_ORIGINS con la IP real;
# SESSION_SECRET=$(openssl rand -hex 32); SEED_PASSWORD=$(openssl rand -base64 24)
chmod 600 .env.production
docker compose -f docker-compose.prod.yml build
```

### Carga inicial de la demo (una sola vez, con el API parado)
PGlite es monoproceso, así que el seed corre en un contenedor de un solo uso antes de levantar el API.
En producción el seed exige la confirmación explícita `SEED_ALLOW_PRODUCTION=wipe-database` y un
`SEED_PASSWORD` de 16 caracteres o más; borra y recrea solo las organizaciones de la demo.

```bash
docker compose -f docker-compose.prod.yml run --rm -e SEED_ALLOW_PRODUCTION=wipe-database api   sh -c "pnpm assets:generate && pnpm db:seed"
docker compose -f docker-compose.prod.yml up -d
```

Comprobar: `https://<SHOWROOM_HOST>/` y `https://<ADMIN_HOST>/login` (usuario `owner@synapse.local` con el
`SEED_PASSWORD` elegido).

### Prueba local del stack
Chrome trata `http://*.localhost` como contexto seguro, así que la cookie `Secure` funciona sin HTTPS. En
`.env.production`: `SHOWROOM_HOST=http://showroom.localhost`, `ADMIN_HOST=http://admin.localhost` y
`CORS_ORIGINS` con esos dos orígenes. Con el prefijo `http://` Caddy no pide certificados. Después, los
mismos comandos de build, seed y `up -d` de arriba. El puerto 80 del host debe estar libre.

Resultado del 2026-11-15 (Windows 11, Docker Desktop, x86_64):

| Comprobación | Resultado |
|---|---|
| `build` de la imagen | 53 s, 1,88 GB |
| Seed sin `SEED_ALLOW_PRODUCTION` | rechazado, como se espera |
| Seed con confirmación + `assets:generate` | 27 s; no imprime la contraseña |
| Rutas del showroom y del admin vía Caddy | 200; URLs de media y manifiesto relativas; `/docs` 404 |
| Cabeceras de seguridad y escritura con `Origin` ajeno | presentes; 403 |
| GLB del masterplan | 200 desde `/media/demo/models/masterplan.glb` |
| `tests/e2e/csp.spec.ts` contra `http://showroom.localhost` | pasa (falló antes de añadir `'wasm-unsafe-eval'`) |
| Login del admin en Chromium | 200; cookie `HttpOnly`, `Secure`, `SameSite=Lax`; `/auth/me` 200 |
| Lead público vía Caddy | 201 |

### Operación
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`.
- Actualizar: copiar el código nuevo, `build` y `up -d`.
- Backup: parar el API (`stop api`) y copiar los volúmenes `data` y `storage`, por ejemplo
  `docker run --rm -v synapse-real-estate_data:/d -v $PWD:/b alpine tar czf /b/data.tgz -C /d .`;
  luego `start api`.
- Limitaciones: una sola máquina, sin réplica ni backups gestionados; Oracle puede reclamar instancias
  Always Free inactivas.

## Producción — requisitos
- `NODE_ENV=production`, `SESSION_SECRET` aleatorio ≥ 32 caracteres (el API se niega a arrancar si no).
- `PUBLIC_API_URL` con la URL pública del API, o vacío si un proxy sirve el API en el mismo origen que cada app
  (las URLs de media se fijan al publicar: republicar si cambia).
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
