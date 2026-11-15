# Protocolo de ingeniería inversa responsable

## Límite de acceso actual
Fuente suministrada: https://www.instagram.com/p/DfsVPUIIpxv/
Intentos de lectura pública del post y variantes embed no permitieron obtener el video. No hay observación fiable de sus frames, UI o caption. Por lo tanto, **cualquier identificación de dependencias del autor sería especulativa**.

## A. Identificación del contenido
- Confirmar autor, nombre del software, web, repositorio exacto y licencia desde la descripción original, link-in-bio y perfiles públicos (si se pueden consultar).
- Capturar 6–12 fotogramas: vista inicial, acción principal, UI completa, transición, modo de edición, render final, exportación.
- Registrar por cada frame: timestamp, elemento visible, interacción, resultado esperado, render observable, evidencia de desktop/web/native, certeza y observaciones.
- Separar hechos visibles de hipótesis (ej.: ver sombras en un video **no demuestra** que se use Three.js).
- Extraer secuencia funcional: estado inicial -> input -> modificación de escena -> resultado -> export.

## B. Triangulación técnica
Indicios útiles (no pruebas concluyentes):
- Controles orbitables, inspector custom y URL visible: posible app WebGL/WebGPU.
- Unity/Unreal splash, menús nativos o depuradores: posible engine de juego.
- Paneles de Blender, colección/Outliner, Cycles/Eevee: posible autoría en Blender.
- Scene graph editado mientras el viewport reacciona: renderer interactivo real.
- Solo un video de cámara en movimiento: podría ser render offline o filmación pregrabada.

## C. Si se consigue el URL del repo original
1. Clonar localmente y registrar commit SHA + licencia.
2. Listar `package.json`, lockfiles, `Cargo.toml`, `pyproject.toml`, `requirements.txt`, configuración Vite/Next/Webpack/Electron/Tauri.
3. Localizar entrypoint del viewport y pipeline GPU: `Canvas`, `WebGLRenderer`, `WebGPURenderer`, `ShaderMaterial`, `RawShaderMaterial`, GLSL/WGSL, Bevy, wgpu, Babylon, Godot, Blender.
4. Buscar imports reales (no solo dependencias listadas), por ejemplo:
   ```bash
   rg -n 'from ["\x27](three|@react-three/fiber|@react-three/drei|babylonjs|gsap|@react-three/postprocessing)' .
   rg -n '(WebGLRenderer|WebGPURenderer|EffectComposer|InstancedMesh|GLTFLoader|ShaderMaterial|requestAnimationFrame|ffmpeg|renderFrame)' .
   rg --files | rg '(\.glsl$|\.vert$|\.frag$|\.wgsl$|\.blend$|\.glb$|Cargo\.toml$|package\.json$)'
   ```
5. Mapear UI, state management, engine, shaders, modelo, serialización, exportación y APIs externas.
6. Ejecutar tests y demo con los comandos documentados; inspeccionar Network y bundles si el software es web público y el análisis está permitido.
7. Comparar código observado contra las animaciones del post.
8. Crear `EVIDENCIA_TECNOLOGIAS.md` con columnas: componente, tecnología identificada, archivo/linea, evidencia, confianza, versión.
9. Respetar licencias; no reutilizar fuentes, modelos, código o marcas sin permiso.

## D. Si solo se dispone de la web desplegada
- DevTools > Network: JS bundles, `.glb`, `.gltf`, `.hdr`, `.ktx2`, `.wasm`, shaders, video pre-renderizado.
- DevTools > Sources: símbolos accesibles, source maps públicos, manifest.
- Buscar metadatos de framework y librerías sin atribuirlas únicamente por coincidencias indirectas.
- Inspeccionar Canvas: ¿se recalcula ante input o es un elemento `video`?
- Perf/Memory: FPS, draw calls, GPU timings cuando estén disponibles, allocation pressure.
- Un bundle minificado puede dar indicios, no necesariamente acceso a fuentes originales.

## E. Matriz de evidencia (llenar con video/repositorio real)
| Afirmación | Evidencia | Confianza | Estado |
| --- | --- | --- | --- |
| Software usa Three.js | No disponible | — | NO VERIFICADO |
| Software usa Blender | No disponible | — | NO VERIFICADO |
| Software usa GSAP | No disponible | — | NO VERIFICADO |
| Software es web interactiva | No disponible | — | NO VERIFICADO |
| Hay repositorio original del autor | URL exacta no disponible | — | NO VERIFICADO |

## F. Criterios de réplica
- **Funcional**: reproduzca inputs y outputs observables.
- **Visual**: capturas de la misma escena/cámara con diferencias revisadas manualmente o automatizadas.
- **Técnica**: no es necesario usar idénticas librerías para lograr la misma funcionalidad; priorizar licencia, estabilidad y calidad.
- **Ética/legal**: implementación propia y assets de uso permitido.
