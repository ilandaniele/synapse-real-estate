# Fuentes técnicas y alcance de lo verificado

## Referencia objetivo (no inspeccionada)
- Instagram: https://www.instagram.com/p/DfsVPUIIpxv/
- Acceso: bloqueado o no indexado en la consulta externa efectuada el 14/11/2026. NO hay confirmación de las librerías originales.

## Tecnologías verificadas como opciones viables (NO identificadas como originales)
- React Three Fiber: https://r3f.docs.pmnd.rs/getting-started/introduction
  - Renderer de React sobre Three.js; versión v9 es la estable para React 19; v10 es alfa (noviembre 2026).
- Three.js: https://threejs.org/docs/
  - Motor de gráficos 3D browser y shaders, cámaras, materiales y geometrías.
- Drei: https://github.com/pmndrs/drei
  - Helpers para R3F, cámaras, controles y assets.
- React Postprocessing: https://github.com/pmndrs/react-postprocessing
  - Compositor de efectos para R3F.
- GSAP: https://gsap.com/docs/v3/GSAP/Timeline/
  - Secuenciación temporal; usar con prudencia si se exige export exacto por frame.
- FFmpeg: https://ffmpeg.org/documentation.html
  - Compresión y muxing de secuencia de frames.
- glTF 2.0: https://www.khronos.org/gltf/
  - Formato para assets de intercambio.
- Blender: https://docs.blender.org/manual/en/latest/
  - Editor/render offline opcional.
- Zustand: https://github.com/pmndrs/zustand
- Zod: https://zod.dev/
- Playwright: https://playwright.dev/

## Atención: “rae” no tiene identidad establecida
No hay URL específica suministrada para el “repositorio de rae”. Los siguientes repositorios **NO se han vinculado** con el video:
- https://github.com/shinyobjectz/raea — motor de videos/juegos con Rust, Bevy y React/TS; repo creado en octubre de 2026. Licencia FSL-1.1-ALv2 con limitación para crear un producto competidor antes del cambio de licencia. **No copiar su código si el objetivo es un competidor.**
- https://github.com/raedotzip/rae-noise — librería de efectos procedurales WebGL2, repo creado en abril de 2026; licencia Apache-2.0.

Aunque resulten interesantes técnicamente, **el parecido del nombre no los identifica como software del post**. Si el usuario entrega un repositorio concreto, inspeccionarlo y actualizar este documento.

## Uso legal y técnico
- Inspiración funcional y reimplementación independiente de mecanismos genéricos.
- No copiar imágenes, fuentes, modelos, datos, código privado, branding ni música sin licencia.
- Registrar copyright, licencia y fuente de assets incorporados; separar código original nuevo de upstream.
- Para producir un servicio competitivo, revisar restricciones de source-available (especialmente FSL) antes de reutilizar código.
