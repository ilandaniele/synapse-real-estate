# Roadmap

## Fase 1 — MVP (este repositorio)
- Showroom público: home, masterplan 3D con 8 villas, filtros, ficha, tour 360 de Villa 6, plano "Ir a un
  punto", galería, ubicación con POIs, formulario de lead.
- Admin: login, RBAC, CRUD de desarrollos/unidades, disponibilidad con historial, escenas, editor visual de
  hotspots, posicionamiento en plano, publicación versionada, leads + CSV, assets y jobs.
- API Fastify con OpenAPI, PGlite/Postgres, cola de jobs en Postgres.
- Assets demo generados por código.

## Fase 2 — Producción
- [x] Adaptador de storage S3/R2 con presigned URLs reales y CDN delante de `/media`. Hecho el 2026-11-17
  ([STORAGE.md](STORAGE.md)); probado contra RustFS local, no contra R2/AWS reales.
- [x] Panoramas multirresolución en teselas cubemap. Hecho el 2026-11-17: el worker y `pnpm assets:generate`
  cortan cada equirect en caras de 512 a 4096 px con teselas de 512 px ([RENDER_PIPELINE.md](RENDER_PIPELINE.md)).
- Postgres gestionado, backups automáticos, observabilidad (logs estructurados + métricas).
- Gestión de usuarios e invitaciones por organización; recuperación de contraseña por email.
- [x] Modo kiosko para pantallas táctiles (inactividad → vuelta a home, sin barra del navegador). Hecho el
  2026-11-17: [KIOSK.md](KIOSK.md).
- i18n (es/en) del showroom.

## Fase 3 — Pipeline de contenido
- Render worker con Blender CLI (panoramas equirect desde GLB + preset de cámaras).
- Importador IFC básico con `web-ifc` y revisión manual.
- Versionado y diff visual de publicaciones; rollback desde admin.

## Fase 4 — Comercial
- Integración CRM (webhooks de leads), reservas con señal online, analítica de recorridos (qué unidades y
  estancias se visitan más).
