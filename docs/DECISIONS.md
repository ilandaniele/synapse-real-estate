# Decisiones de arquitectura (ADR)

Formato corto: contexto, decisión, consecuencias. Estado: Aceptada salvo indicación.

## ADR-001 Monorepo pnpm con paquetes TS consumidos como fuente
- **Contexto**: showroom, admin, API y workers comparten dominio y contratos.
- **Decisión**: pnpm workspaces; paquetes internos exponen `src/index.ts` sin build; Next usa `transpilePackages`, API y workers corren con `tsx`.
- **Consecuencias**: cero pasos de build intermedios; el typecheck de cada app cubre los paquetes. Para producción se puede empaquetar la API con esbuild más adelante.

## ADR-002 TypeScript 5.9 en lugar de 7.x
- **Contexto**: TS 7 (nativo) disponible, pero el ecosistema Next/ESLint aún apunta a 5.x.
- **Decisión**: fijar `typescript@5.9.3`.
- **Consecuencias**: migración a 7 cuando Next la soporte oficialmente.

## ADR-003 Marzipano para el tour 360
- **Contexto**: se necesitan escenas, hotspots DOM, transiciones y soporte multirresolución; licencia permisiva.
- **Decisión**: `marzipano@0.10.2` (Apache-2.0), cargado con import dinámico solo en cliente.
- **Alternativa**: Photo Sphere Viewer (MIT) — más activo, más pesado. Se puede cambiar detrás de `@synapse/tour-engine`.
- **Consecuencias**: tipos ambientales propios; la API de coordenadas sigue la convención Marzipano (yaw/pitch en radianes).

## ADR-004 three + React Three Fiber + drei para el masterplan
- **Contexto**: GLB con nodos por unidad, picking, highlight, etiquetas, orbit táctil.
- **Decisión**: `three@0.187`, `@react-three/fiber@9`, `@react-three/drei@10`, `frameloop="demand"`.
- **Consecuencias**: picking por nombre de nodo (`Villa_06`) vía `UnitMeshMapping`; lista accesible paralela para teclado y E2E.

## ADR-005 PGlite como fallback local de PostgreSQL
- **Contexto**: el MVP debe correr con `pnpm dev` sin Docker; los tests necesitan una base real.
- **Decisión**: Drizzle ORM; si `DATABASE_URL` está vacío se usa PGlite (Postgres WASM) persistido en `.data/pglite`; `memory://` para tests. Con `DATABASE_URL` se usa el driver `postgres`.
- **Consecuencias**: mismas migraciones SQL en ambos; Docker Compose ofrece Postgres real para staging/producción.

## ADR-006 Cola de jobs en tabla Postgres en lugar de BullMQ/Redis
- **Contexto**: volumen de jobs bajo (ingesta de assets), se quiere evitar otra pieza de infraestructura.
- **Decisión**: tablas `import_jobs`/`render_jobs` con `FOR UPDATE SKIP LOCKED`, reintentos con backoff exponencial y máximo 3 intentos.
- **Consecuencias**: transaccional con el resto de datos. Si el volumen crece, migrar a BullMQ manteniendo el contrato `Job`.

## ADR-007 Almacenamiento local con URLs de subida firmadas (interfaz compatible con S3)
- **Contexto**: uploads grandes no deben pasar por JSON; producción usará S3/R2.
- **Decisión**: el API emite una URL PUT firmada (JWT, 10 min) a su propio endpoint; el archivo se valida por tamaño declarado y magic bytes; archivos inválidos se borran y el asset queda `REJECTED`.
- **Consecuencias**: el adaptador S3 implementará el mismo contrato emitiendo presigned URLs reales (hecho en ADR-013).

## ADR-008 Publicaciones versionadas como snapshot JSON
- **Contexto**: el showroom público no debe ver ediciones a medias; se necesita rollback y cache.
- **Decisión**: `POST /publish` genera un `DevelopmentManifest` validado por Zod y lo guarda como versión N+1. El endpoint público sirve la última versión con ETag y `stale-while-revalidate`.
- **Consecuencias**: una lectura por visita, cacheable en CDN. Las unidades `UNLISTED` nunca salen en el snapshot.

