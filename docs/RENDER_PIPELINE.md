# Pipeline de render

## Estado actual
- `workers/render-processing` reclama jobs `RENDER` de la tabla `render_jobs` y renderiza con **Blender
  (Cycles)** cuando `BLENDER_PATH` apunta a un `blender` existente.
- Sin `BLENDER_PATH`, el job termina `FAILED` con el mensaje
  "No render backend configured (Blender CLI not available)". No se generan imágenes falsas.
- Los assets demo (panoramas y galería) los produce `packages/assets` con un ray-caster CPU propio. Es un
  generador de placeholders con licencia limpia, no un renderer fotorrealista.

## Flujo
1. En Admin se sube un GLB y se crea un job `RENDER` para ese asset (`POST /api/admin/jobs`).
2. El worker valida el asset (de la misma organización, `UPLOADED`, tipo `glb`) y lanza en un proceso hijo:
   `blender --background --factory-startup --python-exit-code 1 --python blender/render_panorama.py -- <args>`.
   El proceso tiene timeout (`RENDER_TIMEOUT_MINUTES`).
3. `render_panorama.py` importa el GLB, crea una cámara equirectangular y renderiza un panorama 2:1 en JPEG por
   cada punto de vista. Usa como cielo e iluminación el HDRI de `RENDER_HDRI` o, sin él, un cielo procedural
   (Nishita); tone mapping AgX y denoiser (OptiX en GPU NVIDIA, OpenImageDenoise en el resto).
4. Puntos de vista: cada objeto del GLB cuyo nombre empieza por `PANO_` (por ejemplo un *empty*
   `PANO_living` a 1,6 m del suelo). Su rotación Z fija el centro del panorama. Sin marcadores se renderiza una
   sola vista `overview` en el centro del modelo, a la altura de ojo. El masterplan demo trae tres marcadores
   (`PANO_Acceso`, `PANO_Mirador`, `PANO_Terraza_V6`) en el nodo `Viewpoints`.
5. Cada imagen se registra como un asset nuevo `UPLOADED` con su propio job `IMPORT`. El pipeline de
   importación existente la valida, genera la vista previa y la miniatura y crea el `PanoramaAsset`.
6. El job `RENDER` termina `REQUIRES_REVIEW`. Su `result` lista las vistas (`slug`, `assetId`, segundos), el
   dispositivo y la duración. Una persona revisa los panoramas antes de asignarlos a escenas del tour.

Con PGlite (desarrollo) el API arranca el worker de render dentro de su proceso solo si `BLENDER_PATH` es
válido. Con Postgres corre aparte: `pnpm --filter @synapse/render-worker start`.

## Configuración
| Variable | Por defecto | Uso |
|---|---|---|
| `BLENDER_PATH` | vacío | Ruta al ejecutable de Blender 4.5 LTS (4.4+ necesario para GPUs RTX 50) |
| `RENDER_DEVICE` | `OPTIX` | `OPTIX`, `CUDA`, `HIP`, `ONEAPI`, `METAL` o `CPU`. Si no hay dispositivo de ese tipo, el job falla con un mensaje explícito; no cae a CPU en silencio |
| `RENDER_WIDTH` | `4096` | Ancho del panorama (alto = ancho / 2), 512–16384 |
| `RENDER_SAMPLES` | `128` | Muestras de Cycles, 1–4096 |
| `RENDER_TIMEOUT_MINUTES` | `60` | Límite por job |
| `RENDER_HDRI` | vacío | Imagen `.hdr` equirectangular para cielo e iluminación. Si el archivo no existe se usa el cielo procedural |

HDRI recomendado (CC0, 20,7 MB, no versionado):
```bash
mkdir -p storage/hdri && curl -L -o storage/hdri/kloofendal_48d_partly_cloudy_puresky_4k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/kloofendal_48d_partly_cloudy_puresky_4k.hdr
```

Valores fuera de rango o desconocidos vuelven al valor por defecto.

## Requisitos operativos
- Blender instalado en la máquina del worker (GPL; se invoca como proceso externo, no se enlaza).
- GPU recomendada. La VM de Oracle no tiene GPU: el render corre en un PC con GPU contra la misma base de datos
  (Postgres) o en local con PGlite.
- Cola separada (`RENDER`) para no bloquear la ingesta.

## Limitaciones
- La calidad depende del modelo: materiales, texturas e iluminación interior vienen del GLB. El masterplan demo
  (villas primitivas) solo produce volúmenes simples.
- Sin teselado cubemap multirresolución todavía; el panorama se sirve como imagen equirectangular única.

## Rendimiento medido (Blender)
Blender 4.5.10 LTS en Windows 11 con NVIDIA GeForce RTX 5070 Ti Laptop GPU (12 GB). Escena: masterplan demo
(8 villas primitivas), vista `overview`. Tiempo de render de Cycles por imagen, informado por el script:

| Dispositivo | Resolución | Muestras | Render |
|---|---|---|---|
| OptiX (GPU) | 2048×1024 | 64 | 2,1 s |
| CPU | 2048×1024 | 64 | 10,1 s |
| OptiX (GPU) | 4096×2048 | 128 | 8,0 s |
| OptiX (GPU) | 8192×4096 | 256 | 53,5 s |

Con el GLB demo mejorado (fachadas con vidrio y madera, árboles redondos) y el HDRI de Poly Haven, cada una de
las tres vistas a 4096×2048 y 128 muestras tarda entre 9,6 y 10,9 s; el proceso completo, 33 s.

Arrancar Blender e importar el GLB añade unos 4 s por job (6,4 s de proceso total a 2048/64 en GPU). Una escena
con materiales y texturas reales tardará más; estos números sirven como base, no como promesa.

El tiempo de `pnpm assets:generate` (generador demo) está en `docs/PROGRESS.md`.
