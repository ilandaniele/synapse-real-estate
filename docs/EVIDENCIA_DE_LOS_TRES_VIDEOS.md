# Evidencia audiovisual — tres MP4 proporcionados por el usuario

## Método y límites
Se inspeccionaron visualmente muestras temporales cada 5 segundos de los tres archivos. La evidencia es captura de pantalla grabada con un móvil, no acceso al código fuente, tráfico de red ni inspector del navegador. Las marcas de tiempo son aproximadas. No se transcribió ni verificó el audio. Las atribuciones de librerías son hipótesis de ingeniería, no identificación forense.

## Identidad de los archivos (orden local de análisis)
- V1: `AQM3XdD_fPMHkFnl-Ow5VVUikjouTVO0MZjWn8NGEjoPhvi5IbqmXcCJPcH1mdXX3A2xJwhbx3Ms5JrV7YWOiUglLBlxmXGC 2.mp4` — 65.34 s, 512x910, 30 fps.
- V2: `AQPcbRylw8bcC9kIKPwHLJMnyPF3dMxm21BgovBsiuc6ux04McJJ78YpiwV0OJ-78Byg-9SbmYvywTEBqM7dGL2Mx5tePV5j.mp4` — 122.47 s, 512x910, 30 fps.
- V3: `Como potenciar tu estudio de arquitectura con la IA #ia #ai #arquitectura.mp4` — 88.97 s, 512x910, 30 fps.

No hay prueba de correspondencia uno-a-uno entre estos nombres y los tres enlaces de Instagram: identificar por contenido, no por el orden de los enlaces. V1 y V3 parecen mostrar el mismo sistema/escena arquitectónica, pero no se puede afirmar su procedencia o implementación común.

## V1 — De DWG a experiencia interior (0–65 s)
| Tiempo aprox. | Observación directa | Interpretación / nivel |
|---|---|---|
| 0–7 s | Texto «De archivo DWG a RENDER 3D en minutos», «Renders 3D realistas y navegables»; interfaz web con render de arquitectura | Se promociona un flujo DWG->3D; no se muestra el procesamiento real. Alto en texto, bajo en capacidad automática |
| 10 s | Modal «Ir a un punto», mini-plano y puntos/etiquetas de estancias | Navegación basada en hotspots / nodos. Alto |
| 15–35 s | Vistas de salón, escalera, comedor y ventanales; gestos del usuario y desplazamientos | Visor interactivo con panoramas enlazados o 3D real. Alto navegación, bajo motor |
| 40–50 s | Modal vuelve a abrirse y se elige otra estancia; aparece dormitorio | Navegación entre escenas/ambientes. Alto |
| 55–60 s | Vista de fachada/exterior y CTA | Experiencia interior-exterior. Alto |

## V2 — Showroom inmobiliario/masterplan (0–122 s)
| Tiempo aprox. | Observación directa | Interpretación / nivel |
|---|---|---|
| 0–25 s | Vista aérea inclinada y zoom de promoción de villas integrada en ladera | Masterplan renderizado e interactivo; puede ser 3D runtime, imágenes multivista o video pre-render. Medio |
| 25–38 s | Vista cenital, buscador «Buscar unidades», resaltado de parcelas verde/rojo, badges «Villa 7», «Villa 6», «Villa 5» | Selección por unidad/estado sincronizado con una base de datos o dataset. Alto en UI |
| 40–52 s | Ficha «Unidad Villa 6», etiqueta «Disponible», precio «895.000 €», botón «Solicitar información»; superficies y características | Página/ficha de inventario y lead comercial. Alto |
| 55–80 s | Planta amueblada, menú lateral con vistas/cámaras, escenas interiores, flechas de navegación, tira de miniaturas | Tour interior con hotspots, vistas y navegación por escenas. Alto |
| 80–95 s | Menú «OBRA NUEVA», secciones «Inicio», «Masterplan», «Áreas», «Unidades», «Galería», «Ubicación», «Contacto» | Plataforma de promoción inmobiliaria, múltiples secciones. Alto |
| 95–110 s | Mapa satelital con ruta/puntos y mini-tarjetas | Integración mapa geográfico / POIs. Alto en función, bajo en proveedor |
| 110–122 s | Retorno a masterplan | Navegación unificada entre vistas. Alto |

## V3 — Tour arquitectura interior (0–89 s)
| Tiempo aprox. | Observación directa | Interpretación / nivel |
|---|---|---|
| 0–7 s | «Renders 3D realistas y navegables», modal «Ir a un punto» | Coincide funcionalmente con V1. Alto |
| 7–18 s | Navegación por sala y cambios de orientación hacia ventanas/escalera | Manipulación de cámara u orientación de panorama. Alto en interacción |
| 20–25 s | Selección de punto en mini-plano | Salto entre habitaciones. Alto |
| 25–37 s | Recorrido por sala y comedor | Tour de interiores. Alto |
| 40–55 s | Selección en plano y cambio a dormitorio | Hotspots/escenas enlazadas. Alto |

## Deducciones importantes
1. No se prueba un motor específico: NO atribuir Three.js, Unreal, Unity, Blender, Marzipano, Pannellum, Cesium ni Google Maps sin inspección de red/código público.
2. No hay demostración verificable de importación DWG ni reconstrucción 3D autónoma en minutos. Es un claim en pantalla, sujeto a validación con archivo real.
3. No hay pruebas del origen de las imágenes fotorrealistas: pueden estar renderizadas offline y publicadas como panoramas/equirectangulares. No confundir calidad visual con renderizado 3D en tiempo real.
4. La UI podría ser web en pantalla táctil; no hay prueba suficiente de framework de frontend.
5. La app a construir debe tener tres partes separadas: backoffice de proyectos, frontend público showroom y pipeline de assets CAD/3D/360.

## Evidencia disponible
Consultar `referencias/v1_p1.jpg`, `v1_p2.jpg`, `v2_p1.jpg`, `v2_p2.jpg`, `v2_p3.jpg`, `v3_p1.jpg`, `v3_p2.jpg` (montajes de muestreo a 5 s). Originales aportados por el usuario están fuera del ZIP para evitar incluir 160 MB de video; pedirlos si el entorno de ejecución de Claude no tiene acceso.