## ADR-009 Assets demo generados por código
- **Contexto**: no hay panoramas ni modelos con licencia; no se deben usar capturas de los videos.
- **Decisión**: `packages/assets` genera panoramas equirect con un ray-caster propio, GLB con `@gltf-transform/core`, plano SVG y galería. Salida en `storage/demo/`, no versionada.
- **Consecuencias**: assets 100 % propios (CC0). Sustituibles por renders reales vía admin.

## ADR-010 Mapa con MapLibre + OpenFreeMap
- **Contexto**: los videos muestran satélite; las teselas satelitales comerciales requieren licencia/clave.
- **Decisión**: MapLibre GL con estilo vectorial de OpenFreeMap (gratuito, atribución OSM obligatoria visible).
- **Consecuencias**: sin satélite en el MVP; añadir proveedor con licencia (MapTiler, etc.) requiere aprobación de costo.

## ADR-011 Pipeline CAD/BIM honesto
- **Contexto**: los videos anuncian "DWG a render en minutos" sin evidencia.
- **Decisión**: formatos soportados automáticamente: GLB/glTF (inspección + sugerencia de mapeo, revisión humana), panoramas JPEG/PNG 2:1. DXF solo inspección. DWG/IFC/FBX/OBJ fallan con mensaje que indica exportar a GLB.
- **Consecuencias**: el estado `REQUIRES_REVIEW` es obligatorio antes de publicar mapeos generados.

## ADR-012 Sesión por cookie httpOnly con JWT firmado
- **Contexto**: admin en otro origen (puerto 3001) consume el API.
- **Decisión**: cookie `synapse_session` httpOnly, SameSite=Lax, firmada HS256 con `jose`; CORS con lista explícita y credenciales.
- **Consecuencias**: en producción admin y API deben compartir dominio registrable (o usar un proxy) para que SameSite=Lax funcione.

## ADR-013 Adaptador de storage S3/R2 con subida presignada y paso de completado
- **Contexto**: producción necesita bucket + CDN; el disco local no escala ni sobrevive a la VM.
- **Decisión**: `packages/storage` define `ObjectStorage` con dos drivers, `LocalStorage` y `S3Storage` (AWS SDK v3, Apache-2.0), elegidos con `STORAGE_DRIVER`. Con S3 el ticket trae una URL PUT presignada con tamaño y content-type firmados, y el admin llama `POST /admin/assets/:id/complete`; ambos caminos terminan en la misma validación (tamaño + magic bytes). Las URLs de media usan `MEDIA_PUBLIC_URL`. En local se usa RustFS (Apache-2.0) porque MinIO dejó de publicar imágenes.
- **Consecuencias**: el bucket necesita CORS para el origen del admin y la CDN no debe exponer `uploads/`. Workers y API comparten el driver. Detalle en [STORAGE.md](STORAGE.md).

## ADR-014 Teselas cubemap multirresolución generadas en el worker
- **Contexto**: un equirect 8K único pesa varios MB y se descarga entero antes de verse nítido; en móvil
  además supera el tamaño de textura.
- **Decisión**: `packages/cubemap` (sharp + proyección propia) corta el equirect en caras de 512 a 4096 px con
  teselas de 512 px y un preview `bdflru` de 256 px, el formato que lee `ImageUrlSource.fromString` de
  Marzipano. Lo usan el worker de assets y `pnpm assets:generate`. La geometría se valida en test contra el
  código de Marzipano. La escena guarda el layout en `tiles` (jsonb) y la API lo publica como `cubeMap`.
- **Consecuencias**: el visor solo baja las teselas visibles al nivel de zoom actual. Procesar un 8K tarda
  más y genera ~130 archivos. Las escenas creadas desde una URL siguen con el equirect único.

## ADR-015 Postgres en contenedor, backups con pg_dump y métricas Prometheus propias
- **Contexto**: PGlite es monoproceso y su volumen no tiene backups; producción necesita workers aparte,
  copias restaurables y métricas.
- **Decisión**: `docker-compose.postgres.yml` añade Postgres 17, el asset worker y un servicio de backup
  (`pg_dump -Fc` + tar del storage local, retención por días). `/health/ready` comprueba la base y `/metrics`
  expone texto Prometheus escrito a mano, tras un bearer token. `prom-client` se descartó: su peer
  `@opentelemetry/api` duplicaba `drizzle-orm` en el lockfile y rompía los tipos.
