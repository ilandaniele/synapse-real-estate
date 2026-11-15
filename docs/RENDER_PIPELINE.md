# Pipeline de render

## Estado actual
- `workers/render-processing` reclama jobs `RENDER` de la tabla `render_jobs`.
- **No hay motor de render configurado.** Sin `BLENDER_PATH`, el job termina `FAILED` con el mensaje
  "No render backend configured (Blender CLI not available)". No se generan imágenes falsas.
- Los assets demo (panoramas y galería) los produce `packages/assets` con un ray-caster CPU propio. Es un
  generador de placeholders con licencia limpia, no un renderer fotorrealista.

## Diseño previsto con Blender CLI (opcional, fuera del MVP)
1. Entrada: GLB aprobado + preset de escena (cámaras por estancia, iluminación, resolución).
2. El worker lanza `blender --background --python render_panorama.py -- <args>` en un proceso hijo con
   timeout y límite de memoria. Cámara panorámica equirectangular (Cycles), 4096x2048 o superior.
3. Salida: JPEG + preview + miniatura → `PanoramaAsset` → job `REQUIRES_REVIEW`.
4. Revisión humana en Admin y asignación a escenas.
5. Opcional: conversión a teselas cubemap multirresolución para Marzipano (`krpanotools` no; usar un script
   propio con `sharp`).

## Requisitos operativos
- Blender instalado en la máquina del worker (GPL; se invoca como proceso externo, no se enlaza).
- GPU recomendada; un panorama interior con Cycles puede tardar de minutos a horas según calidad.
- Cola separada (`RENDER`) para no bloquear la ingesta.

## Rendimiento medido del generador demo
Ver `docs/PROGRESS.md` (sección de rendimiento) — se registra el tiempo real de `pnpm assets:generate`.
