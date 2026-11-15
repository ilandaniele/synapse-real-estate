# Backlog, hitos y Definition of Done

## Fase 0 — Investigación (P0)
- [ ] Acceder al video o cargar capturas suministradas.
- [ ] Identificar al creador y repo auténtico (si existe).
- [ ] `EVIDENCIA_DEL_VIDEO.md` con inventario de acciones y renders, nivel de confianza.
- [ ] Identificar si el target es web, nativo, video offline o una mezcla.
- [ ] Priorizar funciones observables y corregir supuestos de arquitectura.
**DoD:** ningún elemento atribuido al original sin evidencia.

## Fase 1 — Editor y viewport (P0)
- [ ] Proyecto Vite + React + TS + lockfile.
- [ ] AppShell con paneles redimensionables.
- [ ] Escena renderizada en Canvas R3F, cámara orbital, grid, 3 primitivas.
- [ ] Seleccionar mesh con raycaster, gizmos move/rotate/scale.
- [ ] Crear/eliminar/renombrar/reparentar entidad.
- [ ] Inspector transforma propiedades numéricas sin perder focus.
- [ ] Guardar y cargar JSON de proyecto con Zod.
- [ ] Undo/redo funcional; shortcuts.
**DoD:** edición y persistencia end-to-end; build verde; sin errores de consola.

## Fase 2 — Render y materiales (P0)
- [ ] Material PBR editable (base color, roughness, metalness, emissive).
- [ ] Luces direccionales/ambientales, sombras activables.
- [ ] Environment HDRI opcional con licencia clara.
- [ ] Importar GLB y manejar errores, modelos corruptos y límites de tamaño.
- [ ] Exportar PNG a resolución elegida.
- [ ] Presets de cámara y guardar escena demo reproducible.
**DoD:** export PNG con encuadre, resolución y colores correctos.

## Fase 3 — Animación (P1)
- [ ] Timeline con fps y duración, keyframes de transform/material/cámara.
- [ ] Evaluador de keyframes puro `evaluateTrackAtFrame()` testeado.
- [ ] Play/pause/seek y loop sin deriva temporal.
- [ ] Guardar/reabrir timeline y recuperar estado exacto.
- [ ] Export PNG de un frame específico.
**DoD:** frame N igual al volver a cargar el proyecto y posicionar playhead en N.

## Fase 4 — Video de calidad (P1)
- [ ] RenderJob reproducible (rango, fps, ancho/alto, formato).
- [ ] Secuencia de frames exportable y validación de archivos faltantes.
- [ ] FFmpeg codifica MP4 H.264 en backend local o worker (si aplica).
- [ ] Progreso, cancelación y limpieza.
- [ ] Comparar frames de preview y video final.
**DoD:** demo exportable en 1080p 30fps, duración correcta, sin frames duplicados/negros.

## Fase 5 — Fidelidad al video (P1)
- [ ] Inventario de funcionalidades únicas observadas en Instagram.
- [ ] Replicar cada interacción priorizada con test Playwright.
- [ ] Ajustar tipografía/layout, shading, luces y cámara según capturas.
- [ ] Documentar divergencias y límites.
**DoD:** checklist de similitud validado contra el video real.

## Fase 6 — Hardening (P2)
- [ ] Pruebas de memoria por sesiones largas.
- [ ] Test pérdida de contexto WebGL.
- [ ] Optimización con instancing y caché.
- [ ] Lighthouse/Accesibilidad básica de controles.
- [ ] Benchmark por hardware y dataset reproducible.
- [ ] Sanitización de assets, límites de upload y seguridad de archivos.
**DoD:** test suite verde y métricas tomadas, no supuestas.

## Comandos previstos
```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Pruebas críticas
1. Crear cubo, moverlo, guardar, recargar y verificar su transformación.
2. Undo/redo sobre material, posición y eliminación de entidad.
3. Reproducir timeline, detener en frame 45, recargar y volver al mismo frame con estado idéntico.
4. Export PNG y comprobar tamaño de imagen real.
5. GLB válido e inválido con feedback correcto.
6. Tamaño/resolución responsive y DPI distinto.
7. Destruir y recargar recursos sin fugas acumulativas de GPU.

## Nota sobre compromisos
La etapa 0 todavía no está completada. La ingeniería de la herramienta **original** depende de que se disponga del post o capturas; las fases técnicas generales sí pueden comenzar ahora.