- **Consecuencias**: sigue siendo una sola VM; los backups quedan en el disco de la VM hasta que el operador
  los copie fuera. Los tests de API corren también contra Postgres con `PG_TEST_URL`, una base por contexto.

## ADR-016 Invitaciones y recuperación de contraseña con tokens de un solo uso por email
- **Contexto**: los owners solo podían crear miembros con una contraseña que tenían que pasar a mano, y no
  había forma de recuperar una contraseña olvidada.
- **Decisión**: tablas `invitations` y `password_resets` que guardan solo el sha256 de un token aleatorio de
  32 bytes. El enlace lleva el token en el fragmento (`#token=`), que no llega a servidores ni logs; la página
  del admin lo lee y lo borra de la barra. El canje es un `UPDATE ... WHERE used_at IS NULL AND expires_at >
  now() RETURNING`, atómico, así que un enlace no se usa dos veces. Pedir un reset responde 202 exista o no el
  email, y el envío no se espera para no delatarlo por tiempo. Canjear un reset quema todos los enlaces
  abiertos del usuario y revoca sus sesiones. Envío con `nodemailer` por
  `SMTP_URL`; sin SMTP, en desarrollo el email va al log y en producción la API responde 503. Mailpit (MIT) en
  `docker-compose.yml` para probar el envío real sin salir de la máquina.
- **Consecuencias**: producción necesita un proveedor SMTP y `ADMIN_PUBLIC_URL`. Sin ellos se sigue pudiendo
  crear miembros con contraseña desde «Miembros».

## ADR-017 i18n del showroom con diccionarios tipados y cookie, sin prefijo de idioma en la URL
- **Contexto**: el showroom solo estaba en español y la Fase 2 pedía español e inglés. Las pantallas táctiles
  y los enlaces ya compartidos usan rutas sin idioma (`/unidades`, `/tour/villa-6`) y los tests E2E dependen
  de ellas.
- **Decisión**: un diccionario por idioma en `apps/showroom/src/i18n` (`es.ts` es la fuente y define el tipo
  `Messages`; `en.ts` debe cumplirlo, así que una clave que falte rompe `tsc`). El idioma vive en una cookie
  `locale` (un año); sin cookie se toma de `Accept-Language` y, si no coincide, español. El servidor lo lee para
  `<html lang>`, los metadatos y el enlace «Saltar al contenido»; el cliente lo recibe por `I18nProvider` y
  `useI18n()`. Cambiar de idioma escribe la cookie, actualiza `lang` y hace `router.refresh()` para que el
  texto renderizado en servidor también cambie. Los paquetes `3d-engine`, `tour-engine` y `ui` reciben una
  prop `locale` con sus propios textos; los nombres de estado comercial viven en `@synapse/domain`. Sin
  librería de i18n: dos idiomas y textos cortos no la justifican.
- **Consecuencias**: las páginas pasan a renderizarse por petición (leen la cookie). El contenido que carga
  el admin (nombres de unidades, estancias, descripciones, POIs) sigue en un único idioma, el del manifiesto;
  traducirlo exigiría campos por idioma en la base de datos. Las URLs no llevan idioma, así que un buscador no
  indexa las dos versiones por separado.

## ADR-018 Rollback de publicaciones como nueva versión, conservando el estado comercial actual
- **Contexto**: la Fase 3 pedía ver qué cambia entre publicaciones y poder volver a una anterior desde el admin.
  Una publicación es un snapshot JSON del manifiesto; el estado comercial y el precio, en cambio, se actualizan
  cada día desde ventas.
- **Decisión**: el historial es de solo anexado. Restaurar la versión N crea una versión nueva con el contenido
  de N y guarda `restored_from_version = N`; nunca se borra ni se reescribe una fila. Al restaurar se toman el
  estado, el precio y la moneda actuales de cada unidad, se descartan las unidades que ya no existen o que hoy
  son `UNLISTED` (con sus estancias, planos y fotos), y el resultado se valida otra vez con `DevelopmentManifest`.
  Un snapshot que no cumple el contrato actual se rechaza con 422 `SNAPSHOT_INCOMPATIBLE`. El diff compara dos
  snapshots por sección e id (`GET …/publications/compare`) y el admin lo muestra antes de confirmar.
