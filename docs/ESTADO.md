# Estado del proyecto

Fase actual: **8 — Entrega**. Desplegado en Oracle Cloud Always Free (`VM.Standard.E2.1.Micro`) el 2026-11-17;
repositorio público en GitHub.

- [x] Fase 0 — Bootstrap: repo git local, Node 24, pnpm 9, Docker, FFmpeg disponibles.
- [x] Fase 1 — Entrevista: omitida por instrucción del proyecto (actuar sin preguntar); supuestos en DECISIONS.md.
- [x] Fase 2 — Documentos: REVERSE_ENGINEERING, DECISIONS, TECH_STACK, ROADMAP, CAD_PIPELINE, RENDER_PIPELINE.
- [x] Fase 3 — Monorepo: paquetes `domain` y `contracts` con tests.
- [x] Fase 5 — Showroom, admin, API, workers, assets.
- [x] Fase 6 — Seguridad: sin hallazgos críticos ni altos; medios corregidos ([SECURITY.md](SECURITY.md)).
- [x] Fase 7 — Tests E2E y rendimiento: 152 unit/integración y 40 E2E en verde (2026-11-17) ([TESTING.md](TESTING.md)).
- [x] Fase 8 — Entrega: VM gratuita con Docker Compose + Caddy en `https://showroom.134-65-28-81.sslip.io/`
  ([DEPLOYMENT.md](DEPLOYMENT.md)); código en `github.com/ilandaniele/synapse-real-estate`.

- [x] Roadmap Fase 2 — Modo kiosko para pantallas táctiles ([KIOSK.md](KIOSK.md)).
- [x] Roadmap Fase 2 — Storage S3/R2 con subida presignada ([STORAGE.md](STORAGE.md)).
- [x] Roadmap Fase 2 — Panoramas multirresolución en teselas cubemap (ADR-014).
- [x] Roadmap Fase 2 — Postgres, backups y métricas ([BACKUPS.md](BACKUPS.md), ADR-015).
- [x] Roadmap Fase 2 — Invitaciones y recuperación de contraseña por email ([EMAIL.md](EMAIL.md), ADR-016).
- [x] Roadmap Fase 2 — i18n es/en del showroom (ADR-017); el contenido del admin sigue en un idioma.
- [x] Roadmap Fase 3 — Diff de publicaciones y rollback desde el admin (ADR-018).
- [x] Roadmap Fase 3 — Importador IFC → GLB con `web-ifc` y revisión manual (ADR-019).

Detalle de avance, comandos y resultados de tests: [PROGRESS.md](PROGRESS.md).
