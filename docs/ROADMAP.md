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
- [x] Postgres, backups automáticos y observabilidad. Hecho el 2026-11-17: compose con Postgres, worker y
  backups diarios; `/health/ready` y `/metrics` Prometheus ([BACKUPS.md](BACKUPS.md)). Postgres en contenedor
  propio, no gestionado.
- [x] Gestión de usuarios e invitaciones por organización; recuperación de contraseña por email. Hecho el
  2026-11-17: enlaces de un solo uso por SMTP, probados con Mailpit local ([EMAIL.md](EMAIL.md)).
- [x] Modo kiosko para pantallas táctiles (inactividad → vuelta a home, sin barra del navegador). Hecho el
  2026-11-17: [KIOSK.md](KIOSK.md).
- [x] i18n (es/en) del showroom. Hecho el 2026-11-18: interfaz completa en los dos idiomas, selector en la
  cabecera y cookie ([DECISIONS.md](DECISIONS.md), ADR-017). El contenido cargado en el admin no se traduce.

## Fase 3 — Pipeline de contenido
- [x] Render worker con Blender CLI (panoramas equirect desde GLB + preset de cámaras). Ya existía:
  `workers/render-processing` y [RENDER_PIPELINE.md](RENDER_PIPELINE.md).
- [x] Importador IFC básico con `web-ifc` y revisión manual. Hecho el 2026-11-18: IFC → GLB por edificio, mapeo
  sugerido y publicación del GLB al aprobar (ADR-019, [CAD_PIPELINE.md](CAD_PIPELINE.md)).
- [x] Versionado y diff visual de publicaciones; rollback desde admin. Hecho el 2026-11-18: diff por sección
  entre dos versiones y restauración como versión nueva que conserva estado y precio actuales (ADR-018).

## Fase 4 — Comercial
- [x] Integración CRM con webhooks de leads firmados y reintentos. Hecho el 2026-11-18 (ADR-020,
  [WEBHOOKS.md](WEBHOOKS.md)).
- [x] Analítica de recorridos: qué unidades y estancias se visitan más. Hecho el 2026-11-18: contadores diarios
  agregados por unidad y estancia, sin datos personales, y página «Analítica» en el admin (ADR-021).
- [x] Reservas con señal online. Hecho el 2026-11-18 con un proveedor de pago simulado: el comprador reserva
  desde la ficha, paga la señal en un checkout de demostración y la unidad pasa a RESERVADA (ADR-022). Falta
  integrar un proveedor real (Stripe, Redsys) antes de cobrar.
