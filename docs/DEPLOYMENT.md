# Despliegue

## Estado
El stack de producción para **una VM gratuita** (Oracle Cloud Always Free) está en el repo:
`Dockerfile`, `docker-compose.prod.yml`, `deploy/Caddyfile` y `.env.production.example`. Se probó en local
(x86_64, Docker Desktop) el 2026-11-15 y se desplegó el 2026-11-17 en una `VM.Standard.E2.1.Micro`; ver
«Desplegado así». No hubo capacidad ARM (A1) en `sa-vinhedo-1`, así que no se construyó en ARM.

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
Para la VM con Postgres, worker aparte y backups ver [BACKUPS.md](BACKUPS.md). El compose trae RustFS (servicio `s3`)
para probar el driver S3; por defecto el storage es disco local (`STORAGE_DIR`). Ver [STORAGE.md](STORAGE.md).

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

Desde el 2026-11-22 la VM también responde en `synapse-realty.duckdns.org` (showroom) y
`admin.synapse-realty.duckdns.org` (admin); el subdominio DuckDNS está en la cuenta del usuario y apunta a la IP de
la VM. `SHOWROOM_HOST` y `ADMIN_HOST` aceptan listas separadas por comas (Caddy emite un certificado por host), así
que los hosts sslip siguen activos. `CORS_ORIGINS` incluye los cuatro orígenes y `ADMIN_PUBLIC_URL` /
`SHOWROOM_PUBLIC_URL` apuntan a los nombres DuckDNS. Los cuatro orígenes están autorizados en el cliente OAuth de
Google.

El mismo día la pantalla de consentimiento de Google pasó a «In production» (cualquier cuenta de Google puede
ingresar). Google exige un enlace de privacidad para publicar: Branding apunta a `https://synapse-realty.duckdns.org`
y a `/privacidad` (commit `3a9c14a`, desplegado reiniciando solo `showroom`, backup previo `20261122T165144Z`). Con
scopes básicos, sin logo y con menos de 10 dominios no hace falta verificación; subir un logo la exigiría.

Para que la pantalla muestre el nombre de la app («Lomas del Faro», igual al título de la home) se pidió la
verificación de marca. La propiedad `https://synapse-realty.duckdns.org/` quedó verificada en Search Console con el
meta tag `google-site-verification` de `apps/showroom/src/app/layout.tsx` (backup previo `20261123T013204Z`). No hay
que quitar ese tag. El reenvío (Branding → View issues → «I have fixed the issues») se aprobó el 2026-11-23, unas 1,5 h
después de verificar la propiedad, y la marca se publicó con «Publish branding».

### Lo que hace el usuario (requiere su cuenta)
1. Crear la cuenta de Oracle Cloud (pide tarjeta para verificar identidad; Always Free no cobra mientras
   no se haga *upgrade* a Pay As You Go).
2. Crear una instancia `VM.Standard.A1.Flex` (Ampere ARM, hasta 4 OCPU y 24 GB en Always Free) con Ubuntu
   24.04 y su clave SSH pública.
3. En la *security list* de la VCN abrir TCP 80 y 443 (y UDP 443 para HTTP/3).
4. Pasar la IP pública y el acceso SSH.

### Crear la VM cuando no hay capacidad A1
Las regiones con un solo dominio de disponibilidad (por ejemplo `sa-vinhedo-1`) suelen responder
"Out of capacity for shape VM.Standard.A1.Flex". La región *home* no se puede cambiar, así que
`deploy/oracle/launch-a1.sh` reintenta el lanzamiento hasta que haya capacidad.

Requisitos:
- OCI CLI (`uv tool install oci-cli --python 3.12`; si falla con `No module named 'dateutil.rrule'`,
  reinstalar con `--force --reinstall --no-cache`).
- Autenticación una sola vez con `oci setup bootstrap` (abre el navegador; la clave API queda en `~/.oci`,
  nunca en el repositorio).
- Una VCN con subred pública llamada `synapse-public-subnet`, creada en la consola.

```bash
DRY_RUN=1 deploy/oracle/launch-a1.sh   # valida config, subred, AD e imagen sin lanzar
deploy/oracle/launch-a1.sh             # reintenta cada 90 s hasta RUNNING e imprime la IP pública
```

Variables: `SHAPE` (`VM.Standard.A1.Flex`), `OCPUS` (4) y `MEMORY_GB` (24) solo para formas `*.Flex`,
`BOOT_GB` (50), `NAME` (`synapse-showroom`), `SUBNET_NAME`, `SSH_KEY_FILE`
(`~/.ssh/id_ed25519_synapse_oracle.pub`), `RETRY_SECONDS` (90), `MAX_ATTEMPTS` (0 = sin límite),
`COMPARTMENT_ID` (por defecto la *tenancy* de `~/.oci/config`).

