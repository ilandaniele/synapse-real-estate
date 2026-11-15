# Librerías 3D: hipótesis, alternativas y cómo verificar el stack original

## Lo que sabemos
Se ven panoramas o escenas visualmente fotorrealistas, cambios entre puntos de vista y zoom/orbit del desarrollo. No se ve código, Network tab, bundle JS, headers, canvas inspector ni repositorio que identifique motor o pipeline. Por eso ninguna librería 3D del creador está confirmada.

## Opciones recomendadas según necesidad
| Necesidad | Solución sugerida | Alternativa | Justificación |
|--|--|--|--|
| Panoramas arquitectónicos de alta calidad | `marzipano` | `@photo-sphere-viewer/core`, Pannellum | Visor 360 multiresolución, hotspots, tiles, carga progresiva |
| Masterplan real 3D | `three` + `@react-three/fiber` + `@react-three/drei` | Babylon.js, Three vanilla | GLB, picking/raycast, cámaras y shaders |
| Cámaras suaves | interpolación propia + GSAP | `camera-controls` | transiciones entre perspectivas |
| Compresión de modelos | `@gltf-transform/cli` + KTX2 + meshopt | gltfpack | Bajar bytes/tiempo a primera interacción |
| Postprocesado | `@react-three/postprocessing` | postprocessing | SSAO/bloom solo si aporta; coste FPS |
| Mapas | MapLibre GL JS | Mapbox/Google Maps autorizado | POI geográficos y vista satelital licenciada |
| Autoría 3D/fotorrealismo | Blender Cycles offline | Unreal/Twinmotion/D5/Enscape/V-Ray | render panorámico precalculado |
| CAD/BIM | IfcOpenShell, DXF parser, conversor DWG licenciado | plataforma BIM | la ingesta depende del formato; no infiere escena fotorrealista |

## Cómo identificar tecnologías originales si conseguimos la URL a la demo funcional
1. Abrir la aplicación **pública de prueba** en Chrome DevTools, Sources y Network y guardar un HAR sin datos personales.
2. Detectar `three`, `@react-three/fiber`, `babylon`, `marzipano`, `photo-sphere-viewer`, `pannellum`, `cesium`, `maplibre`, `mapbox-gl`, `unity`, `unreal` en paquetes publicados, sourcemaps autorizados, nombre de chunks y objetos globales (indicios, no siempre prueba).
3. Examinar requests de assets: `.glb`, `.gltf`, `.bin`, `.ktx2`, `.basis`, `.drc` implican modelos 3D; `.jpg`/`.webp` en cubefaces/tiles y `levels` sugieren visor 360; tiles XYZ/terrain/3D Tiles implican geovisualización.
4. Si existe repositorio público **del autor**: mirar `package.json`, lockfiles, imports, directorios `viewer`, `panorama`, `shaders`, `assets`, `server`, workflows. Citar ruta/commit, licencia.
5. Inspeccionar captura de interacción: movimiento libre con parallax geométrico vs rotación alrededor de un nodo. Solo rotar no prueba 360, pero cambios instantáneos entre puntos sugerirían nodos.
6. Publicar una matriz por tecnología: `Confirmada mediante paquete/import`, `Sugerida por asset/network`, `Posible solo por aspecto`, `Descartada`. No saltar de posibilidad a confirmación.

## Referencias open source verificables (NO son código del creador)
- https://github.com/pmndrs/react-three-fiber
- https://github.com/pmndrs/drei
- https://github.com/pmndrs/react-postprocessing
- https://github.com/google/model-viewer
- https://github.com/googlemaps/threejs-overlay-view (solo alternativa mapas)
- https://github.com/Marzipano/marzipano
- https://github.com/mistic100/Photo-Sphere-Viewer
- https://github.com/maplibre/maplibre-gl-js
- https://github.com/IfcOpenShell/IfcOpenShell
- https://github.com/donmccurdy/glTF-Transform
Consultar versiones, licencias y compatibilidad *al implementar*. No asegurar que estos proyectos o repositorios revelan el stack propietario.
