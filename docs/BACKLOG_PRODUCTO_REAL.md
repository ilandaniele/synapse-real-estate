# Backlog para clon funcional de showroom inmobiliario

## Fase 0 — Reconocimiento y demos (P0)
- Inventariar cada fotograma/funcionalidad de `EVIDENCIA_DE_LOS_TRES_VIDEOS.md`.
- Construir 2 experiencias demo independientes: «Casa individual» y «Promoción de villas», usando assets originales de prueba o CC debidamente licenciados.
- Probar los dos modos: a) 360 nodos conectados; b) masterplan GLB seleccionable.
**Aceptación:** el visor de 360 responde a arrastrar, zoom y hotspots; el de GLB selecciona de forma real los meshes.

## Fase 1 — Visor interior 360 (P0)
- Importación manual de 5 panoramas equirectangulares; renderer multires.
- Hotspots en panorama con `yaw`, `pitch`, icono y destino; transiciones crossfade.
- Menú «Ir a un punto»: SVG del piso con botones semánticos de ambientes y estado activo.
- Vista mobile/touch/táctil, fullscreen, pinch/drag, accesibilidad, miniaturas.
**Aceptación:** desde el comedor se puede ir al dormitorio tocando plano o flecha, y regresar con navegación consistente; sin imágenes 2D estáticas engañosas.

## Fase 2 — Masterplan y catálogo (P0)
- Un masterplan GLB que permita orbitar, hacer zoom, seleccionar 8 villas con raycaster.
- Resaltado de unidad disponible/reservada/vendida e información sincronizada.
- Buscar unidades, filtros, ficha con precio/área/dormitorios/baños, botón «Solicitar información».
- Desde Villa 6 (demo) entrar a su tour y regresar al masterplan preservando cámara y filtros.
**Aceptación:** actualizar estado en admin se refleja en el showroom público al refrescar; al clicar otra unidad cambia ficha real.

## Fase 3 — Backoffice (P1)
- Roles y multitenancy, CRUD promoción/unidad/escenas/panorama/hotspot.
- Editor visual de hotspots sobre panorama y mini-plano SVG.
- Assets manager con upload directo S3, proceso de optimización y publicación con versionado.
- Formulario de leads almacenado y exportable.
**Aceptación:** crear nueva villa y tour desde admin sin modificar código.

## Fase 4 — Geografía y extras (P1)
- Mapa satelital licenciado, POIs y distancia por ruta estimada desde proveedor autorizado.
- Galerías, planos PDF, fichas descargables; idioma español/inglés.
- Analytics de sesiones/unidades vistas respetando privacidad.
**Aceptación:** mapa navega y POIs se seleccionan; URLs y licencias de tiles documentadas.

## Fase 5 — Ingesta CAD / renders (P2 investigación separada)
- Adapter pluggable para DXF, IFC y DWG con herramientas legales; import a staging.
- Pipeline semi-automático: reconocer polilíneas/muros, elevación, aberturas, validación/edición humana, materialización en GLB.
- Render offline panorámico Blender por escena, tiles, thumbnails, job status, fallos reintentables.
- Benchmark sobre 3 planos reales con informe: tiempo, correcciones manuales, fidelidad dimensional, costo por render.
**Aceptación:** nunca declarar «DWG a render en minutos» como característica lista sin pruebas reproducibles. Mantener opción de importación manual.

## Lista negativa / evitar scope creep
No construir un editor de materiales, timeline de motion graphics, creación de objetos 3D tipo Blender ni exportación de vídeo como el centro del producto: esas prestaciones NO aparecen como herramientas editables en las demos. No asumir IA propietaria. No afirmar materiales realistas generados automáticamente. No clonar marca, textos ni renders de terceros.

## Escenarios end-to-end fundamentales
1. Seleccionar una villa disponible desde vista cenital, abrir detalle, navegar fotos, ver tour, enviar lead.
2. Abrir tour desde enlace directo, rotar con mouse/touch, elegir punto en minimapa y volver a escena inicial.
3. Admin crea una nueva unidad con precio y estado, publica, usuario visualiza versión nueva.
4. Falla carga panorama o GLB: muestra recuperación, retry y fallback, sin pantalla en blanco.
5. Equipo comercial marca «RESERVED» mientras visitante tiene vista abierta: consistencia eventual y precio/estado revalidado al solicitar información.