El script no lanza nada si ya existe una instancia no terminada con el mismo nombre, solo reintenta los
errores de capacidad, de límite de peticiones (429) y de red (timeouts), y antes de cada intento vuelve a
comprobar que la instancia no exista (un timeout puede haberla creado igual). Asigna IP pública. Con menos recursos
(`OCPUS=2 MEMORY_GB=12`) suele encontrar capacidad antes; todo queda dentro de Always Free.

Alternativa mientras no haya A1: la forma fija `VM.Standard.E2.1.Micro` (AMD x86_64, 1/8 OCPU, 1 GB,
también Always Free) casi siempre tiene capacidad:

```bash
NAME=synapse-micro SHAPE=VM.Standard.E2.1.Micro deploy/oracle/launch-a1.sh
```

Con 1 GB no se puede construir el stack en la VM: las imágenes se construyen en una máquina x86_64 y se
copian (`docker save | ssh … docker load`), y la VM necesita swap.

Desplegado así el 2026-11-17 en `synapse-micro`:

| Paso | Resultado |
|---|---|
| Swap de 4 GB (`/swapfile`, `vm.swappiness=10`) e iptables 80/443 | hecho |
| `docker build --platform linux/amd64` local + `docker save \| gzip -1 \| ssh … docker load` | 1,88 GB, 207 s |
| `pnpm assets:generate` en la VM | unos 20 min (1/8 OCPU); la sesión SSH se cortó, usar `nohup … &` |
| `pnpm db:seed` (con `nohup`) | completo |
| `up -d --no-build` | 4 servicios arriba; memoria 500 MB + 737 MB de swap |
| `https://showroom.134-65-28-81.sslip.io/`, manifiesto, GLB, `https://admin.…/login` | 200; HTTP → 308; HSTS, CSP y `nosniff` presentes |

Redespliegue del 2026-11-18 con reservas (commit `12d4518`): imagen copiada en 228 s y `up -d --no-build`; la
migración `0007_reservations` corre sola al arrancar el API. Después se añadió `PAYMENT_PROVIDER=mock` a
`.env.production` y se reinició solo el API. `GET /api/v1/public/reservations/settings` devuelve
`{"enabled":true,"depositAmount":"3000.00"}`, `/reservar/villa-5` y `/reservations` del admin responden 200 y
`/api/v1/admin/reservations` sin sesión responde 401. No se hizo una reserva de prueba en producción.

Redespliegue del 2026-11-18 con Stripe Checkout y enlaces copiables sin SMTP (commit `8db4a38`): sigue con
`PAYMENT_PROVIDER=mock` y sin SMTP. El showroom, el manifiesto y `/login` del admin responden 200, y
`/api/v1/admin/members` sin sesión responde 401. No se generaron invitaciones ni enlaces en producción.

