# Pipeline CAD/BIM → assets de showroom

Módulo separado del showroom: `tools/cad-importer` (funciones puras) + `workers/asset-processing` (proceso
asíncrono). Nunca está en el camino crítico de una visita pública.

## Flujo
1. El admin pide un ticket de subida (`POST /api/v1/admin/assets/uploads`) con nombre, tamaño y tipo.
2. Sube el archivo con `PUT` a la URL firmada (10 min). El API verifica tamaño y **magic bytes**; si el
   contenido no coincide con un tipo permitido, borra el archivo y marca el asset `REJECTED`.
3. El admin crea un job `IMPORT` para el asset. Estado inicial `PENDING`.
4. El worker reclama el job (`FOR UPDATE SKIP LOCKED`), lo pasa a `PROCESSING` y escribe logs.
5. Resultado según formato (tabla). Errores inesperados reintentan con backoff (máx. 3 intentos).
6. Los resultados que generan datos de negocio (mapeos de mallas) quedan en `REQUIRES_REVIEW` hasta que
   una persona los aprueba en Admin → Jobs.

## Formatos

| Formato | Detección | Resultado automático | Estado final |
|---|---|---|---|
| GLB | `glTF` magic | Valida, lista nodos, sugiere mapeo `Villa_NN` → unidad | `REQUIRES_REVIEW` |
| glTF (JSON) | `{` + `"asset"` | Igual que GLB si los buffers están embebidos | `REQUIRES_REVIEW` |
| JPEG/PNG 2:1 | magic bytes | Preview 1024x512 + miniatura; registra `PanoramaAsset` | `COMPLETED` |
| JPEG/PNG no 2:1 | magic bytes | Rechazo: "Panorama must be 2:1 equirectangular" | `FAILED` |
| DXF | `0 SECTION` | Inspección: capas, cantidad de entidades, extensión. **No genera 3D** | `REQUIRES_REVIEW` |
| DWG | `AC10xx` | Mensaje: formato no soportado, exportar a GLB/glTF | `FAILED` |
| IFC | `ISO-10303-21` | Igual que DWG | `FAILED` |
| FBX / OBJ | firma / texto | Igual que DWG | `FAILED` |

## Lo que este pipeline NO hace
- No convierte DWG a 3D ni a renders fotorrealistas. DWG es un formato propietario; leerlo con fidelidad
  requiere librerías con licencia (ODA) o software de escritorio.
- No modela interiores, no asigna materiales ni ilumina escenas.
- No publica nada: todo resultado pasa por revisión y luego por una publicación explícita.

## Camino recomendado para un estudio
1. Modelar en la herramienta CAD/BIM habitual (Revit, ArchiCAD, SketchUp, Blender).
2. Exportar el masterplan a GLB nombrando el nodo raíz de cada unidad `Villa_NN` (o el código de unidad).
3. Renderizar panoramas equirect 2:1 (≥ 4096x2048) desde el motor de render del estudio.
4. Subir GLB y panoramas en Admin → Assets, revisar el job, aprobar mapeo, publicar.

## Extensión futura
- Adaptador IFC con `web-ifc` (MPL-2.0) para extraer volúmenes simples → GLB, con revisión manual.
- Conversión DXF 2D → extrusión de muros básica para maquetas, marcada como "boceto".
- Ambos requieren validación de licencia antes de incorporarse (ver `FUENTES_Y_LICENCIAS.md`).