- **Consecuencias**: restaurar nunca devuelve a la venta una villa vendida ni muestra un precio viejo. Un medio
  borrado del storage después de la versión N rompe esa imagen o panorama en la versión restaurada; no se
  comprueba la existencia de cada archivo. El diff no compara binarios, solo URLs y campos.

## ADR-019 Importador IFC con web-ifc: volúmenes simples, siempre con revisión
- **Contexto**: la Fase 3 pedía un importador IFC básico. IFC es abierto (ISO 16739) y existe una librería MPL-2.0
  que lo lee en Node (`web-ifc`), a diferencia de DWG.
- **Decisión**: el worker convierte la geometría a GLB con `web-ifc` y `@gltf-transform/core`, agrupada por
  `IfcBuilding`, y deja el job en `REQUIRES_REVIEW` con edificios, elementos, triángulos y el mapeo sugerido. El GLB
  vive en `processed/` hasta que alguien aprueba; la aprobación usa el mismo camino que un GLB subido (copia a
  `published/`, mapeos y `modelPath`). Solo colores de superficie, sin texturas ni simplificación.
- **Consecuencias**: un estudio puede subir el IFC del proyecto sin exportar a mano, pero el resultado es una maqueta
  de volúmenes, no un modelo de showroom final. Para que el mapeo funcione, cada edificio se nombra `Villa_NN` en el
  software BIM. Un IFC grande puede producir un GLB pesado. `web-ifc` está en versión 0.x; fijamos 0.0.78.

## ADR-020 Webhooks de leads firmados, con cola en la base de datos
- **Contexto**: la Fase 4 pide integrar leads con un CRM. Cada CRM tiene su API; un webhook genérico sirve para
  todos, directamente o vía Zapier/Make/n8n, sin escribir un conector por proveedor.
- **Decisión**: el lead y una entrega por URL se guardan en la misma transacción. Un worker dentro del API toma
  entregas con `FOR UPDATE SKIP LOCKED` y una reserva de 60 s, firma `<timestamp>.<cuerpo>` con HMAC-SHA256 (el
  mismo esquema que usan Stripe y otros) y reintenta 6 veces con espera creciente hasta 12 h. Sin Redis ni BullMQ:
  la tabla ya es la cola y el volumen de leads es bajo. En producción la URL debe ser https y pública, comprobado
  al crear y en cada envío. Solo `OWNER` gestiona webhooks (`integration:manage`), porque reciben datos personales.
- **Consecuencias**: un lead nunca se pierde por una caída del CRM y nunca se envía sin guardarse. La entrega es
  al menos una vez: el receptor descarta duplicados por el `id` del evento. La comprobación SSRF no fija la IP
  resuelta, así que un DNS rebinding sigue siendo posible ([WEBHOOKS.md](WEBHOOKS.md)). Rotar el secreto es crear
  otro webhook y borrar el viejo.

## ADR-021 Analítica de recorridos con contadores agregados y sin datos personales
- **Contexto**: la Fase 4 pide saber qué unidades y estancias se visitan más. Una herramienta externa de
  analítica exigiría banner de cookies, tratamiento de datos de terceros y una CSP más abierta.
- **Decisión**: el showroom envía un evento `UNIT` al abrir una ficha o seleccionar una villa en el masterplan, y
  un evento `SCENE` al entrar en cada estancia del tour. El API suma 1 al contador del día (UTC) con un único
  `insert … on conflict do update`, solo si el destino es una unidad listada o una escena del desarrollo. No se
  guarda IP, cookie, user agent ni identificador de visitante, y el showroom no envía nada con Do Not Track o
  Global Privacy Control. El admin muestra el top 20 de unidades y estancias en 7, 30 o 90 días.
- **Consecuencias**: no hay sesiones, embudos ni visitantes únicos; una persona que recarga cuenta dos veces. El
  endpoint público responde 204 aunque el destino no exista, para no revelar ids. La tabla crece una fila por
  destino y día, acotada por el número de unidades y escenas.

## ADR-022 Reservas con señal y proveedor de pago simulado
- **Contexto**: la Fase 4 pide reservar una unidad pagando una señal online. Un proveedor real (Stripe, Redsys)
  exige cuenta, claves y contrato, y cobrar dinero en una demo no es aceptable.
