# Ingeniería inversa del producto observado

Fuente: tres videos MP4 de WhatsApp (576x1024; 122 s, 65 s, 89 s) en la raíz del repo y sus montajes en
`referencias/`. El detalle timestamped está en [EVIDENCIA_DE_LOS_TRES_VIDEOS.md](EVIDENCIA_DE_LOS_TRES_VIDEOS.md).
Este documento clasifica cada afirmación por nivel de confianza y explica qué se construyó a partir de ella.

**No se recuperó código fuente del producto original.** Nada aquí afirma qué librerías usa. No se copió
código, imágenes, renders ni marca de terceros. Cualquier rótulo visible en los videos ("OBRA NUEVA",
nombres de agencia, logos) se trata como marca ajena y no se reutiliza.

## Escala de confianza
- **CONFIRMADO**: se ve directamente en pantalla en al menos un video.
- **PROBABLE**: inferencia fuerte a partir de lo visible (comportamiento coherente en varios planos).
- **POSIBLE**: compatible con lo visible pero hay alternativas razonables.
- **NO VERIFICADO**: afirmado por texto/overlay del video o por suposición, sin evidencia funcional.

## Observaciones

| # | Observación | Nivel | Implementación en este repo |
|---|---|---|---|
| 1 | Showroom en pantalla táctil vertical con vista aérea de villas en ladera | CONFIRMADO | Masterplan 3D (`@synapse/3d-engine`) con terreno en pendiente y 8 villas en terrazas |
| 2 | Botón "Buscar unidades" y vista "PARCELARIO" con parcelas coloreadas verde/rojo | CONFIRMADO | Filtros + parcelas tintadas por estado (`STATUS_META`) |
| 3 | Badges flotantes "Villa 5/6/7" sobre el modelo | CONFIRMADO | Etiquetas HTML ancladas en 3D, también botones |
| 4 | Ficha "Unidad Villa 6 · Disponible · 895.000 € · Solicitar información · Ver ficha" | CONFIRMADO | Tarjeta de unidad + página de ficha + CTA a formulario de lead. Villa 6 demo usa el mismo precio como dato ficticio |
| 5 | Plano amueblado 2D de la vivienda | CONFIRMADO | SVG propio de planta (`storage/demo/floorplans/villa-6.svg`) |
| 6 | Recorrido interior con tira de miniaturas y rótulo de estancia ("Estar Comedor") | CONFIRMADO | `SceneStrip` + nombre de escena en overlay |
| 7 | Menú Inicio / Masterplan / Áreas / Unidades / Galería / Ubicación / Contacto | CONFIRMADO | Navegación principal del showroom |
| 8 | Mapa satelital de emplazamiento | CONFIRMADO | MapLibre con teselas libres (OpenFreeMap) — no se usan teselas satelitales sin licencia |
| 9 | Modal oscuro "Ir a un punto" con plano y puntos + chips de estancias | CONFIRMADO | `FloorPlanMap` en modal |
| 10 | Navegación superior "RECORRIDO 360 / AMBIENTES" | CONFIRMADO | Barra de tour con menú de ambientes |
| 11 | Arrastrar para mirar alrededor (360) | CONFIRMADO | Marzipano con drag/touch/pinch |
| 12 | El modelo aéreo es 3D en tiempo real (orbit libre) | PROBABLE | Se construyó WebGL real; podría ser también un video/secuencia de frames pre-renderizados |
| 13 | El tour interior es panorámico equirectangular pre-renderizado (no 3D en tiempo real) | PROBABLE | Panoramas equirect + hotspots |
| 14 | Estado comercial sincronizado con un backend administrable | POSIBLE | Backoffice con disponibilidad e historial; publicación versionada |
| 15 | Panoramas multirresolución en teselas | POSIBLE | Teselas cubemap multirresolución con `packages/cubemap`; fallback a preview + full equirect |
| 16 | "De archivo DWG a RENDER 3D en minutos" | NO VERIFICADO | **No se implementa.** El pipeline acepta GLB/glTF/imágenes; DWG/IFC/FBX se rechazan con mensaje explícito; DXF solo se inspecciona. Ver [CAD_PIPELINE.md](CAD_PIPELINE.md) |
| 17 | "Renders 3D realistas y navegables" generados automáticamente | NO VERIFICADO | Render worker sin backend falla explícitamente. Ver [RENDER_PIPELINE.md](RENDER_PIPELINE.md) |
| 18 | Uso de un motor concreto ("RAE" u otro mencionado en material previo) | NO VERIFICADO | No se afirma ni se replica |
| 19 | Código o assets bajo licencias FSL u otras de terceros | NO VERIFICADO | No se copió código de terceros; todos los assets demo son generados por `packages/assets` |

## Hipótesis descartadas
- **Editor tipo Blender web (timeline, keyframes, materiales)**: introducido por un paquete previo por
  incertidumbre; no surge de los videos. Fuera de alcance (ver `docs/legacy/`).
- **Conversión automática DWG → renders fotorrealistas**: no hay evidencia funcional; prometerlo sería engañoso.
