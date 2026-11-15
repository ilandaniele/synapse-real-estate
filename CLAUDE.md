# Claude Code — Construir plataforma inmobiliaria 3D basándose en tres videos reales

## Contexto
El usuario adjuntó 3 MP4 y 3 enlaces de Instagram, que muestran un **showroom inmobiliario**, no un editor 3D generalista:
- https://www.instagram.com/reel/DfsVPUIIpxv/
- https://www.instagram.com/p/Dfp2F_3sovy/
- https://www.instagram.com/reel/DfoFLlfxJ2d/

Existe evidencia visual resumida y timestamped en `docs/EVIDENCIA_DE_LOS_TRES_VIDEOS.md` y montajes `referencias/*.jpg`. El paquete original previo fue una hipótesis genérica; ESTE documento la sustituye para el alcance de producto. No se ha recuperado el código fuente original, de modo que no afirmes librerías originales específicas.

## Orden de lectura OBLIGATORIO
1. `docs/EVIDENCIA_DE_LOS_TRES_VIDEOS.md` (lo que realmente se ve)
2. `docs/ARQUITECTURA_INMOBILIARIA.md` (stack y sistemas propuestos)
3. `docs/BACKLOG_PRODUCTO_REAL.md` (prioridades y pruebas de aceptación)
4. `docs/LIBRERIAS_Y_VERIFICACION.md` (motor render 3D vs 360)
5. `docs/FUENTES_Y_LICENCIAS.md` (licencias; cualquier nota anterior que contradiga esta versión queda reemplazada)

## Resultado que necesito
Quiero una plataforma navegable para promocionar y vender propiedades desde web y pantallas táctiles:
- Home de promoción.
- Masterplan 3D de varias villas seleccionables con zoom/orbit.
- Resaltado visual de unidad y estado, ficha con precio/superficie/dormitorios y CTA.
- Tour 360 por estancias de la vivienda, flechas/hotspots y mini-plano SVG «Ir a un punto».
- Menú Inicio / Masterplan / Áreas / Unidades / Galería / Ubicación / Contacto.
- Mapa de emplazamiento con puntos de interés.
- Panel administrativo para cargar y actualizar propiedades, 360, GLB, hotspots y leads.
- Pipeline CAD/BIM -> assets de showroom como módulo separado y semi-automatizado, con procesamiento asíncrono y revisión manual. **No implementar una supuesta conversión DWG -> renders fotorrealistas automáticos en minutos sin validación.**

## Stack base que recomiendo investigar e implementar
Monorepo pnpm. Next.js/React/TypeScript para showroom y admin; `three` + `@react-three/fiber` + `@react-three/drei` para masterplan GLB; `marzipano` para tour 360 con tiles y escenas; `maplibre-gl` para ubicación; TanStack Query, Zustand y Zod para estado; Fastify o Nest + PostgreSQL + S3 + BullMQ/Redis para backoffice/pipeline. Blender CLI y FFmpeg opcionales para generación y conversión de assets, no en el critical path del primer MVP. Validar compatibilidad y licencias antes de fijar versiones.

## Primeras acciones concretas sin preguntar detalles adicionales
1. Leer todos los docs y dejar constancia de observación vs hipótesis.
2. Levantar monorepo con comandos reales de instalación/ejecución y tests automatizados.
3. Construir MVP con DOS demos (casa interior panorámica, masterplan de villas) con **assets propios o legales**, no capturas fingiendo interacción 3D. Pueden ser placeholders de licencia libre temporalmente, documentados.
4. Hacer masterplan GLB real con 8 villas primitivas si no hay assets; picking por ID; tarjeta unidad/estado; layout semejante al comportamiento observado, no copiar marca.
5. Crear tour 360 con 5 nodos de prueba, vista de plano, botones de habitación y hotspots navegables; si los panoramas no están disponibles, pedirlos solo como siguiente mejora y demostrar que el motor funciona con assets temporales.
6. Integrar rutas, filtros, formulario de lead con persistencia validada y CRUD admin con seed; si aún no hay backend, crear mocks tipados aislados y una fase posterior explícita.
7. Tests: Playwright de recorrido masterplan -> villa -> tour -> otra habitación -> ficha -> lead; accesibilidad teclado y touch; build estricto.
8. Documentar pantallas, decisiones ADR, source attribution, performance real y pruebas corridas; nunca reportar tests no ejecutados.

## Calidad requerida
Mobile/táctil (pinch, drag), pantallas de 1920px, carga progresiva, selección por raycasting, panoramas multires si aplica, estados `loading/error/empty`, tipado estricto, API clara, timestamps, estado comercial actualizado, RBAC/tenants, límites de tamaño de uploads, seguridad leads, cache/CDN.

## Restricción crítica de producto
NO priorices un editor Blender web con timeline/keyframes/materiales: ese alcance fue introducido en el paquete anterior por incertidumbre y NO surge de los videos. El software observado es un showroom / portal 3D de inmuebles. Separá frontend público, backoffice y pipeline de render/ingesta. No copiar marcas ni materiales de terceros.