Paso a Postgres del 2026-11-18 (commit `9571fef`): la VM corre ahora
`docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml`, con los datos de PGlite copiados a Postgres, el `asset-worker` aparte y backups diarios en
`~/synapse/backups`. El volumen PGlite `synapse_data` se conserva como vuelta atrás. Detalle y pruebas en
[BACKUPS.md](BACKUPS.md#en-la-vm-el-2026-11-18). Desde entonces todos los comandos `docker compose` de la VM
llevan los dos `-f`.

Redespliegue del 2026-11-18 con contenido en español e inglés (commit `7c7e988`, ADR-025): backup previo
`db-20261118T172213Z.dump`, imagen copiada y `up -d --no-build`. La migración `0008_content_translations` corrió
al arrancar el API: las siete tablas tienen `translations` con `{}`. El showroom, `/unidades/villa-6`, el
manifiesto y `/login` del admin responden 200. El seed de demo no se volvió a correr en producción, así que el
contenido sigue en español hasta cargar el inglés en el admin y publicar.

Redespliegue del 2026-11-18 con el arreglo de `sortOrder` en escenas (commit `3998e77`): imagen copiada y
`up -d --no-build`, sin migraciones. El API tardó cerca de un minuto en escuchar y mientras tanto Caddy respondía
502. Después el manifiesto, el showroom y `/login` del admin responden 200, y `PATCH /api/v1/admin/scenes/…` sin
sesión responde 401.

Textos en inglés cargados en producción el 2026-11-18. Tras un backup (`db-20261118T193636Z.dump`) se desplegó
la imagen con `pnpm seed:english` y se corrió en el contenedor del API, primero con `--dry-run`:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml exec -T -w /app/apps/api api pnpm seed:english --dry-run
```
El script rellena solo las `translations` vacías cuyo texto en español coincide con el seed de demo, y publica
una versión nueva únicamente si, frente a la última publicada, no cambió nada más que traducciones. Resultado:
39 filas traducidas y `lomas-del-faro` publicada como v2; `vista-alta` sin cambios. El manifiesto en vivo trae
`translations.en` y el tour de la villa 6 en inglés muestra «Living room» y «Go inside».

SMTP activado el 2026-11-19 con Gmail y una contraseña de aplicación (cuenta con verificación en 2 pasos,
myaccount.google.com/apppasswords). El usuario la cargó con un script interactivo en la VM, que guarda una copia
`.env.production.bak-<fecha>` y añade `SMTP_URL=smtps://<correo>:<contraseña>@smtp.gmail.com:465`, `MAIL_FROM` y
`ADMIN_PUBLIC_URL`; la contraseña no pasó por el chat ni por git. Luego se recreó solo el API
(`up -d --no-build api`, porque `restart` no relee `env_file`). `transporter.verify()` dentro del contenedor
autentica contra Gmail, y `POST /api/v1/auth/password-reset/request` responde 202 en lugar de 503. Gmail limita
el envío a unos 500 correos al día; para más volumen, usar un proveedor transaccional.

Para cobrar con Stripe (ADR-023), con una cuenta propia:
1. En el panel de Stripe, crear el endpoint de webhook
   `https://<SHOWROOM_HOST>/api/v1/public/reservations/stripe/webhook` con los eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` y `checkout.session.expired`.
2. En `.env.production`: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` (`sk_live_…` o una clave restringida
   `rk_live_…` con permiso de escritura en Checkout Sessions), `STRIPE_WEBHOOK_SECRET` (`whsec_…` del endpoint) y
   `SHOWROOM_PUBLIC_URL=https://<SHOWROOM_HOST>`. El API no arranca si falta alguna.
3. Reiniciar solo el API. Probar primero con claves `sk_test_…` y una tarjeta de prueba de Stripe.

Stripe en modo prueba activado el 2026-11-19 con una cuenta de Stripe propia, "Synapse", separada de otros
proyectos. Su destino de webhook "synapse-showroom" escucha los cuatro eventos de checkout con carga "snapshot". El
usuario pegó `sk_test_…` y `whsec_…` en un script interactivo de la VM, que exige esos prefijos y guarda una copia
`.env.production.bak-<fecha>`; las claves no pasaron por el chat ni por git. Luego se recreó solo el API
(`up -d --no-build api`). Prueba de punta a punta: reserva de Villa 5 desde el showroom y pago con la tarjeta
4242 4242 4242 4242. El checkout volvió con "Reserva confirmada", el webhook llegó, la reserva quedó `PAID` y la
unidad V5 `RESERVED`. La sesión SSH se cortaba mientras el script esperaba la clave: con
`-o ServerAliveInterval=10 -o ServerAliveCountMax=30` aguanta. Para cobrar de verdad hace falta verificar la empresa
en Stripe y repetir los pasos con claves `sk_live_…` y un webhook del modo real.

Para entrar al admin con Google (ADR-026):
1. En Google Cloud Console, crear un proyecto, configurar la pantalla de consentimiento (tipo «Externo», en
   modo prueba alcanza; sumar como testers los emails que van a entrar) y crear un ID de cliente OAuth de tipo
   «Aplicación web» con el origen JavaScript autorizado `https://<ADMIN_HOST>`. No hace falta URI de
   redirección ni client secret.
2. En `.env.production`: `GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com`. Reiniciar solo el API
   (`up -d --no-build api`); el botón aparece al recargar el login, porque el admin lee el ID de
   `GET /api/v1/auth/providers`. El admin sí necesita la imagen nueva por la CSP.
3. Solo entran emails que ya son miembros. Para sumar a alguien, invitarlo desde «Miembros» con su Gmail.

Redespliegue del 2026-11-20 con Google (commit `f235f1f`): imagen copiada en 253 s y
`up -d --no-build api admin`, sin migraciones. `GET /api/v1/auth/providers` devuelve el client ID y el login
muestra «Iniciar sesión con Google». En la consola de Google el tester agregado no aparecía en la lista al
recargar; si Google rechaza el login con «acceso bloqueado», volver a agregarlo en «Audience → Test users».

Redespliegue del 2026-11-22 con cuentas de comprador (commit `dce1536`): backup previo
`20261122T162859Z`, imagen copiada en 271 s y `up -d --no-build api admin showroom`. La migración
`0009_buyers` corrió al arrancar el API (`buyers` existe, vacía). `GET /api/v1/buyer/me` responde 401 sin
sesión y `/cuenta` responde 200 con el formulario y el botón de Google. Para que un comprador entre con Google,
el origen del showroom tiene que estar entre los orígenes autorizados del cliente OAuth y la app de Google tiene
que estar publicada (en «Testing» solo entran los test users).

Redespliegue del 2026-11-23 con el masterplan detallado (commit `cd448bb`): `up -d --no-build showroom`
con la imagen nueva (iluminación de cielo). El GLB no se regeneró en la VM: se generó local
(`ASSETS_ONLY=masterplan pnpm assets:generate`, 1,98 MB) y se copió con `docker cp` a
`/app/storage/demo/models/masterplan.glb` del contenedor `api`; el anterior quedó como `masterplan.prev.glb`.
`/media/...` se cachea 7 días en el navegador, así que quien ya lo visitó puede ver el modelo viejo hasta recargar
sin caché (desde `65bcb47`, ver abajo). Las `labelPosition` se actualizaron aparte por SQL (ver abajo).

Redespliegue del 2026-11-23 del API (commits `5cec694` resaltado y `65bcb47` caché): `/media/demo/*` responde
`Cache-Control: public, no-cache` con ETag (revalida y da 304 si no cambió), así un GLB o panorama regenerado en
el mismo path se ve sin recargar a mano; el resto de `/media` sigue con 7 días. El API tardó unos 60 s en responder.

2026-11-23, `labelPosition` de V1–V8 de `lomas-del-faro` al alto de los techos del masterplan nuevo
(`manifest.json`, `.model.units[]`), con un `UPDATE units SET label_position = ...` en una transacción
(sin re-sembrar). Antes: V1–V4 `[x, 12.4, -38]`, V5–V8 `[x, 5.8, 32]` con x = -66, -22, 22, 66.
Ahora: V1 13.9, V2 16.4, V3 13.6, V4 13.9, V5 9.8, V6 7, V7 7.3, V8 9.8 (solo cambia Y). El showroom lee la
última publicación (snapshot), así que después se insertó por SQL la publicación v3: copia de la v2 con
`version`, `publishedAt` y las `labelPosition` de `units` (por `code`), mismo `published_by`, sin fila de auditoría.
Tiene 7 unidades porque V8 está `UNLISTED`. Volver atrás: `DELETE FROM publications WHERE version = 3` de ese desarrollo.

Mismo día, etiquetas 2 m más arriba (el generador usa `altura + 5` en vez de `+ 3`): `units.label_position` de
V1–V8 con Y = 15.9, 18.4, 15.6, 15.9, 11.8, 9, 9.3, 11.8 y publicación v4 por SQL, copia de la v3 con esas
posiciones. Volver a la v3: `DELETE FROM publications WHERE version = 4` de ese desarrollo.

Redespliegue del 2026-11-23 del showroom (commit `82006d8`): las etiquetas del masterplan se apoyan en un palito
y quedan por encima del techo en pantalla. `up -d --no-build showroom`; Caddy dio error unos segundos mientras arrancaba.

Redespliegue del 2026-11-23 del showroom (commit `1aadd95`): tocar o hacer clic en la etiqueta de una villa la
deja seleccionada (antes el canvas lo tomaba como clic en el vacío y deseleccionaba). Verificado en producción
con Playwright en Pixel 7 y Desktop Chrome. La VM no tiene repo git: solo `docker load` + `up -d --no-build showroom`.

Redespliegue del 2026-11-23 del showroom (commit `a28d6f6`): en pantallas verticales la cámara se aleja hasta
que el masterplan entra en el ancho. Verificado en producción con Playwright: ninguna etiqueta cortada en Pixel 7
ni en Desktop Chrome, y tocar una etiqueta sigue seleccionando la villa.

Redespliegue del 2026-11-24 del showroom (commits `37f9a0a` y `ddcf4e1`): en pantallas verticales el masterplan
encuadra solo las villas, y las etiquetas de los hotspots del tour se corren hacia adentro junto al borde.
Verificado en producción con Playwright en Pixel 7: las 7 etiquetas del masterplan y la del punto de información
entran en el ancho.

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
