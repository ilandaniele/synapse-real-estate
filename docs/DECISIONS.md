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
