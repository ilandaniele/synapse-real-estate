# Postgres, backups y observabilidad

## Postgres en la VM
`docker-compose.postgres.yml` se suma a `docker-compose.prod.yml` y añade tres servicios:

| Servicio | Qué hace |
|---|---|
| `postgres` | `postgres:17-alpine`, volumen `pgdata`, healthcheck con `pg_isready` |
| `asset-worker` | el worker de importación como proceso propio (con PGlite corre dentro del API) |
| `backup` | `deploy/backup/backup-loop.sh`: un backup al arrancar y luego cada `BACKUP_INTERVAL_HOURS` |

El API, el worker y el backup esperan a que Postgres esté sano. El render worker no se incluye: necesita
Blender, que la imagen no trae.

En `.env.production`:

```bash
# openssl rand -hex 24
POSTGRES_PASSWORD=
DATABASE_URL=postgres://synapse:<POSTGRES_PASSWORD>@postgres:5432/synapse
BACKUP_KEEP_DAYS=7
BACKUP_INTERVAL_HOURS=24
```

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml up -d --build
```

El seed de demo, solo la primera vez y con la misma confirmación que en [DEPLOYMENT.md](DEPLOYMENT.md):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml run --rm \
  -e SEED_ALLOW_PRODUCTION=wipe-database api sh -c "pnpm assets:generate && pnpm db:seed"
```

Pasar de PGlite a Postgres no migra datos: la base nueva empieza vacía y se siembra o se carga desde el admin.

## Backups
`deploy/backup/backup.sh` escribe en `./backups` (montado en `/backups`):

- `db-<UTC>.dump`: `pg_dump --format=custom --no-owner --no-privileges`;
- `storage-<UTC>.tar.gz`: el volumen `storage`, solo con `STORAGE_DRIVER=local`. Con S3/R2 el bucket se
  respalda con las herramientas del proveedor (versionado o replicación).

Cada archivo se escribe como `.partial` y se renombra al terminar, así un corte no deja un backup a medias con
nombre válido. Los archivos con más de `BACKUP_KEEP_DAYS` días se borran. `./backups` está en la VM: copiarlo
fuera (otra región, otro proveedor) queda a cargo del operador.

Backup manual:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml exec backup /backup/backup.sh
```

## Restore
`restore.sh` reemplaza los datos actuales (`pg_restore --clean --if-exists --single-transaction`). Parar
antes el API y el worker:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml stop api asset-worker
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml run --rm \
  -v synapse-real-estate_storage:/storage backup \
  /backup/restore.sh /backups/db-20261118T023323Z.dump /backups/storage-20261118T023323Z.tar.gz
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml start api asset-worker
```

El servicio `backup` monta el storage en solo lectura; el `-v` lo vuelve a montar con escritura para el
restore. El nombre real del volumen lo da `docker volume ls`.

### Probado el 2026-11-17
Contra `postgres:17-alpine` local (puerto 5433):

1. `pnpm db:seed` con `DATABASE_URL` a una base nueva.
2. `backup.sh` en un contenedor `postgres:17-alpine`: dump de 84 KB y tarball de storage.
3. `restore.sh` sobre otra base vacía y otro directorio.
4. Conteo de filas de las 23 tablas: idéntico en origen y destino. Los archivos de storage, restaurados.
5. API y `asset-worker` arrancados contra la base restaurada: `/health/ready` 200, manifest 200, el worker
   sondeando la cola y sin worker embebido en el API.

El compose combinado se validó con `docker compose config`; no se levantó entero en la VM.

## Observabilidad

### Logs
El API escribe logs JSON (pino, el logger de Fastify) con `reqId` en cada línea. `docker compose logs api`
los muestra; cualquier colector que lea stdout de Docker los puede indexar.

### Health
| Ruta | Uso |
|---|---|
| `GET /health` | liveness: el proceso responde |
| `GET /health/ready` | readiness: ejecuta `select 1`; 503 `{status:"unavailable"}` si la base no responde |

Ninguna de las dos cuenta para el rate limit.

### Métricas
Con `METRICS_TOKEN` (24 caracteres o más) el API expone `GET /metrics` en formato de texto Prometheus 0.0.4.
Sin token la ruta no existe (404) y no se mide nada. Se pide con `Authorization: Bearer <token>`; la
comparación es de tiempo constante.

| Métrica | Tipo | Etiquetas |
|---|---|---|
| `http_request_duration_seconds` | histogram (5 ms a 5 s) | `method`, `route` (patrón, p. ej. `/api/v1/public/developments/:slug/manifest`), `status_code` |
| `synapse_jobs` | gauge | `kind` (`IMPORT`, `RENDER`), `status` |
| `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_heap_used_bytes`, `process_uptime_seconds` | counter/gauge | — |

La ruta usa el patrón, nunca la URL real, así un slug o id no crea series nuevas. `synapse_jobs` cuenta todas
las organizaciones y no expone ids. Caddy no publica `/metrics`; un Prometheus en la misma red de Docker lo lee
en `http://api:4000/metrics`.