- **Decisión**: el comprador rellena nombre, email, teléfono y consentimiento desde la ficha de una unidad
  disponible. El API crea una reserva `PENDING` con la señal fijada por `RESERVATION_DEPOSIT` y devuelve un token
  de checkout de un solo uso; solo se guarda su sha256. El proveedor `mock` simula el pago: aprobar marca la
  reserva `PAID` y, en la misma transacción, pasa la unidad de `AVAILABLE` a `RESERVED` con una fila de historial
  «Reserva online <ref>»; rechazar responde 402 y deja la reserva pendiente para reintentar. Si otra reserva ya
  se llevó la unidad, la tardía queda `FAILED` y responde 409. `PAYMENT_PROVIDER` vale `none` por defecto en
  producción, que desactiva la reserva (503) y oculta el botón. El admin lista las reservas en «Reservas» con
  el permiso `lead:read`.
- **Consecuencias**: no se mueve dinero. Un proveedor real deberá confirmar el pago por webhook firmado en lugar
  del endpoint `mock-payment`, y gestionar reembolsos. El manifiesto público es una instantánea: la unidad sigue
  apareciendo como disponible hasta la siguiente publicación, aunque el API ya rechaza reservarla (409). Las
  reservas pendientes no caducan solas.

## ADR-023 Stripe Checkout como proveedor de pago real
- **Contexto**: ADR-022 dejó la reserva con un pago simulado. Para cobrar señales de verdad hace falta un
  proveedor que tome los datos de tarjeta sin que pasen por nuestro servidor.
- **Decisión**: `PAYMENT_PROVIDER=stripe` crea una sesión de Stripe Checkout alojada por la API REST
  (form-encoded, sin SDK, timeout 10 s) con la señal en unidades menores, el email del comprador y el id de la
  reserva en `metadata`. El showroom redirige a esa página; Stripe devuelve al comprador a
  `SHOWROOM_PUBLIC_URL/reservar/<slug>?reservation=<id>` y la página consulta
  `GET /reservations/:id/status` con el token de checkout guardado en `sessionStorage`. El pago solo se confirma
  por el webhook `POST /reservations/stripe/webhook`, firmado con `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256 sobre
  `t.body`, 5 min de tolerancia, comparación en tiempo constante); la URL de retorno nunca marca nada como
  pagado. `completed`/`async_payment_succeeded` con `payment_status: paid` liquidan la reserva con la misma
  transacción que el mock; `expired`/`async_payment_failed` la marcan `FAILED`. Los reenvíos son idempotentes.
  Si Stripe falla al crear la sesión, la reserva queda `FAILED` y el API responde 502.
- **Consecuencias**: hace falta una cuenta de Stripe y registrar el webhook en su panel; sin ella se usa `mock`.
  Los tests usan una pasarela falsa inyectada y, si `STRIPE_MOCK_URL` apunta a `stripe/stripe-mock`, validan la
  petición real contra la API. Un pago que llega cuando otra reserva ya se llevó la unidad deja la reserva
  `FAILED` y registra un aviso: el reembolso se hace a mano desde el panel de Stripe. Un checkout cancelado
  queda `PENDING` hasta que Stripe envía `checkout.session.expired` (24 h por defecto).

## ADR-024 Enlaces copiables cuando no hay SMTP
- **Contexto**: sin servidor de correo, invitar y restablecer contraseñas respondía 503 y el equipo no podía
  sumar miembros ni recuperar cuentas en la VM desplegada.
- **Decisión**: sin `SMTP_URL`, `POST /admin/invitations` devuelve el enlace una sola vez en `inviteLink` y el
  admin lo muestra con un botón Copiar. Un propietario puede generar desde «Miembros» un enlace de
  restablecimiento de 1 hora para un miembro (`POST /admin/members/:id/password-reset-link`). Se rechaza con 409
  si el usuario pertenece a otra organización, para que un propietario no tome una cuenta ajena a la suya. Las
  respuestas son `no-store` y quedan auditadas. El «¿Olvidaste tu contraseña?» sigue respondiendo 503 sin SMTP,
  porque no hay canal seguro para entregar el enlace a quien lo pide.
- **Consecuencias**: el propietario es responsable de enviar el enlace por un canal seguro. Con SMTP el
  comportamiento no cambia y el enlace nunca vuelve en la respuesta.
